CREATE TYPE "rollback_run_status" AS ENUM ('planned', 'applied', 'failed');
CREATE TYPE "rollback_row_status" AS ENUM ('pending', 'planned', 'applied', 'failed', 'skipped');
CREATE TYPE "rollback_issue_severity" AS ENUM ('info', 'warning', 'error');

CREATE TABLE "rollback_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_run_id" uuid NOT NULL,
  "status" "rollback_run_status" DEFAULT 'planned' NOT NULL,
  "initiated_by_user_id" varchar(255),
  "planned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "total_issues" integer DEFAULT 0 NOT NULL,
  "plan_duration_ms" integer,
  "apply_duration_ms" integer,
  "total_duration_ms" integer,
  "applied_row_counts_by_kind" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE "rollback_rows" (
  "run_id" uuid NOT NULL,
  "row_index" integer NOT NULL,
  "source_row_index" integer,
  "row_type" varchar(16) NOT NULL,
  "kind" varchar(64) NOT NULL,
  "op" varchar(32) NOT NULL,
  "entity_id" varchar(100),
  "payload" jsonb NOT NULL,
  "status" "rollback_row_status" DEFAULT 'pending' NOT NULL,
  "error_message" text,
  CONSTRAINT "rollback_rows_run_id_row_index_pk" PRIMARY KEY("run_id","row_index")
);

CREATE TABLE "rollback_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "row_index" integer,
  "severity" "rollback_issue_severity" NOT NULL,
  "code" varchar(100) NOT NULL,
  "message" text NOT NULL,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "rollback_runs" ADD CONSTRAINT "rollback_runs_source_run_id_import_runs_id_fk"
  FOREIGN KEY ("source_run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "rollback_rows" ADD CONSTRAINT "rollback_rows_run_id_rollback_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."rollback_runs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "rollback_issues" ADD CONSTRAINT "rollback_issues_run_id_rollback_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."rollback_runs"("id") ON DELETE cascade ON UPDATE no action;
