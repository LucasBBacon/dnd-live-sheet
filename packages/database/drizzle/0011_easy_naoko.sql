CREATE TABLE "core_rule_packs" (
	"pack_id" varchar(100) NOT NULL,
	"version" integer NOT NULL,
	"ruleset" varchar(100) NOT NULL,
	"content_hash" varchar(64),
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "core_rule_packs_pack_id_version_pk" PRIMARY KEY("pack_id","version")
);
