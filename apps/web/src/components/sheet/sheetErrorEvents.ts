import { SOCKET_EVENTS } from "@project/shared";

/**
 * The `action_error` events the sheet actually shows.
 *
 * The gateway reports an error for every handler, but anything outside this
 * list is received and dropped, so an omission fails as silence rather than as
 * a visible bug - which is exactly what happened to ROOM_JOIN. Stating the
 * policy in one place is what makes that reviewable.
 *
 * ROOM_JOIN reports that the character could not be bound to the campaign.
 * It surfaces on the inventory banner because an unbound character is what an
 * empty inventory means here; a page-level treatment would say it better.
 *
 * RESOURCE_CONSUMED is listed because a refused spend must be put back, not
 * only reported: resolveActionError below turns this event's echoed payload
 * into a rollback instruction rather than just a notice (#71).
 */
export const SHEET_ERROR_EVENTS: string[] = [
  SOCKET_EVENTS.ITEM_EQUIPPED,
  SOCKET_EVENTS.ITEM_CONSUMED,
  SOCKET_EVENTS.ITEM_ATTUNED,
  SOCKET_EVENTS.ROOM_JOIN,
  SOCKET_EVENTS.RESOURCE_CONSUMED,
];

/**
 * What the sheet should do about an `action_error`.
 *
 * A pure decision, kept out of LiveSheetProvider so it can be tested without
 * a socket: the provider imports the socketService singleton directly, so the
 * routing was previously reachable only end to end.
 */
export type ActionErrorOutcome =
  | { kind: "ignore" }
  | { kind: "notice"; text: string }
  | {
      kind: "rollback-resource";
      text: string;
      characterId: string;
      resourceId: string;
      amount: number;
    };

/** The echoed payload a refused RESOURCE_CONSUMED carries back. */
const isRefusedSpend = (
  payload: unknown,
): payload is { characterId: string; resourceId: string; amount: number } => {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate["characterId"] === "string" &&
    typeof candidate["resourceId"] === "string" &&
    typeof candidate["amount"] === "number"
  );
};

/**
 * @param payload The gateway's action_error, whose `event` is optional on the
 *   wire and whose echoed `payload` is untyped
 * @returns What the sheet should do: nothing, show a notice, or put a refused
 *   spend back before showing one (#71)
 */
export const resolveActionError = (payload: {
  event?: string;
  error: string;
  payload?: unknown;
}): ActionErrorOutcome => {
  if (!payload.event || !SHEET_ERROR_EVENTS.includes(payload.event)) {
    return { kind: "ignore" };
  }

  if (
    payload.event === SOCKET_EVENTS.RESOURCE_CONSUMED &&
    isRefusedSpend(payload.payload)
  ) {
    return {
      kind: "rollback-resource",
      text: payload.error,
      characterId: payload.payload.characterId,
      resourceId: payload.payload.resourceId,
      amount: payload.payload.amount,
    };
  }

  return { kind: "notice", text: payload.error };
};
