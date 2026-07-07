import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as operationalSchema from "./schema/operational.js";
import * as referenceSchema from "./schema/reference.js";

dotenv.config({ path: "../../.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const client = postgres(connectionString);
const schema = {
  ...operationalSchema,
  ...referenceSchema,
};
export const db = drizzle(client, { schema });
