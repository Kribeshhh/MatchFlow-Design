BEGIN;
-- AlterTable
ALTER TABLE "BattleRound" ADD COLUMN     "isTiebreak" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "participantIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MatchDispute" ADD COLUMN     "battleRoundId" TEXT;

-- AddForeignKey
ALTER TABLE "MatchDispute" ADD CONSTRAINT "MatchDispute_battleRoundId_fkey" FOREIGN KEY ("battleRoundId") REFERENCES "BattleRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
