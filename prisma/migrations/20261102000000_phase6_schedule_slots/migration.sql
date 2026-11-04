BEGIN;
-- AlterTable
ALTER TABLE "BattleRound" ADD COLUMN     "slotMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "slotMinutes" INTEGER NOT NULL DEFAULT 60;


ALTER TABLE "Match" ADD CONSTRAINT "match_slot_bounds" CHECK ("slotMinutes" BETWEEN 1 AND 480);
ALTER TABLE "BattleRound" ADD CONSTRAINT "battle_slot_bounds" CHECK ("slotMinutes" BETWEEN 1 AND 480);
COMMIT;
