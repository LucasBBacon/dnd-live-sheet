import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as operationalSchema from "./schema/operational.js";
import * as referenceSchema from "./schema/reference.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
const schema = {
  ...operationalSchema,
  ...referenceSchema,
};

let initializedDb: ReturnType<typeof drizzle> | null = null;

const createDatabase = () => {
  if (initializedDb) {
    return initializedDb;
  }

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  initializedDb = drizzle(postgres(connectionString), { schema });
  return initializedDb;
};

const createLazyDatabaseProxy = <T extends object>(): T =>
  new Proxy({} as T, {
    get(_target, prop, receiver) {
      const database = createDatabase();
      const value = Reflect.get(database as object, prop, receiver);

      if (typeof value === "function") {
        return value.bind(database);
      }

      return value;
    },
    has(_target, prop) {
      return prop in createDatabase();
    },
    ownKeys() {
      return Reflect.ownKeys(createDatabase());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(createDatabase(), prop);
    },
  });

export const db = createLazyDatabaseProxy<ReturnType<typeof createDatabase>>();
