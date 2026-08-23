-- Custom SQL migration file, put your code below! --
-- TraitEffect is retired; traits now carry their whole authored TraitDefinition.
ALTER TABLE "traits" RENAME COLUMN "effects" TO "definition";