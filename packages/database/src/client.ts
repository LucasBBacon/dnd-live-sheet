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

const createMissingDatabaseProxy = <T extends object>(message: string): T =>
  new Proxy({} as T, {
    get() {
      throw new Error(message);
    },
  });

const initializedDb = connectionString
  ? drizzle(postgres(connectionString), { schema })
  : null;

export const db = (initializedDb ??
  createMissingDatabaseProxy<NonNullable<typeof initializedDb>>(
    "DATABASE_URL is missing",
  )) as NonNullable<typeof initializedDb>;
