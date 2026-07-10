ALTER TABLE "import_runs" ADD COLUMN "validate_duration_ms" integer;
ALTER TABLE "import_runs" ADD COLUMN "plan_duration_ms" integer;
ALTER TABLE "import_runs" ADD COLUMN "apply_duration_ms" integer;
ALTER TABLE "import_runs" ADD COLUMN "publish_duration_ms" integer;
ALTER TABLE "import_runs" ADD COLUMN "total_duration_ms" integer;
ALTER TABLE "import_runs" ADD COLUMN "applied_row_counts_by_kind" jsonb DEFAULT '{}'::jsonb NOT NULL;
