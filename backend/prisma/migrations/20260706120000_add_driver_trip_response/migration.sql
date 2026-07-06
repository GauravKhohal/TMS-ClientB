-- AlterTable: track the driver's own accept/reject response to a placed trip
ALTER TABLE "Trip"
ADD COLUMN "driverAcceptanceStatus" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN "driverRejectionReason" TEXT;
