CREATE TYPE "public"."reference_source_type" AS ENUM('core', 'homebrew');--> statement-breakpoint
CREATE TABLE "background_traits" (
	"background_id" varchar(100) NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	CONSTRAINT "background_traits_background_id_trait_id_pk" PRIMARY KEY("background_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "backgrounds" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"feature_name" varchar(255) NOT NULL,
	"feature_description" text NOT NULL,
	"ideals" jsonb NOT NULL,
	"bonds" jsonb NOT NULL,
	"flaws" jsonb NOT NULL,
	"personality_traits" jsonb NOT NULL,
	"starting_equipment" jsonb NOT NULL,
	"lore" jsonb NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "backgrounds_core_scope_check" CHECK ((
      ("backgrounds"."source_type" = 'core' AND "backgrounds"."owner_campaign_id" IS NULL AND "backgrounds"."owner_character_id" IS NULL AND "backgrounds"."created_by_user_id" IS NULL AND "backgrounds"."is_published" = true)
      OR
      ("backgrounds"."source_type" = 'homebrew' AND "backgrounds"."created_by_user_id" IS NOT NULL AND "backgrounds"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "backgrounds_character_scope_check" CHECK ("backgrounds"."owner_character_id" IS NULL OR "backgrounds"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "bundle_contents" (
	"bundle_id" varchar(100) NOT NULL,
	"item_id" varchar(100) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bundle_contents_bundle_id_item_id_pk" PRIMARY KEY("bundle_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "class_levels" (
	"class_id" varchar(100) NOT NULL,
	"level" integer NOT NULL,
	"class_specific_scaling" jsonb,
	"spellcasting_progression" jsonb,
	CONSTRAINT "class_levels_class_id_level_pk" PRIMARY KEY("class_id","level")
);
--> statement-breakpoint
CREATE TABLE "class_multiclass_traits" (
	"class_id" varchar(100) NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	CONSTRAINT "class_multiclass_traits_class_id_trait_id_pk" PRIMARY KEY("class_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "class_progressions" (
	"class_id" varchar(100) NOT NULL,
	"level" integer NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	CONSTRAINT "class_progressions_class_id_level_trait_id_pk" PRIMARY KEY("class_id","level","trait_id"),
	CONSTRAINT "class_progressions_core_scope_check" CHECK ((
      ("class_progressions"."source_type" = 'core' AND "class_progressions"."owner_campaign_id" IS NULL AND "class_progressions"."owner_character_id" IS NULL AND "class_progressions"."created_by_user_id" IS NULL AND "class_progressions"."is_published" = true)
      OR
      ("class_progressions"."source_type" = 'homebrew' AND "class_progressions"."created_by_user_id" IS NOT NULL AND "class_progressions"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "class_progressions_character_scope_check" CHECK ("class_progressions"."owner_character_id" IS NULL OR "class_progressions"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"hit_die" integer NOT NULL,
	"subclass_req_level" integer NOT NULL,
	"lore" jsonb NOT NULL,
	"starting_equipment" jsonb NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "classes_core_scope_check" CHECK ((
      ("classes"."source_type" = 'core' AND "classes"."owner_campaign_id" IS NULL AND "classes"."owner_character_id" IS NULL AND "classes"."created_by_user_id" IS NULL AND "classes"."is_published" = true)
      OR
      ("classes"."source_type" = 'homebrew' AND "classes"."created_by_user_id" IS NOT NULL AND "classes"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "classes_character_scope_check" CHECK ("classes"."owner_character_id" IS NULL OR "classes"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "feat_prerequisites" (
	"feat_id" varchar(100) NOT NULL,
	"required_feat_id" varchar(100) NOT NULL,
	CONSTRAINT "feat_prerequisites_feat_id_required_feat_id_pk" PRIMARY KEY("feat_id","required_feat_id")
);
--> statement-breakpoint
CREATE TABLE "feat_traits" (
	"feat_id" varchar(100) NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	CONSTRAINT "feat_traits_feat_id_trait_id_pk" PRIMARY KEY("feat_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "feats" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(50) NOT NULL,
	"source" varchar(100),
	"repeatable" boolean DEFAULT false NOT NULL,
	"lore" jsonb NOT NULL,
	"prerequisites" jsonb,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "feats_core_scope_check" CHECK ((
      ("feats"."source_type" = 'core' AND "feats"."owner_campaign_id" IS NULL AND "feats"."owner_character_id" IS NULL AND "feats"."created_by_user_id" IS NULL AND "feats"."is_published" = true)
      OR
      ("feats"."source_type" = 'homebrew' AND "feats"."created_by_user_id" IS NOT NULL AND "feats"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "feats_character_scope_check" CHECK ("feats"."owner_character_id" IS NULL OR "feats"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"is_bundle" boolean DEFAULT false NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "items_core_scope_check" CHECK ((
      ("items"."source_type" = 'core' AND "items"."owner_campaign_id" IS NULL AND "items"."owner_character_id" IS NULL AND "items"."created_by_user_id" IS NULL AND "items"."is_published" = true)
      OR
      ("items"."source_type" = 'homebrew' AND "items"."created_by_user_id" IS NOT NULL AND "items"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "items_character_scope_check" CHECK ("items"."owner_character_id" IS NULL OR "items"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "race_traits" (
	"race_id" varchar(100) NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	CONSTRAINT "race_traits_race_id_trait_id_pk" PRIMARY KEY("race_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"speed" integer NOT NULL,
	"requires_subrace" boolean DEFAULT false NOT NULL,
	"display_label" varchar(255),
	"lore" jsonb NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "races_core_scope_check" CHECK ((
      ("races"."source_type" = 'core' AND "races"."owner_campaign_id" IS NULL AND "races"."owner_character_id" IS NULL AND "races"."created_by_user_id" IS NULL AND "races"."is_published" = true)
      OR
      ("races"."source_type" = 'homebrew' AND "races"."created_by_user_id" IS NOT NULL AND "races"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "races_character_scope_check" CHECK ("races"."owner_character_id" IS NULL OR "races"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "subclass_levels" (
	"subclass_id" varchar(100) NOT NULL,
	"level" integer NOT NULL,
	"subclass_specific_scaling" jsonb,
	"bonus_spells" jsonb,
	"spells_added_to_list" jsonb,
	CONSTRAINT "subclass_levels_subclass_id_level_pk" PRIMARY KEY("subclass_id","level")
);
--> statement-breakpoint
CREATE TABLE "subclass_progressions" (
	"subclass_id" varchar(100) NOT NULL,
	"level" integer NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subclass_progressions_subclass_id_level_trait_id_pk" PRIMARY KEY("subclass_id","level","trait_id"),
	CONSTRAINT "subclass_progressions_core_scope_check" CHECK ((
      ("subclass_progressions"."source_type" = 'core' AND "subclass_progressions"."owner_campaign_id" IS NULL AND "subclass_progressions"."owner_character_id" IS NULL AND "subclass_progressions"."created_by_user_id" IS NULL AND "subclass_progressions"."is_published" = true)
      OR
      ("subclass_progressions"."source_type" = 'homebrew' AND "subclass_progressions"."created_by_user_id" IS NOT NULL AND "subclass_progressions"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "subclass_progressions_character_scope_check" CHECK ("subclass_progressions"."owner_character_id" IS NULL OR "subclass_progressions"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "subclasses" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"parent_class_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"lore" jsonb NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "subclasses_core_scope_check" CHECK ((
      ("subclasses"."source_type" = 'core' AND "subclasses"."owner_campaign_id" IS NULL AND "subclasses"."owner_character_id" IS NULL AND "subclasses"."created_by_user_id" IS NULL AND "subclasses"."is_published" = true)
      OR
      ("subclasses"."source_type" = 'homebrew' AND "subclasses"."created_by_user_id" IS NOT NULL AND "subclasses"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "subclasses_character_scope_check" CHECK ("subclasses"."owner_character_id" IS NULL OR "subclasses"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "subrace_traits" (
	"subrace_id" varchar(100) NOT NULL,
	"trait_id" varchar(100) NOT NULL,
	CONSTRAINT "subrace_traits_subrace_id_trait_id_pk" PRIMARY KEY("subrace_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "subraces" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"parent_race_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"lore" jsonb NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "subraces_core_scope_check" CHECK ((
      ("subraces"."source_type" = 'core' AND "subraces"."owner_campaign_id" IS NULL AND "subraces"."owner_character_id" IS NULL AND "subraces"."created_by_user_id" IS NULL AND "subraces"."is_published" = true)
      OR
      ("subraces"."source_type" = 'homebrew' AND "subraces"."created_by_user_id" IS NOT NULL AND "subraces"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "subraces_character_scope_check" CHECK ("subraces"."owner_character_id" IS NULL OR "subraces"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "traits" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"lore" jsonb NOT NULL,
	"effects" jsonb NOT NULL,
	"is_starting_proficiency" boolean DEFAULT false NOT NULL,
	"source_type" "reference_source_type" DEFAULT 'core' NOT NULL,
	"owner_campaign_id" uuid,
	"owner_character_id" uuid,
	"created_by_user_id" varchar(255),
	"is_published" boolean DEFAULT true NOT NULL,
	"supersedes_id" varchar(100),
	CONSTRAINT "traits_core_scope_check" CHECK ((
      ("traits"."source_type" = 'core' AND "traits"."owner_campaign_id" IS NULL AND "traits"."owner_character_id" IS NULL AND "traits"."created_by_user_id" IS NULL AND "traits"."is_published" = true)
      OR
      ("traits"."source_type" = 'homebrew' AND "traits"."created_by_user_id" IS NOT NULL AND "traits"."owner_campaign_id" IS NOT NULL)
    )),
	CONSTRAINT "traits_character_scope_check" CHECK ("traits"."owner_character_id" IS NULL OR "traits"."owner_campaign_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "background_traits" ADD CONSTRAINT "background_traits_background_id_backgrounds_id_fk" FOREIGN KEY ("background_id") REFERENCES "public"."backgrounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_traits" ADD CONSTRAINT "background_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_contents" ADD CONSTRAINT "bundle_contents_bundle_id_items_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_contents" ADD CONSTRAINT "bundle_contents_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_multiclass_traits" ADD CONSTRAINT "class_multiclass_traits_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_multiclass_traits" ADD CONSTRAINT "class_multiclass_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_progressions" ADD CONSTRAINT "class_progressions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_progressions" ADD CONSTRAINT "class_progressions_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_prerequisites" ADD CONSTRAINT "feat_prerequisites_feat_id_feats_id_fk" FOREIGN KEY ("feat_id") REFERENCES "public"."feats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_prerequisites" ADD CONSTRAINT "feat_prerequisites_required_feat_id_feats_id_fk" FOREIGN KEY ("required_feat_id") REFERENCES "public"."feats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_traits" ADD CONSTRAINT "feat_traits_feat_id_feats_id_fk" FOREIGN KEY ("feat_id") REFERENCES "public"."feats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_traits" ADD CONSTRAINT "feat_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_traits" ADD CONSTRAINT "race_traits_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_traits" ADD CONSTRAINT "race_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclass_levels" ADD CONSTRAINT "subclass_levels_subclass_id_subclasses_id_fk" FOREIGN KEY ("subclass_id") REFERENCES "public"."subclasses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclass_progressions" ADD CONSTRAINT "subclass_progressions_subclass_id_subclasses_id_fk" FOREIGN KEY ("subclass_id") REFERENCES "public"."subclasses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclass_progressions" ADD CONSTRAINT "subclass_progressions_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclasses" ADD CONSTRAINT "subclasses_parent_class_id_classes_id_fk" FOREIGN KEY ("parent_class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrace_traits" ADD CONSTRAINT "subrace_traits_subrace_id_subraces_id_fk" FOREIGN KEY ("subrace_id") REFERENCES "public"."subraces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrace_traits" ADD CONSTRAINT "subrace_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subraces" ADD CONSTRAINT "subraces_parent_race_id_races_id_fk" FOREIGN KEY ("parent_race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;