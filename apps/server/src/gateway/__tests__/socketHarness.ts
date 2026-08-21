import { vi, type MockInstance } from "vitest";
import path from "node:path";
import { SOCKET_EVENTS, toRuleSnapshot } from "@project/shared";
import { campaignMembers } from "@project/database/src/schema/operational.js";
import { assembleCoreRulePack } from "@project/database/src/corePackAssembler.js";
import { FakeDb } from "./fakeDb.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * Drives the websocket gateway without a network.
 *
 * `initializeWebSocketGateway` constructs its own `Server`, so the only way in
 * is to replace the `socket.io` module before importing it. Doing that here
 * also means the three emit targets the gateway uses stay distinguishable:
 *
 *   socket.emit(...)        -> the sender only        (errors, rollbacks)
 *   socket.to(room).emit()  -> the room minus sender  (optimistic broadcasts)
 *   io.to(room).emit(...)   -> the room incl. sender  (authoritative replies)
 *
 * Collapsing those into one recorder would hide a real class of bug, so they
 * are recorded separately.
 */

export type EmitRecord = { event: string; payload: unknown };
export type RoomEmitRecord = EmitRecord & { room: string };

type Handler = (payload: unknown) => unknown;

export interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  handlers: Map<string, Handler>;
  on: (event: string, handler: Handler) => void;
  join: MockInstance<(room: string) => void>;
  emit: MockInstance<(event: string, payload?: unknown) => void>;
  to: MockInstance<(room: string) => { emit: (e: string, p?: unknown) => void }>;
  /** socket.emit(...) - reached the sender alone. */
  senderEmits: EmitRecord[];
  /** socket.to(room).emit(...) - reached the room but not the sender. */
  roomEmits: RoomEmitRecord[];
  /** Invokes a bound handler as if the client had sent the event. */
  dispatch: (event: string, payload?: unknown) => Promise<void>;
  /** Event names this socket has listeners bound for. */
  boundEvents: () => string[];
}

export interface GatewayHarness {
  /** The first connected socket - what most tests drive. */
  socket: FakeSocket;
  /** Sends an event to the default socket's handler and awaits it. */
  emit: (event: string, payload?: unknown) => Promise<void>;
  /** socket.emit records for the default socket. */
  senderEmits: EmitRecord[];
  /** socket.to(room).emit records for the default socket. */
  roomEmits: RoomEmitRecord[];
  /** io.to(room).emit records - shared by every socket on this server. */
  ioEmits: RoomEmitRecord[];
  /** Options the gateway passed to `new Server(...)`. */
  serverOptions: unknown;
  db: FakeDb;
  /** Connects an additional socket to the same gateway instance. */
  connect: (options?: ConnectOptions) => FakeSocket;
  consoleError: MockInstance<typeof console.error>;
  consoleLog: MockInstance<typeof console.log>;
  /** Restores the console spies. Safe to call more than once. */
  restore: () => void;
}

export interface ConnectOptions {
  socketId?: string;
  /** handshake.auth.userId. Pass null to simulate an unauthenticated socket. */
  userId?: string | null;
  /** handshake.headers["x-tester-id"] fallback. */
  testerId?: string;
}

export interface SetupOptions extends ConnectOptions {
  /** Seeded before the gateway is imported, so connection-time reads see it. */
  seed?: (db: FakeDb) => void;
}

let socketCounter = 0;

const createFakeSocket = (
  options: ConnectOptions,
  ioEmits: RoomEmitRecord[],
): FakeSocket => {
  const senderEmits: EmitRecord[] = [];
  const roomEmits: RoomEmitRecord[] = [];
  const handlers = new Map<string, Handler>();

  socketCounter += 1;
  const id = options.socketId ?? `socket-${socketCounter}`;

  const auth: Record<string, unknown> = {};
  // `undefined` means "not supplied, use the default"; `null` means
  // "deliberately absent", which is how the unauthenticated case is written.
  if (options.userId === undefined) {
    auth["userId"] = "user-1";
  } else if (options.userId !== null) {
    auth["userId"] = options.userId;
  }

  const headers: Record<string, unknown> = {};
  if (options.testerId !== undefined) {
    headers["x-tester-id"] = options.testerId;
  }

  const socket: FakeSocket = {
    id,
    data: {},
    handshake: { auth, headers },
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
    join: vi.fn((_room: string) => undefined),
    emit: vi.fn((event: string, payload?: unknown) => {
      senderEmits.push({ event, payload });
    }),
    to: vi.fn((room: string) => ({
      emit: (event: string, payload?: unknown) => {
        roomEmits.push({ room, event, payload });
      },
    })),
    senderEmits,
    roomEmits,
    dispatch: async (event, payload) => {
      const handler = handlers.get(event);
      if (!handler) {
        throw new Error(
          `No handler bound for "${event}". Bound events: ${[...handlers.keys()].join(", ")}`,
        );
      }
      await handler(payload);
    },
    boundEvents: () => [...handlers.keys()],
  };

  void ioEmits;
  return socket;
};

/**
 * Imports a fresh copy of the gateway with `socket.io` and the database
 * replaced, connects one socket, and hands back the recorders.
 *
 * The reset matters beyond ordinary isolation: the gateway caches
 * authoritative per-character runtime in a module-level Map, so without a
 * fresh module every test would inherit the previous test's combat state.
 */
export const setupGateway = async (
  options: SetupOptions = {},
): Promise<GatewayHarness> => {
  vi.resetModules();

  const db = new FakeDb();
  options.seed?.(db);

  const ioEmits: RoomEmitRecord[] = [];
  let connectionHandler: ((socket: FakeSocket) => void) | null = null;
  let serverOptions: unknown;

  class FakeServer {
    constructor(_httpServer: unknown, serverOpts: unknown) {
      serverOptions = serverOpts;
    }

    on(event: string, handler: (socket: FakeSocket) => void) {
      if (event === "connection") {
        connectionHandler = handler;
      }
    }

    to(room: string) {
      return {
        emit: (event: string, payload?: unknown) => {
          ioEmits.push({ room, event, payload });
        },
      };
    }
  }

  vi.doMock("socket.io", () => ({
    Server: FakeServer,
    // socket.ts imports Socket as a type only, but the runtime import list
    // still resolves it, so it has to exist on the mocked module.
    Socket: class {},
  }));

  vi.doMock("@project/database", () => ({ db }));

  // The rest handler resolves resource rules through the snapshot cache, which
  // reads core_rule_packs.payload - a table the fake db does not carry. Serve
  // the real shipped pack instead, so a rest resolves against the same rules
  // production would use rather than against nothing.
  const pack = await assembleCoreRulePack(PACK_DIR);
  vi.doMock("../../services/ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: async () => ({
      cacheVersion: 1,
      loadedAt: Date.now(),
      snapshot: {
        equipmentById: {},
        itemsById: {},
        weaponsById: {},
        resourcesById: Object.fromEntries(
          pack.resources.map((resource) => [resource.id, resource]),
        ),
        ...toRuleSnapshot(pack),
      },
    }),
    invalidateRuleSnapshotCache: () => undefined,
  }));

  const consoleLog = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  const { initializeWebSocketGateway } = await import("../socket.js");
  initializeWebSocketGateway({});

  if (!connectionHandler) {
    throw new Error("Gateway never registered an io 'connection' handler.");
  }
  const onConnection = connectionHandler as (socket: FakeSocket) => void;

  const connect = (connectOptions: ConnectOptions = {}): FakeSocket => {
    const socket = createFakeSocket(connectOptions, ioEmits);
    onConnection(socket);
    return socket;
  };

  const socket = connect(options);

  return {
    socket,
    emit: (event, payload) => socket.dispatch(event, payload),
    senderEmits: socket.senderEmits,
    roomEmits: socket.roomEmits,
    ioEmits,
    serverOptions,
    db,
    connect,
    consoleError,
    consoleLog,
    restore: () => {
      consoleLog.mockRestore();
      consoleError.mockRestore();
    },
  };
};

/**
 * Puts a socket into the joined state the way a real client gets there -
 * through ROOM_JOIN and the real membership check - then clears the
 * recorders so the test's own assertions start from empty.
 *
 * Going through the real handler rather than assigning socket.data keeps
 * these suites honest about the precondition every other handler relies on.
 */
export const joinCampaign = async (
  harness: GatewayHarness,
  campaignId = "camp-1",
  socket: FakeSocket = harness.socket,
): Promise<void> => {
  harness.db.seed(campaignMembers, [{ role: "player" }]);
  await socket.dispatch(SOCKET_EVENTS.ROOM_JOIN, { campaignId });

  if (socket.data["campaignId"] !== campaignId) {
    throw new Error(
      `joinCampaign failed: socket context is ${JSON.stringify(socket.data)}`,
    );
  }

  socket.senderEmits.length = 0;
  socket.roomEmits.length = 0;
  harness.ioEmits.length = 0;
  harness.db.ops.length = 0;
  socket.join.mockClear();
};

/** Rows shaped the way `getAuthoritativeRuntimeContext` reads `characters`. */
export const characterRow = (overrides: Record<string, unknown> = {}) => ({
  campaignId: "camp-1",
  raceId: "race_dwarf",
  subraceId: "sub_hill_dwarf",
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 8,
  currentHp: 20,
  maxHp: 24,
  ...overrides,
});

/** A row shaped the way the gateway reads `character_inventory`. */
export const inventoryRow = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  itemId: "item_weapon_longsword",
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
  customName: null,
  containerId: null,
  ...overrides,
});
