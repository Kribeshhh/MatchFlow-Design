BEGIN;
-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "assistsA" INTEGER,
ADD COLUMN     "assistsB" INTEGER,
ADD COLUMN     "deathsA" INTEGER,
ADD COLUMN     "deathsB" INTEGER,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "killsA" INTEGER,
ADD COLUMN     "killsB" INTEGER;


ALTER TABLE "Match" ADD CONSTRAINT "Match_statistics_range_check" CHECK (("killsA" IS NULL OR "killsA" BETWEEN 0 AND 100000) AND ("deathsA" IS NULL OR "deathsA" BETWEEN 0 AND 100000) AND ("assistsA" IS NULL OR "assistsA" BETWEEN 0 AND 100000) AND ("killsB" IS NULL OR "killsB" BETWEEN 0 AND 100000) AND ("deathsB" IS NULL OR "deathsB" BETWEEN 0 AND 100000) AND ("assistsB" IS NULL OR "assistsB" BETWEEN 0 AND 100000) AND ("durationSeconds" IS NULL OR "durationSeconds" BETWEEN 1 AND 86400));
COMMIT;
