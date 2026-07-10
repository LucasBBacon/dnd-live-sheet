ALTER TABLE "traits" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "traits" ADD COLUMN "pack_version" integer;
ALTER TABLE "traits" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "feats" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "feats" ADD COLUMN "pack_version" integer;
ALTER TABLE "feats" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "races" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "races" ADD COLUMN "pack_version" integer;
ALTER TABLE "races" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "subraces" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "subraces" ADD COLUMN "pack_version" integer;
ALTER TABLE "subraces" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "classes" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "classes" ADD COLUMN "pack_version" integer;
ALTER TABLE "classes" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "subclasses" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "subclasses" ADD COLUMN "pack_version" integer;
ALTER TABLE "subclasses" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "class_progressions" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "class_progressions" ADD COLUMN "pack_version" integer;
ALTER TABLE "class_progressions" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "subclass_progressions" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "subclass_progressions" ADD COLUMN "pack_version" integer;
ALTER TABLE "subclass_progressions" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "backgrounds" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "backgrounds" ADD COLUMN "pack_version" integer;
ALTER TABLE "backgrounds" ADD COLUMN "published_at" timestamp with time zone;

ALTER TABLE "items" ADD COLUMN "pack_id" varchar(100);
ALTER TABLE "items" ADD COLUMN "pack_version" integer;
ALTER TABLE "items" ADD COLUMN "published_at" timestamp with time zone;

CREATE TYPE "import_run_status" AS ENUM ('staged', 'validated', 'planned', 'applied', 'failed');
CREATE TYPE "import_row_status" AS ENUM ('pending', 'validated', 'applied', 'failed', 'skipped');
CREATE TYPE "import_issue_severity" AS ENUM ('info', 'warning', 'error');

CREATE TABLE "import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pack_id" varchar(100) NOT NULL,
  "pack_version" integer DEFAULT 1 NOT NULL,
  "schema_version" varchar(32) NOT NULL,
  "source_type" "reference_source_type" NOT NULL,
  "owner_campaign_id" uuid,
  "owner_character_id" uuid,
  "created_by_user_id" varchar(255),
  "publish_mode" varchar(32) NOT NULL,
  "conflict_policy" varchar(32) NOT NULL,
  "id_policy" varchar(32) NOT NULL,
  "checksum" varchar(128),
  "status" "import_run_status" DEFAULT 'staged' NOT NULL,
  "staged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "total_entity_rows" integer DEFAULT 0 NOT NULL,
  "total_relation_rows" integer DEFAULT 0 NOT NULL,
  "total_issues" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "import_rows" (
  "run_id" uuid NOT NULL,
  "row_index" integer NOT NULL,
  "row_type" varchar(16) NOT NULL,
  "kind" varchar(64) NOT NULL,
  "op" varchar(32) NOT NULL,
  "entity_id" varchar(100),
  "payload" jsonb NOT NULL,
  "status" "import_row_status" DEFAULT 'pending' NOT NULL,
  "error_message" text,
  CONSTRAINT "import_rows_run_id_row_index_pk" PRIMARY KEY("run_id","row_index")
);

CREATE TABLE "import_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "row_index" integer,
  "severity" "import_issue_severity" NOT NULL,
  "code" varchar(100) NOT NULL,
  "message" text NOT NULL,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_run_id_import_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_run_id_import_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;
