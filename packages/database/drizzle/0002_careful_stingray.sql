CREATE TYPE "public"."campaign_role" AS ENUM('owner', 'dm', 'player');--> statement-breakpoint
CREATE TYPE "public"."rest_condition" AS ENUM('short_rest', 'long_rest', 'long_rest_half', 'dawn', 'never');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_by_user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "characters" CASCADE;--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"campaign_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"role" "campaign_role" DEFAULT 'player' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_members_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"level" integer NOT NULL,
	"race_id" varchar(100) NOT NULL,
	"subrace_id" varchar(100) NOT NULL,
	"str" integer NOT NULL,
	"dex" integer NOT NULL,
	"con" integer NOT NULL,
	"int" integer NOT NULL,
	"wis" integer NOT NULL,
	"cha" integer NOT NULL,
	"alignment" varchar(50) NOT NULL,
	"background_id" varchar(100),
	"custom_background_data" jsonb,
	"personality_traits" text,
	"ideals" text,
	"bonds" text,
	"flaws" text,
	"current_hp" integer,
	"max_hp" integer,
	"temporary_inventory" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "character_classes" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"class_id" varchar(100) NOT NULL,
	"class_level" integer DEFAULT 1 NOT NULL,
	"subclass_id" varchar(100),
	CONSTRAINT "character_classes_character_id_class_id_pk" PRIMARY KEY("character_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "character_custom_traits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	"source_origin" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_inventory" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" varchar(100) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"slot" varchar(50) DEFAULT 'backpack' NOT NULL,
	"is_attuned" boolean DEFAULT false NOT NULL,
	CONSTRAINT "character_inventory_character_id_item_id_pk" PRIMARY KEY("character_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "character_resources" (
	"id" varchar(100) NOT NULL,
	"character_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"max" integer DEFAULT 0 NOT NULL,
	"reset_condition" "rest_condition" DEFAULT 'never' NOT NULL,
	CONSTRAINT "character_resources_character_id_id_pk" PRIMARY KEY("character_id","id")
);
--> statement-breakpoint
CREATE TABLE "character_traits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	"source" varchar(100) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_subclass_id_subclasses_id_fk" FOREIGN KEY ("subclass_id") REFERENCES "public"."subclasses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_custom_traits" ADD CONSTRAINT "character_custom_traits_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_custom_traits" ADD CONSTRAINT "character_custom_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_resources" ADD CONSTRAINT "character_resources_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_traits" ADD CONSTRAINT "character_traits_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_classes_id_idx" ON "character_classes" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_inventory_id_idx" ON "character_inventory" USING btree ("id");--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_subrace_id_subraces_id_fk" FOREIGN KEY ("subrace_id") REFERENCES "public"."subraces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_background_id_backgrounds_id_fk" FOREIGN KEY ("background_id") REFERENCES "public"."backgrounds"("id") ON DELETE no action ON UPDATE no action;