-- Races without subraces (e.g. Human) must be storable, so subrace_id becomes
-- optional. NULL means "this race has no subrace tier".
ALTER TABLE "characters" ALTER COLUMN "subrace_id" DROP NOT NULL;
