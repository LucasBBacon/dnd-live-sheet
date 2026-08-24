-- Custom SQL migration file, put your code below! --
-- TraitEffect is retired; traits now carry their whole authored TraitDefinition.
-- The rename alone preserves nothing useful: every existing row's "effects" was
-- "[]" (TraitEffect was vestigial - see corePackProjection.ts's old comment), so
-- every renamed row now holds "definition": [] instead of a real TraitDefinition.
-- Run db:import-pack after this migration to populate "definition" for real.
ALTER TABLE "traits" RENAME COLUMN "effects" TO "definition";