-- AlterTable: track the vehicle's odometer reading at the time of its last service,
-- so "km since last service" can be computed for preventive maintenance alerts
ALTER TABLE "Vehicle"
ADD COLUMN "lastServiceOdometer" INTEGER;
