// Polls the field-tracker driver app for live GPS pings and forwards them into
// this TMS's existing GPS pipeline — the same vehicle.location update + emit
// that POST /api/gps/ping produces — so the /tracking page lights up with no
// frontend changes. A field-tracker driver is matched to a TMS driver by phone
// number (same normalization as findDriverByPhone in server.js), then routed
// to whichever vehicle that driver is currently placed on (Trip Management →
// Vehicle Placement) — the same "active trip" resolution findDriverActiveTrips
// uses for the driver mobile app, not the Vehicle.driverId static field.
const POLL_INTERVAL_MS = 30000;

function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits; // assume Indian numbers without country code
}

function findPlacedVehicleForDriver(driverId, trips, vehicles) {
  const trip = trips.find(t => {
    if (t.approvalStatus !== 'Approved' || !t.placementConfirmed) return false;
    if (t.status === 'Completed' || t.status === 'Cancelled') return false;
    const vehicleDriverId = vehicles.find(v => v.id === t.vehicleId)?.driver;
    return t.driverId === driverId || vehicleDriverId === driverId;
  });
  return trip ? vehicles.find(v => v.id === trip.vehicleId) : null;
}

function startFieldTrackerPolling({ io, vehicles, drivers, trips, prisma }) {
  const apiUrl = process.env.FIELD_TRACKER_API_URL;
  const apiKey = process.env.FIELD_TRACKER_API_KEY;
  if (!apiUrl || !apiKey) {
    console.log('[FieldTracker] FIELD_TRACKER_API_URL/FIELD_TRACKER_API_KEY not set — live driver location polling disabled.');
    return;
  }

  async function poll() {
    let payload;
    try {
      const res = await fetch(`${apiUrl}/api/integrations/locations`, { headers: { 'X-API-Key': apiKey } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    } catch (err) {
      console.error('[FieldTracker] Poll failed:', err.message);
      return;
    }

    for (const loc of payload.drivers || []) {
      const phone = toWhatsAppNumber(loc.phone);
      if (!phone) continue;
      const driver = drivers.find(d => toWhatsAppNumber(d.phone) === phone);
      if (!driver) continue;
      const vehicle = findPlacedVehicleForDriver(driver.id, trips, vehicles);
      if (!vehicle) continue;

      vehicle.location = { lat: loc.latitude, lng: loc.longitude };
      const timestamp = loc.last_updated || new Date().toISOString();

      prisma.vehicle.update({ where: { id: vehicle.id }, data: { location: vehicle.location } })
        .catch(e => console.error('[FieldTracker] Vehicle location DB update failed:', e.message));

      io.emit('gps:update', {
        vehicleId: vehicle.id, regNumber: vehicle.regNumber,
        lat: loc.latitude, lng: loc.longitude, speed: vehicle.speed, timestamp,
      });
    }
  }

  poll();
  setInterval(poll, POLL_INTERVAL_MS);
  console.log(`[FieldTracker] Live driver location polling started (every ${POLL_INTERVAL_MS / 1000}s).`);
}

module.exports = { startFieldTrackerPolling };
