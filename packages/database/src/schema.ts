import {
  integer,
  jsonb,
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { CharacterEngineData } from "@project/shared";
import { isNull } from "drizzle-orm";

// define the flavor type (or import from shared) to type the JSONB col
export type CharacterFlavorData = {
  name: string;
  alignment?: string;
  eyeColor?: string;
  backstory?: string;
};

export const characters = pgTable(
  "characters",
  {
    // primary keys & relations
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),

    // top-level queryable mechanics
    // pull these out of the JSONB so these can easily index and query them in the DB
    // like finding all lvl 5 chars or chars with 0 HP
    totalLevel: integer("total_level").default(1).notNull(),
    currentHp: integer("current_hp").notNull(),

    // complex engine state (strictly bound to Zod inference type)
    engineData: jsonb("engine_data").$type<CharacterEngineData>().notNull(),

    // non-flavor state
    flavorData: jsonb("flavor_data").$type<CharacterFlavorData>().notNull(),

    // audit trails
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    // ensure strict 1:1 mapping for phase 1 beta testers
    singleCharacterIdx: uniqueIndex("user_single_character_idx")
      .on(table.userId)
      .where(isNull(table.deletedAt)),
    engineDatGinIdx: index("engine_data_gin_idx").using(
      "gin",
      table.engineData,
    ),
  }),
);
