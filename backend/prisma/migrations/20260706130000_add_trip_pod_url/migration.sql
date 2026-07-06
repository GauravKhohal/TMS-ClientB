-- AlterTable: store the uploaded proof-of-delivery photo URL alongside the existing pod flag
ALTER TABLE "Trip"
ADD COLUMN "podUrl" TEXT;
