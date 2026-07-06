'use client';
import { useEffect, useState } from 'react';
import { driverApi } from '@/lib/driverApi';
import { readFileAsDataUrl } from '@/lib/files';

interface DriverTrip {
  id: string; voucherNo: string; origin: string; destination: string;
  customer: string; cargo: string; content: string; weight: number; packages: number;
  plannedDate: string; eta: string; distance: number; status: string;
  vehicleRegNumber: string;
  driverAcceptanceStatus: 'Pending' | 'Accepted' | 'Rejected';
  driverRejectionReason: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Accepted: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

const TRIP_STATUS_STYLES: Record<string, string> = {
  Planned: 'bg-slate-100 text-slate-600',
  'In Transit': 'bg-blue-100 text-blue-700',
  Completed: 'bg-green-100 text-green-700',
};

export default function DriverTripsPage() {
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [podUploadId, setPodUploadId] = useState<string | null>(null);
  const [podFile, setPodFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    driverApi.myTrips().then(setTrips).catch(() => setError('Failed to load your trips.')).finally(() => setLoading(false));
  }, []);

  async function respond(id: string, decision: 'Accepted' | 'Rejected', reason?: string) {
    setRespondingId(id);
    setError('');
    try {
      const res = await driverApi.respondToTrip(id, decision, reason);
      setTrips(prev => prev.map(t => t.id === id ? { ...t, driverAcceptanceStatus: res.trip.driverAcceptanceStatus, driverRejectionReason: res.trip.driverRejectionReason } : t));
      setRejectingId(null);
      setRejectReason('');
    } catch {
      setError('Failed to save your response. Please try again.');
    } finally {
      setRespondingId(null);
    }
  }

  async function updateStatus(id: string, status: 'In Transit' | 'Completed', pod?: File) {
    setUpdatingStatusId(id);
    setError('');
    try {
      const podData = pod ? await readFileAsDataUrl(pod) : undefined;
      const res = await driverApi.updateTripStatus(id, status, podData);
      if (status === 'Completed') {
        setTrips(prev => prev.filter(t => t.id !== id));
        setPodUploadId(null);
        setPodFile(undefined);
      } else {
        setTrips(prev => prev.map(t => t.id === id ? { ...t, status: res.trip.status } : t));
      }
    } catch {
      setError('Failed to update trip status. Please try again.');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-800">My Trips</h1>
      {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

      {trips.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-6 text-center text-sm text-slate-400">
          No trip is currently placed on your vehicle.
        </div>
      )}

      {trips.map(t => (
        <div key={t.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-slate-500">{t.voucherNo}</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TRIP_STATUS_STYLES[t.status] || 'bg-slate-100 text-slate-500'}`}>
                {t.status}
              </span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[t.driverAcceptanceStatus]}`}>
                {t.driverAcceptanceStatus}
              </span>
            </div>
          </div>
          <div className="text-base font-semibold text-slate-800">{t.origin} → {t.destination}</div>
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
            <div><span className="text-slate-400">Customer</span><div className="font-medium">{t.customer}</div></div>
            <div><span className="text-slate-400">Vehicle</span><div className="font-medium font-mono">{t.vehicleRegNumber}</div></div>
            <div><span className="text-slate-400">Cargo</span><div className="font-medium">{t.content || t.cargo || '—'}{t.weight ? ` (${t.weight}T)` : ''}</div></div>
            <div><span className="text-slate-400">Distance</span><div className="font-medium">{t.distance ? `${t.distance} km` : '—'}</div></div>
            <div><span className="text-slate-400">Departure</span><div className="font-medium">{t.plannedDate || '—'}</div></div>
            <div><span className="text-slate-400">ETA</span><div className="font-medium">{t.eta || '—'}</div></div>
          </div>

          {t.driverAcceptanceStatus === 'Rejected' && t.driverRejectionReason && (
            <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">Reason: {t.driverRejectionReason}</div>
          )}

          {t.driverAcceptanceStatus === 'Pending' && (
            rejectingId === t.id ? (
              <div className="space-y-2 pt-1">
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejecting this trip"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
                <div className="flex gap-2">
                  <button onClick={() => { setRejectingId(null); setRejectReason(''); }}
                    className="flex-1 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg">Cancel</button>
                  <button disabled={!rejectReason.trim() || respondingId === t.id}
                    onClick={() => respond(t.id, 'Rejected', rejectReason)}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50">
                    {respondingId === t.id ? 'Submitting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button onClick={() => setRejectingId(t.id)} disabled={respondingId === t.id}
                  className="flex-1 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                  Reject
                </button>
                <button onClick={() => respond(t.id, 'Accepted')} disabled={respondingId === t.id}
                  className="flex-1 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {respondingId === t.id ? 'Submitting...' : 'Accept'}
                </button>
              </div>
            )
          )}

          {t.driverAcceptanceStatus === 'Accepted' && t.status === 'Planned' && (
            <button onClick={() => updateStatus(t.id, 'In Transit')} disabled={updatingStatusId === t.id}
              className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {updatingStatusId === t.id ? 'Starting...' : 'Start Trip'}
            </button>
          )}
          {t.driverAcceptanceStatus === 'Accepted' && t.status === 'In Transit' && (
            podUploadId === t.id ? (
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-medium text-slate-600">Proof of delivery photo (required)</label>
                <input type="file" accept="image/*" capture="environment"
                  onChange={e => setPodFile(e.target.files?.[0])}
                  className="w-full text-xs text-slate-500 border border-slate-200 rounded-lg file:mr-2 file:py-1.5 file:px-2 file:border-0 file:bg-slate-100 file:text-xs file:font-medium file:text-slate-600 hover:file:bg-slate-200" />
                {podFile && <div className="text-xs text-green-600 truncate">Selected: {podFile.name}</div>}
                <div className="flex gap-2">
                  <button onClick={() => { setPodUploadId(null); setPodFile(undefined); }}
                    className="flex-1 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg">Cancel</button>
                  <button disabled={!podFile || updatingStatusId === t.id}
                    onClick={() => updateStatus(t.id, 'Completed', podFile)}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg disabled:opacity-50">
                    {updatingStatusId === t.id ? 'Uploading...' : 'Confirm Delivery'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setPodUploadId(t.id)}
                className="w-full px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                Mark Delivered
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}
