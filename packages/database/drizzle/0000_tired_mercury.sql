CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"total_level" integer DEFAULT 1 NOT NULL,
	"current_hp" integer NOT NULL,
	"engine_data" jsonb NOT NULL,
	"flavor_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_character_idx" ON "characters" USING btree ("user_id") WHERE "characters"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "engine_data_gin_idx" ON "characters" USING gin ("engine_data");