'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import CityInput, { type CityResult } from '@/components/CityInput';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

type CityHit = CityResult;
interface ViaStop { city: string; type: 'Pickup' | 'Delivery'; distanceFromPrev: number; lat?: number; lng?: number; }

interface Trip {
  id: string; voucherNo: string; origin: string; destination: string;
  stops: string[]; viaStops: ViaStop[]; status: string;
  approvalStatus: string; rejectionReason: string;
  driverId: string; vehicleId: string;
  customer: string; contactPerson: string; contactNo: string; address: string;
  category: string; segment: string; businessGroup: string;
  employeeId: string; placementDate: string; noOfVehicles: number; vehicleLoadType: string;
  cargo: string; content: string; rateType: string;
  weight: number; packages: number; rate: number;
  freight: number; loadingCharges: number; unloadingCharges: number;
  otherCharges: number; commission: number; advance: number;
  paymentTerms: string; creditDays: number; total: number; balance: number;
  plannedDate: string; eta: string; distance: number; approxTimeHrs: number;
  actualKm: number; tollCost: number; fuelCost: number; revenue: number;
  pod: boolean; delay: number;
  placementConfirmed: boolean; placementDateTime: string; placementRemarks: string;
  cnNumber: string; cnDate: string;
  consigneeName: string; consigneeAddress: string; consigneeContact: string;
}

interface VehicleOption { id: string; regNumber: string; status: string; driver: string | null; }
interface DriverOption { id: string; name: string; status: string; }
interface ComplianceItem { status: string; expiry: string; daysLeft: number; provider?: string; }
interface ComplianceRecord {
  vehicleId: string; rc: ComplianceItem; insurance: ComplianceItem; fitness: ComplianceItem;
  pollution: ComplianceItem; statePermit: ComplianceItem; nationalPermit: ComplianceItem;
}

const COMPLIANCE_STATUS_ORDER = ['Expired', 'Expiring Soon', 'Due Soon', 'Valid'];
const COMPLIANCE_BADGE_COLORS: Record<string, string> = {
  Expired: 'bg-red-100 text-red-700',
  'Expiring Soon': 'bg-yellow-100 text-yellow-700',
  'Due Soon': 'bg-blue-100 text-blue-700',
  Valid: 'bg-green-100 text-green-700',
};
const COMPLIANCE_PANEL_COLORS: Record<string, string> = {
  Expired: 'border-red-200 bg-red-50',
  'Expiring Soon': 'border-yellow-200 bg-yellow-50',
  'Due Soon': 'border-blue-200 bg-blue-50',
  Valid: 'border-green-200 bg-green-50',
};

const EMPTY_PLACEMENT = () => ({ vehicleId: '', driverId: '', placementDateTime: '', placementRemarks: '' });
const EMPTY_CN = () => ({ consigneeName: '', consigneeAddress: '', consigneeContact: '' });

const STATUS_COLORS: Record<string, string> = {
  'In Transit': 'bg-blue-100 text-blue-700',
  'Completed': 'bg-green-100 text-green-700',
  'Planned': 'bg-slate-100 text-slate-700',
  'Delayed': 'bg-red-100 text-red-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Pending Approval': 'bg-yellow-100 text-yellow-700',
};

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  'Pending Approval': 'bg-yellow-100 text-yellow-700',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
};

const INPUT  = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const SELECT = INPUT + ' bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function fmtHrs(hrs: number) {
  if (!hrs) return '—';
  return `${hrs} hrs`;
}


const EMPTY_FORM = () => ({
  customer: '', contactPerson: '', contactNo: '', address: '',
  category: 'MARKET', segment: 'FMCG', businessGroup: '',
  employeeId: '', placementDate: new Date().toISOString().split('T')[0],
  noOfVehicles: 1, vehicleLoadType: '32FT MXL',
  origin: '', destination: '', distance: 0, approxTimeHrs: 0,
  content: '', rateType: 'FIXED', weight: 0, packages: 0, rate: 0,
  freight: 0, loadingCharges: 0, unloadingCharges: 0, otherCharges: 0,
  commission: 0, advance: 0, paymentTerms: 'Net 30', creditDays: 30,
  vehicleId: '', driverId: '',
  plannedDate: '', eta: '',
});

export default function TripsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <TripsPageInner />
    </Suspense>
  );
}

function TripsPageInner() {
  const searchParams = useSearchParams();
  const searchParam = searchParams.get('search');

  const user = getUser();
  const isManager = user?.role === 'Super Admin' || user?.role === 'Fleet Manager';

  const [trips, setTrips]       = useState<Trip[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('All');
  const [search, setSearch]     = useState(searchParam || '');
  const [selected, setSelected] = useState<Trip | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');

  // Form state
  const [form, setForm]           = useState(EMPTY_FORM());
  const [viaStops, setViaStops]   = useState<ViaStop[]>([]);
  const [originCity, setOriginCity]   = useState<CityHit | null>(null);
  const [destCity, setDestCity]       = useState<CityHit | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Edit trip (manager)
  const [editTrip, setEditTrip]       = useState<Trip | null>(null);
  const [editForm, setEditForm]       = useState<ReturnType<typeof EMPTY_FORM>>(EMPTY_FORM());
  const [editStops, setEditStops]     = useState<ViaStop[]>([]);
  const [editSaving, setEditSaving]   = useState(false);

  // Approval
  const [rejectModal, setRejectModal]   = useState<Trip | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Tabs
  const [activeTab, setActiveTab] = useState<'indent' | 'placement' | 'cn'>('indent');
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [driverOptions, setDriverOptions]   = useState<DriverOption[]>([]);
  const [complianceRecords, setComplianceRecords] = useState<ComplianceRecord[]>([]);

  // Vehicle Placement
  const [placementModal, setPlacementModal]   = useState<Trip | null>(null);
  const [placementForm, setPlacementForm]     = useState(EMPTY_PLACEMENT());
  const [placementSaving, setPlacementSaving] = useState(false);

  // Consignment Note
  const [cnModal, setCnModal]   = useState<Trip | null>(null);
  const [cnForm, setCnForm]     = useState(EMPTY_CN());
  const [cnSaving, setCnSaving] = useState(false);
  const [cnView, setCnView]     = useState<Trip | null>(null);

  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();

  useEffect(() => {
    api.trips().then(setTrips).catch(console.error).finally(() => setLoading(false));
    api.fleet().then((v: VehicleOption[]) => setVehicleOptions(v)).catch(console.error);
    api.drivers().then((d: DriverOption[]) => setDriverOptions(d)).catch(console.error);
    api.compliance().then((c: ComplianceRecord[]) => setComplianceRecords(c)).catch(console.error);
  }, []);

  // Worst compliance status for a vehicle, used for table badges and the placement modal warning
  function complianceSummary(vehicleId: string) {
    const rec = complianceRecords.find(c => c.vehicleId === vehicleId);
    if (!rec) return null;
    const items = [
      { name: 'RC', ...rec.rc },
      { name: 'Insurance', ...rec.insurance },
      { name: 'Fitness', ...rec.fitness },
      { name: 'Pollution', ...rec.pollution },
      { name: 'State Permit', ...rec.statePermit },
      { name: 'National Permit', ...rec.nationalPermit },
    ];
    const worst = items.reduce((acc, it) =>
      COMPLIANCE_STATUS_ORDER.indexOf(it.status) < COMPLIANCE_STATUS_ORDER.indexOf(acc) ? it.status : acc, 'Valid');
    return { worst, items };
  }

  function renderComplianceBadge(vehicleId: string) {
    const summary = vehicleId ? complianceSummary(vehicleId) : null;
    if (!summary) return <span className="text-xs text-slate-400">—</span>;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${COMPLIANCE_BADGE_COLORS[summary.worst]}`}>
        {summary.worst}
      </span>
    );
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000); }
  function setF(field: string, value: string | number) { setForm(f => ({ ...f, [field]: value })); }

  // Auto-calculate total
  const computedTotal = form.freight + form.loadingCharges + form.unloadingCharges + form.otherCharges - form.commission;
  const computedBalance = computedTotal - form.advance;

  // Distance calculation for full route (origin → via stops → destination)
  async function calculateFullRoute() {
    if (!originCity || !destCity) return;
    setCalcLoading(true);
    try {
      const points: { city: CityHit | null; label: string }[] = [
        { city: originCity, label: form.origin },
        ...viaStops.map(s => ({ city: { name: s.city, lat: s.lat ?? 0, lng: s.lng ?? 0, state: '' }, label: s.city })),
        { city: destCity, label: form.destination },
      ];

      let totalKm = 0;
      const updatedStops = [...viaStops];

      for (let i = 0; i < points.length - 1; i++) {
        const from = points[i].city;
        const to   = points[i + 1].city;
        if (!from?.lat || !to?.lat) continue;
        const res = await api.calcDistance(from.lat, from.lng, to.lat, to.lng, from.name, to.name);
        const legKm = res.distanceKm;
        if (i > 0 && i <= updatedStops.length) {
          updatedStops[i - 1] = { ...updatedStops[i - 1], distanceFromPrev: legKm };
        }
        totalKm += legKm;
      }
      setViaStops(updatedStops);
      const hrs = Math.ceil(totalKm / 30);
      setForm(f => ({ ...f, distance: totalKm, approxTimeHrs: hrs }));
      notify(`Route calculated: ${totalKm} km · ETA ${fmtHrs(hrs)}`);
    } catch { notify('Distance calculation failed'); }
    setCalcLoading(false);
  }

  function addViaStop() { setViaStops(s => [...s, { city: '', type: 'Delivery', distanceFromPrev: 0 }]); }
  function removeViaStop(i: number) { setViaStops(s => s.filter((_, idx) => idx !== i)); }
  function updateStop(i: number, field: keyof ViaStop, value: string | number) {
    setViaStops(s => s.map((stop, idx) => idx === i ? { ...stop, [field]: value } : stop));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form, viaStops,
        stops: viaStops.map(s => s.city),
        revenue: form.freight,
        total: computedTotal, balance: computedBalance,
        volume: form.packages,
        plannedKm: form.distance,
      };
      const res = await api.createTrip(payload);
      setTrips(t => [res.trip, ...t]);
      setShowAdd(false);
      setForm(EMPTY_FORM()); setViaStops([]); setOriginCity(null); setDestCity(null);
      notify(`Trip ${res.trip.id} created — pending manager approval`);
    } catch { notify('Failed to create trip'); }
    setSaving(false);
  }

  async function handleApprove(trip: Trip) {
    try {
      const res = await api.approveTrip(trip.id);
      setTrips(t => t.map(x => x.id === trip.id ? res.trip : x));
      const dn = res.driverNotification;
      if (dn?.sent) {
        notify(`Trip ${trip.id} approved — WhatsApp summary sent to ${dn.driverName} (${dn.driverPhone})`);
      } else {
        notify(`Trip ${trip.id} approved — WhatsApp message not sent${dn?.reason ? ` (${dn.reason})` : ''}`);
      }
    } catch { notify('Approval failed'); }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectModal || !rejectReason.trim()) return;
    try {
      const res = await api.rejectTrip(rejectModal.id, rejectReason);
      setTrips(t => t.map(x => x.id === rejectModal.id ? res.trip : x));
      setRejectModal(null); setRejectReason('');
      notify(`Trip ${rejectModal.id} rejected`);
    } catch { notify('Rejection failed'); }
  }

  function openEdit(trip: Trip) {
    setEditForm({
      customer: trip.customer || '', contactPerson: trip.contactPerson || '',
      contactNo: trip.contactNo || '', address: trip.address || '',
      category: trip.category || 'MARKET', segment: trip.segment || 'FMCG',
      businessGroup: trip.businessGroup || '', employeeId: trip.employeeId || '',
      placementDate: trip.placementDate || '', noOfVehicles: trip.noOfVehicles || 1,
      vehicleLoadType: trip.vehicleLoadType || '32FT MXL',
      origin: trip.origin || '', destination: trip.destination || '',
      distance: trip.distance || 0, approxTimeHrs: trip.approxTimeHrs || 0,
      content: trip.content || trip.cargo || '', rateType: trip.rateType || 'FIXED',
      weight: trip.weight || 0, packages: trip.packages || 0, rate: trip.rate || 0,
      freight: trip.freight || 0, loadingCharges: trip.loadingCharges || 0,
      unloadingCharges: trip.unloadingCharges || 0, otherCharges: trip.otherCharges || 0,
      commission: trip.commission || 0, advance: trip.advance || 0,
      paymentTerms: trip.paymentTerms || 'Net 30', creditDays: trip.creditDays || 30,
      vehicleId: trip.vehicleId || '', driverId: trip.driverId || '',
      plannedDate: trip.plannedDate || '', eta: trip.eta || '',
    });
    setEditStops(trip.viaStops || []);
    setEditTrip(trip);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editTrip) return;
    setEditSaving(true);
    try {
      const total   = editForm.freight + editForm.loadingCharges + editForm.unloadingCharges + editForm.otherCharges - editForm.commission;
      const balance = total - editForm.advance;
      const res = await api.updateTrip(editTrip.id, {
        ...editForm, viaStops: editStops,
        stops: editStops.map(s => s.city),
        total, balance, revenue: editForm.freight,
      });
      setTrips(t => t.map(x => x.id === editTrip.id ? res.trip : x));
      setEditTrip(null);
      notify(`Trip ${editTrip.id} updated`);
    } catch { notify('Update failed'); }
    setEditSaving(false);
  }

  function openPlacement(trip: Trip) {
    setPlacementForm({
      vehicleId: trip.vehicleId || '', driverId: trip.driverId || '',
      placementDateTime: trip.placementDateTime || '', placementRemarks: trip.placementRemarks || '',
    });
    setPlacementModal(trip);
  }

  async function handlePlacementSave(e: React.FormEvent) {
    e.preventDefault();
    if (!placementModal) return;
    setPlacementSaving(true);
    try {
      const res = await api.confirmPlacement(placementModal.id, placementForm);
      setTrips(t => t.map(x => x.id === placementModal.id ? res.trip : x));
      setPlacementModal(null);
      notify(`Vehicle placement confirmed for ${placementModal.voucherNo}`);
    } catch { notify('Failed to confirm placement'); }
    setPlacementSaving(false);
  }

  function openCnGenerate(trip: Trip) {
    setCnForm({
      consigneeName: trip.consigneeName || '', consigneeAddress: trip.consigneeAddress || '',
      consigneeContact: trip.consigneeContact || '',
    });
    setCnModal(trip);
  }

  async function handleCnSave(e: React.FormEvent) {
    e.preventDefault();
    if (!cnModal) return;
    setCnSaving(true);
    try {
      const res = await api.generateCN(cnModal.id, cnForm);
      setTrips(t => t.map(x => x.id === cnModal.id ? res.trip : x));
      setCnModal(null);
      notify(`Consignment Note ${res.trip.cnNumber} generated for ${cnModal.voucherNo}`);
    } catch { notify('Failed to generate Consignment Note'); }
    setCnSaving(false);
  }

  const statuses = ['All', 'In Transit', 'Planned', 'Delayed', 'Completed', 'Cancelled'];
  const pending  = trips.filter(t => t.approvalStatus === 'Pending Approval');
  const filtered = trips.filter(t => {
    const matchStatus = filter === 'All' || t.status === filter;
    const matchDate   = inRange(t.plannedDate);
    const matchSearch = t.id.includes(search) || t.customer?.toLowerCase().includes(search.toLowerCase()) ||
      t.origin?.toLowerCase().includes(search.toLowerCase()) || t.destination?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch && matchDate;
  });
  const counts = Object.fromEntries(statuses.map(s => [s, s === 'All' ? filtered.length : filtered.filter(t => t.status === s).length]));

  // Vehicle Placement tab
  const placementPending = trips.filter(t => t.approvalStatus === 'Approved' && !t.placementConfirmed);
  const placementDone     = trips.filter(t => t.approvalStatus === 'Approved' && t.placementConfirmed);

  // CN tab
  const cnPending   = trips.filter(t => t.placementConfirmed && !t.cnNumber);
  const cnGenerated = trips.filter(t => t.placementConfirmed && t.cnNumber);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-800 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm">{toast}</div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          ['indent', 'Indent Creation'],
          ['placement', 'Vehicle Placement'],
          ['cn', 'CN (Consignment Note)'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {label}
            {key === 'placement' && placementPending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{placementPending.length}</span>
            )}
            {key === 'cn' && cnPending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{cnPending.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'indent' && (
      <>
      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filtered.length} total={trips.length} />

      {/* ── Pending Approval Banner (managers only) ── */}
      {pending.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-sm font-bold text-yellow-800">{pending.length} trip(s) awaiting approval</span>
          </div>
          <div className="space-y-2">
            {pending.map(t => (
              <div key={t.id} className="bg-white border border-yellow-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700">{t.voucherNo}</span>
                    <span className="text-sm font-medium text-slate-800">{t.origin} → {t.destination}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t.customer} · {t.cargo} · {t.weight}T · ₹{t.freight?.toLocaleString('en-IN')} · {t.plannedDate}
                  </div>
                  {t.viaStops?.length > 0 && (
                    <div className="text-xs text-blue-600 mt-0.5">
                      Via: {t.viaStops.map(s => `${s.city} (${s.type})`).join(' → ')}
                    </div>
                  )}
                </div>
                {isManager ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(t)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">
                      ✓ Approve
                    </button>
                    <button onClick={() => { setRejectModal(t); setRejectReason(''); }}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                      ✗ Reject
                    </button>
                    <button onClick={() => setSelected(t)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50">
                      View Details
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Awaiting Manager</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === s ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}>
            {s} <span className="ml-1 opacity-70">({counts[s]})</span>
          </button>
        ))}
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <button onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create Indent
          </button>
          <input type="text" placeholder="Search trip ID, customer, route..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72 ml-auto" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Voucher', 'Route & Stops', 'Customer', 'Cargo', 'Status', 'Approval Status', 'Distance / ETA', 'Freight', 'Loading Chg.', 'Unloading Chg.', 'Other Chg.', 'Total', 'Advance', 'Balance', 'POD', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-bold text-slate-700">{t.voucherNo}</div>
                    <div className="text-xs text-slate-400">{t.plannedDate}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800 whitespace-nowrap">{t.origin} → {t.destination}</div>
                    {t.viaStops?.length > 0 && (
                      <div className="text-xs text-blue-600 mt-0.5">
                        {t.viaStops.map(s => `${s.city}(${s.type === 'Pickup' ? '↑' : '↓'})`).join(' → ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-800 whitespace-nowrap">{t.customer}</div>
                    <div className="text-xs text-slate-400">{t.contactPerson}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-700">{t.content || t.cargo}</div>
                    <div className="text-xs text-slate-400">{t.weight}T · {t.packages} pkgs</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span>
                    {t.delay > 0 && <div className="text-xs text-red-500 mt-0.5">{t.delay}h delay</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_STATUS_COLORS[t.approvalStatus] || 'bg-slate-100 text-slate-600'}`}>{t.approvalStatus}</span>
                    {t.approvalStatus === 'Rejected' && t.rejectionReason && (
                      <div className="text-xs text-red-500 mt-0.5 max-w-[10rem]" title={t.rejectionReason}>{t.rejectionReason}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-slate-700">{t.distance > 0 ? `${t.distance.toLocaleString()} km` : '—'}</div>
                    <div className="text-xs text-slate-400">{fmtHrs(t.approxTimeHrs)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">
                    {t.freight > 0 ? `₹${t.freight.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {(t.loadingCharges || 0) > 0 ? `₹${(t.loadingCharges).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {(t.unloadingCharges || 0) > 0 ? `₹${(t.unloadingCharges).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {(t.otherCharges || 0) > 0 ? `₹${(t.otherCharges).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-800 whitespace-nowrap">
                    {t.total > 0 ? `₹${t.total.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {t.advance > 0 ? `₹${t.advance.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-blue-700 whitespace-nowrap">
                    {t.balance > 0 ? `₹${t.balance.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.pod ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.pod ? '✓ Done' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap flex items-center gap-2">
                    <button onClick={() => setSelected(t)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View</button>
                    {isManager && (
                      <button onClick={() => openEdit(t)} className="text-slate-500 hover:text-slate-700 text-xs font-medium border border-slate-200 px-2 py-0.5 rounded">Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-10">No trips match your filter.</div>
          )}
        </div>
      </div>
      </>
      )}

      {/* ── Vehicle Placement Tab ── */}
      {activeTab === 'placement' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Pending Placement</h3>
              <p className="text-xs text-slate-400 mt-0.5">Approved indents awaiting vehicle & driver assignment</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Voucher', 'Route', 'Customer', 'Placement Date', 'Total KM', 'Load Type', 'No. of Vehicles', 'Vehicle / Driver', 'Compliance', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {placementPending.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-slate-700">{t.voucherNo}</div>
                        <div className="text-xs text-slate-400">{t.plannedDate}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{t.origin} → {t.destination}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{t.customer}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.placementDate || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.distance > 0 ? `${t.distance.toLocaleString()} km` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.vehicleLoadType}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 text-center">{t.noOfVehicles}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.vehicleId || '—'} / {t.driverId || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{renderComplianceBadge(t.vehicleId)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => openPlacement(t)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                          Assign & Confirm Placement
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {placementPending.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">No indents awaiting vehicle placement.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Placed Vehicles</h3>
              <p className="text-xs text-slate-400 mt-0.5">Vehicle & driver confirmed for these indents</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Voucher', 'Route', 'Customer', 'Placement Date', 'Total KM', 'Vehicle / Driver', 'Placement Date/Time', 'Compliance', 'Remarks', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {placementDone.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-slate-700">{t.voucherNo}</div>
                        <div className="text-xs text-slate-400">{t.plannedDate}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{t.origin} → {t.destination}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{t.customer}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.placementDate || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.distance > 0 ? `${t.distance.toLocaleString()} km` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.vehicleId} / {t.driverId}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.placementDateTime ? t.placementDateTime.replace('T', ' ') : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{renderComplianceBadge(t.vehicleId)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{t.placementRemarks || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => openPlacement(t)}
                          className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {placementDone.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">No vehicles placed yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CN (Consignment Note) Tab ── */}
      {activeTab === 'cn' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Pending CN Generation</h3>
              <p className="text-xs text-slate-400 mt-0.5">Vehicles placed — Consignment Note not yet generated</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Voucher', 'Route', 'Customer', 'Vehicle / Driver', 'Content', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cnPending.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-slate-700">{t.voucherNo}</div>
                        <div className="text-xs text-slate-400">{t.plannedDate}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{t.origin} → {t.destination}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{t.customer}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.vehicleId} / {t.driverId}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{t.content || t.cargo}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => openCnGenerate(t)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                          Generate CN
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cnPending.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">Nothing pending — every placed vehicle has a CN.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Generated Consignment Notes</h3>
              <p className="text-xs text-slate-400 mt-0.5">Lorry receipts issued for placed vehicles</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['CN No.', 'CN Date', 'Voucher', 'Route', 'Consignor', 'Consignee', 'Vehicle / Driver', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cnGenerated.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700 whitespace-nowrap">{t.cnNumber}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.cnDate}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{t.voucherNo}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{t.origin} → {t.destination}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.customer}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.consigneeName || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.vehicleId} / {t.driverId}</td>
                      <td className="px-4 py-3 whitespace-nowrap flex items-center gap-2">
                        <button onClick={() => setCnView(t)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View / Print</button>
                        <button onClick={() => openCnGenerate(t)} className="text-slate-500 hover:text-slate-700 text-xs font-medium border border-slate-200 px-2 py-0.5 rounded">Edit Consignee</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cnGenerated.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">No Consignment Notes generated yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Indent Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-bold text-slate-800">Create Indent</h3>
                <p className="text-xs text-slate-400 mt-0.5">Will be sent to manager for approval</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-6">

              {/* Section 1: Indent Details */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Indent Details</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Category *">
                    <select required className={SELECT} value={form.category} onChange={e => setF('category', e.target.value)}>
                      {['MARKET', 'INDUSTRIAL', 'GOVERNMENT', 'E-COMMERCE', 'RETAIL'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Segment *">
                    <select required className={SELECT} value={form.segment} onChange={e => setF('segment', e.target.value)}>
                      {['FMCG', 'Electronics', 'Automotive', 'Construction', 'Pharma', 'Textile', 'IT Equipment', 'Food & Beverages', 'Manufacturing', 'E-Commerce'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Business Group">
                    <input className={INPUT} placeholder="North Zone" value={form.businessGroup} onChange={e => setF('businessGroup', e.target.value)} />
                  </Field>
                  <Field label="Placement Date *">
                    <input required type="date" className={INPUT} value={form.placementDate} onChange={e => setF('placementDate', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Section 2: Customer */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Customer Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Customer Name *">
                    <input required className={INPUT} placeholder="Reliance Industries" value={form.customer} onChange={e => setF('customer', e.target.value)} />
                  </Field>
                  <Field label="Contact Person *">
                    <input required className={INPUT} placeholder="Rahul Mehta" value={form.contactPerson} onChange={e => setF('contactPerson', e.target.value)} />
                  </Field>
                  <Field label="Contact No. *">
                    <input required className={INPUT} placeholder="9812345678" maxLength={10} value={form.contactNo} onChange={e => setF('contactNo', e.target.value)} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Address">
                      <input className={INPUT} placeholder="Customer address" value={form.address} onChange={e => setF('address', e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Payment Terms *">
                    <select required className={SELECT} value={form.paymentTerms} onChange={e => setF('paymentTerms', e.target.value)}>
                      {['Advance', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'On Delivery'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Credit Days">
                    <input type="number" min={0} className={INPUT} value={form.creditDays} onChange={e => setF('creditDays', parseInt(e.target.value) || 0)} />
                  </Field>
                </div>
              </div>

              {/* Section 3: Route */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Route & Stops</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="col-span-2">
                    <Field label="Source (Origin) *">
                      <CityInput value={form.origin}
                        onChange={v => setF('origin', v)}
                        onSelect={c => { setF('origin', c.name); setOriginCity(c); }}
                        placeholder="e.g. Mumbai" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Destination *">
                      <CityInput value={form.destination}
                        onChange={v => setF('destination', v)}
                        onSelect={c => { setF('destination', c.name); setDestCity(c); }}
                        placeholder="e.g. Delhi" />
                    </Field>
                  </div>
                </div>

                {/* Via Stops */}
                {viaStops.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-medium text-slate-500">Via Stops</p>
                    {viaStops.map((stop, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${stop.type === 'Pickup' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {stop.type === 'Pickup' ? '↑' : '↓'}
                        </div>
                        <div className="flex-1">
                          <CityInput value={stop.city}
                            onChange={v => updateStop(i, 'city', v)}
                            onSelect={c => { updateStop(i, 'city', c.name); updateStop(i, 'lat', c.lat); updateStop(i, 'lng', c.lng); }}
                            placeholder={`Stop ${i + 1} city`} />
                        </div>
                        <select className="px-2 py-2 border border-slate-200 rounded-lg text-xs bg-white" value={stop.type}
                          onChange={e => updateStop(i, 'type', e.target.value)}>
                          <option>Pickup</option>
                          <option>Delivery</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} className="w-20 px-2 py-2 border border-slate-200 rounded-lg text-xs text-center" value={stop.distanceFromPrev || ''}
                            onChange={e => updateStop(i, 'distanceFromPrev', parseInt(e.target.value) || 0)}
                            placeholder="km" />
                          <span className="text-xs text-slate-400">km</span>
                        </div>
                        <button type="button" onClick={() => removeViaStop(i)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={addViaStop}
                  className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 mb-4">
                  + Add Via Stop (Pickup / Delivery)
                </button>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="No. of Vehicles *">
                    <input required type="number" min={1} className={INPUT} value={form.noOfVehicles} onChange={e => setF('noOfVehicles', parseInt(e.target.value) || 1)} />
                  </Field>
                  <Field label="Vehicle Load Type *">
                    <select required className={SELECT} value={form.vehicleLoadType} onChange={e => setF('vehicleLoadType', e.target.value)}>
                      {['32FT MXL', '24FT', '20FT', 'LCV 14FT', 'LCV 10FT', 'Container 40FT', 'Container 20FT', 'Trailer', 'Flatbed'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Distance (km)">
                    <div className="relative">
                      <input type="number" min={0} className={INPUT + ' pr-20'} value={form.distance || ''}
                        onChange={e => { const d = parseInt(e.target.value) || 0; setF('distance', d); setF('approxTimeHrs', Math.ceil(d / 30)); }}
                        placeholder="Auto or manual" />
                      <button type="button" onClick={calculateFullRoute} disabled={calcLoading || !originCity || !destCity}
                        className="absolute right-1 top-1 bottom-1 px-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-40">
                        {calcLoading ? '…' : 'Calc'}
                      </button>
                    </div>
                  </Field>
                  <Field label="Approx. Time (auto)">
                    <input readOnly className={INPUT + ' bg-slate-50 text-slate-600'} value={form.approxTimeHrs ? fmtHrs(form.approxTimeHrs) : ''} placeholder="Calculated" />
                  </Field>
                  <Field label="Planned Departure *">
                    <input required type="date" className={INPUT} value={form.plannedDate} onChange={e => setF('plannedDate', e.target.value)} />
                  </Field>
                  <Field label="Expected Arrival (ETA)">
                    <input type="date" className={INPUT} value={form.eta} onChange={e => setF('eta', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Section 4: Cargo & Charges */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Cargo & Charges</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <Field label="Content / Cargo Description *">
                      <input required className={INPUT} placeholder="TMT Steel Bars, Consumer Electronics..." value={form.content} onChange={e => setF('content', e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Rate Type *">
                    <select required className={SELECT} value={form.rateType} onChange={e => setF('rateType', e.target.value)}>
                      {['FIXED', 'PER KM', 'PER TON', 'PER PACKAGE'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label={`Rate (₹ / ${form.rateType === 'FIXED' ? 'trip' : form.rateType.toLowerCase().replace('per ', '')})`}>
                    <input type="number" min={0} className={INPUT} value={form.rate || ''}
                      onChange={e => {
                        const r = parseFloat(e.target.value) || 0;
                        setF('rate', r);
                        if (form.rateType === 'PER KM') setF('freight', Math.round(r * form.distance));
                        else if (form.rateType === 'PER TON') setF('freight', Math.round(r * form.weight));
                        else if (form.rateType === 'PER PACKAGE') setF('freight', Math.round(r * form.packages));
                      }} placeholder="0" />
                  </Field>
                  <Field label="Weight (Tons) *">
                    <input required type="number" step="0.1" min={0} className={INPUT} value={form.weight || ''} onChange={e => setF('weight', parseFloat(e.target.value) || 0)} placeholder="22.5" />
                  </Field>
                  <Field label="Packages">
                    <input type="number" min={0} className={INPUT} value={form.packages || ''} onChange={e => setF('packages', parseInt(e.target.value) || 0)} placeholder="150" />
                  </Field>
                  <Field label="Freight (₹) *">
                    <input required type="number" min={0} className={INPUT + ' font-semibold'} value={form.freight || ''}
                      onChange={e => setF('freight', parseInt(e.target.value) || 0)} placeholder="45000" />
                  </Field>
                  <Field label="Loading Chg. (₹)">
                    <input type="number" min={0} className={INPUT} value={form.loadingCharges || ''} onChange={e => setF('loadingCharges', parseInt(e.target.value) || 0)} placeholder="0" />
                  </Field>
                  <Field label="Unloading Chg. (₹)">
                    <input type="number" min={0} className={INPUT} value={form.unloadingCharges || ''} onChange={e => setF('unloadingCharges', parseInt(e.target.value) || 0)} placeholder="0" />
                  </Field>
                  <Field label="Other Chg. (₹)">
                    <input type="number" min={0} className={INPUT} value={form.otherCharges || ''} onChange={e => setF('otherCharges', parseInt(e.target.value) || 0)} placeholder="0" />
                  </Field>
                  <Field label="Commission (-)">
                    <input type="number" min={0} className={INPUT} value={form.commission || ''} onChange={e => setF('commission', parseInt(e.target.value) || 0)} placeholder="0" />
                  </Field>
                  <Field label="Advance (₹)">
                    <input type="number" min={0} className={INPUT} value={form.advance || ''} onChange={e => setF('advance', parseInt(e.target.value) || 0)} placeholder="10000" />
                  </Field>
                </div>
                {/* Total preview */}
                <div className="mt-4 bg-slate-50 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-slate-500">Total Amount</div>
                    <div className="text-lg font-bold text-slate-800">₹{computedTotal.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Advance</div>
                    <div className="text-lg font-bold text-blue-600">₹{form.advance.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Balance Payable</div>
                    <div className="text-lg font-bold text-green-600">₹{computedBalance.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Submitting…' : 'Submit for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Trip Modal (Manager only) ── */}
      {editTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-bold text-slate-800">Edit Trip — {editTrip.voucherNo}</h3>
                <p className="text-xs text-slate-400">{editTrip.origin} → {editTrip.destination} · {editTrip.customer}</p>
              </div>
              <button onClick={() => setEditTrip(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-6">

              {/* Customer */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Customer Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Customer Name *">
                    <input required className={INPUT} value={editForm.customer} onChange={e => setEditForm(f => ({ ...f, customer: e.target.value }))} />
                  </Field>
                  <Field label="Contact Person">
                    <input className={INPUT} value={editForm.contactPerson} onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))} />
                  </Field>
                  <Field label="Contact No.">
                    <input className={INPUT} value={editForm.contactNo} onChange={e => setEditForm(f => ({ ...f, contactNo: e.target.value }))} />
                  </Field>
                  <Field label="Payment Terms">
                    <select className={SELECT} value={editForm.paymentTerms} onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))}>
                      {['Advance', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'On Delivery'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Credit Days">
                    <input type="number" min={0} className={INPUT} value={editForm.creditDays} onChange={e => setEditForm(f => ({ ...f, creditDays: parseInt(e.target.value) || 0 }))} />
                  </Field>
                </div>
              </div>

              {/* Route */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Route & Assignment</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <Field label="Origin"><input className={INPUT} value={editForm.origin} onChange={e => setEditForm(f => ({ ...f, origin: e.target.value }))} /></Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Destination"><input className={INPUT} value={editForm.destination} onChange={e => setEditForm(f => ({ ...f, destination: e.target.value }))} /></Field>
                  </div>
                  <Field label="Distance (km)">
                    <input type="number" min={0} className={INPUT} value={editForm.distance || ''}
                      onChange={e => { const d = parseInt(e.target.value) || 0; setEditForm(f => ({ ...f, distance: d, approxTimeHrs: Math.ceil(d / 30) })); }} />
                  </Field>
                  <Field label="Approx. Time">
                    <input readOnly className={INPUT + ' bg-slate-50'} value={editForm.approxTimeHrs ? fmtHrs(editForm.approxTimeHrs) : ''} />
                  </Field>
                  <Field label="Vehicle ID">
                    <input className={INPUT} value={editForm.vehicleId} onChange={e => setEditForm(f => ({ ...f, vehicleId: e.target.value }))} />
                  </Field>
                  <Field label="Driver ID">
                    <input className={INPUT} value={editForm.driverId} onChange={e => setEditForm(f => ({ ...f, driverId: e.target.value }))} />
                  </Field>
                  <Field label="Planned Departure">
                    <input type="date" className={INPUT} value={editForm.plannedDate} onChange={e => setEditForm(f => ({ ...f, plannedDate: e.target.value }))} />
                  </Field>
                  <Field label="ETA">
                    <input type="date" className={INPUT} value={editForm.eta} onChange={e => setEditForm(f => ({ ...f, eta: e.target.value }))} />
                  </Field>
                  <Field label="Vehicle Load Type">
                    <select className={SELECT} value={editForm.vehicleLoadType} onChange={e => setEditForm(f => ({ ...f, vehicleLoadType: e.target.value }))}>
                      {['32FT MXL','24FT','20FT','LCV 14FT','LCV 10FT','Container 40FT','Container 20FT','Trailer','Flatbed'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="No. of Vehicles">
                    <input type="number" min={1} className={INPUT} value={editForm.noOfVehicles} onChange={e => setEditForm(f => ({ ...f, noOfVehicles: parseInt(e.target.value) || 1 }))} />
                  </Field>
                </div>

                {/* Via stops edit */}
                {editStops.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-slate-500">Via Stops</p>
                    {editStops.map((stop, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${stop.type === 'Pickup' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {stop.type === 'Pickup' ? '↑' : '↓'}
                        </div>
                        <input className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" value={stop.city}
                          onChange={e => setEditStops(s => s.map((x, idx) => idx === i ? { ...x, city: e.target.value } : x))} />
                        <select className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" value={stop.type}
                          onChange={e => setEditStops(s => s.map((x, idx) => idx === i ? { ...x, type: e.target.value as 'Pickup' | 'Delivery' } : x))}>
                          <option>Pickup</option><option>Delivery</option>
                        </select>
                        <input type="number" min={0} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center" value={stop.distanceFromPrev || ''}
                          onChange={e => setEditStops(s => s.map((x, idx) => idx === i ? { ...x, distanceFromPrev: parseInt(e.target.value) || 0 } : x))} placeholder="km" />
                        <button type="button" onClick={() => setEditStops(s => s.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setEditStops(s => [...s, { city: '', type: 'Delivery', distanceFromPrev: 0 }])}
                  className="mt-3 text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                  + Add Via Stop
                </button>
              </div>

              {/* Charges — most likely to be revised */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Charges (Revise as needed)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Content / Cargo">
                    <input className={INPUT} value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} />
                  </Field>
                  <Field label="Rate Type">
                    <select className={SELECT} value={editForm.rateType} onChange={e => setEditForm(f => ({ ...f, rateType: e.target.value }))}>
                      {['FIXED','PER KM','PER TON','PER PACKAGE'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Weight (T)">
                    <input type="number" step="0.1" min={0} className={INPUT} value={editForm.weight || ''} onChange={e => setEditForm(f => ({ ...f, weight: parseFloat(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Packages">
                    <input type="number" min={0} className={INPUT} value={editForm.packages || ''} onChange={e => setEditForm(f => ({ ...f, packages: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Freight (₹) *">
                    <input required type="number" min={0} className={INPUT + ' font-semibold'} value={editForm.freight || ''} onChange={e => setEditForm(f => ({ ...f, freight: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Loading Chg. (₹)">
                    <input type="number" min={0} className={INPUT} value={editForm.loadingCharges || ''} onChange={e => setEditForm(f => ({ ...f, loadingCharges: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Unloading Chg. (₹)">
                    <input type="number" min={0} className={INPUT} value={editForm.unloadingCharges || ''} onChange={e => setEditForm(f => ({ ...f, unloadingCharges: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Other Chg. (₹)">
                    <input type="number" min={0} className={INPUT} value={editForm.otherCharges || ''} onChange={e => setEditForm(f => ({ ...f, otherCharges: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Commission (-)">
                    <input type="number" min={0} className={INPUT} value={editForm.commission || ''} onChange={e => setEditForm(f => ({ ...f, commission: parseInt(e.target.value) || 0 }))} />
                  </Field>
                  <Field label="Advance (₹)">
                    <input type="number" min={0} className={INPUT} value={editForm.advance || ''} onChange={e => setEditForm(f => ({ ...f, advance: parseInt(e.target.value) || 0 }))} />
                  </Field>
                </div>
                {/* Live totals */}
                <div className="mt-4 bg-slate-50 rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                  {[
                    ['Total', editForm.freight + editForm.loadingCharges + editForm.unloadingCharges + editForm.otherCharges - editForm.commission, 'text-slate-800'],
                    ['Advance', editForm.advance, 'text-blue-600'],
                    ['Balance', editForm.freight + editForm.loadingCharges + editForm.unloadingCharges + editForm.otherCharges - editForm.commission - editForm.advance, 'text-green-600'],
                  ].map(([label, val, color]) => (
                    <div key={label as string}>
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className={`text-lg font-bold ${color}`}>₹{(val as number).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditTrip(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={editSaving}
                  className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {editSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-800 mb-1">Reject Trip {rejectModal.voucherNo}</h3>
            <p className="text-xs text-slate-500 mb-4">{rejectModal.origin} → {rejectModal.destination} · {rejectModal.customer}</p>
            <form onSubmit={handleReject}>
              <Field label="Reason for Rejection *">
                <textarea required rows={3} className={INPUT} placeholder="Enter the reason why this trip is being rejected..."
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setRejectModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" className="px-5 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Trip Detail Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selected.voucherNo} — {selected.origin} → {selected.destination}</h3>
                <p className="text-xs text-slate-500">{selected.customer} · {selected.plannedDate}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Route with via stops */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 mb-2">
                <span>{selected.origin}</span>
                {selected.viaStops?.map((s, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-blue-400">→</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.type === 'Pickup' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.city} ({s.type}{s.distanceFromPrev ? `, ${s.distanceFromPrev}km` : ''})
                    </span>
                  </span>
                ))}
                <span className="text-blue-400">→</span>
                <span>{selected.destination}</span>
              </div>
              <div className="flex gap-4 text-xs text-blue-600">
                <span>📍 {selected.distance > 0 ? `${selected.distance.toLocaleString()} km` : '—'}</span>
                <span>⏱ {fmtHrs(selected.approxTimeHrs)}</span>
                <span>🚛 {selected.vehicleLoadType}</span>
                <span>🔢 {selected.noOfVehicles} vehicle(s)</span>
              </div>
            </div>

            {/* Rejection reason */}
            {selected.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                <strong>Rejected:</strong> {selected.rejectionReason}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Category', selected.category], ['Segment', selected.segment],
                ['Contact Person', selected.contactPerson], ['Contact No.', selected.contactNo],
                ['Address', selected.address], ['Payment Terms', selected.paymentTerms],
                ['Credit Days', String(selected.creditDays) + ' days'],
                ['Content', selected.content || selected.cargo],
                ['Weight', `${selected.weight} Tons`], ['Packages', String(selected.packages)],
                ['Rate Type', selected.rateType], ['Rate', selected.rate > 0 ? `₹${selected.rate}` : 'Fixed'],
                ['Freight', `₹${(selected.freight || 0).toLocaleString('en-IN')}`],
                ['Loading Chg.', `₹${(selected.loadingCharges || 0).toLocaleString('en-IN')}`],
                ['Unloading Chg.', `₹${(selected.unloadingCharges || 0).toLocaleString('en-IN')}`],
                ['Other Chg.', `₹${(selected.otherCharges || 0).toLocaleString('en-IN')}`],
                ['Commission', `₹${(selected.commission || 0).toLocaleString('en-IN')}`],
                ['Total', `₹${(selected.total || 0).toLocaleString('en-IN')}`],
                ['Advance', `₹${(selected.advance || 0).toLocaleString('en-IN')}`],
                ['Balance', `₹${(selected.balance || 0).toLocaleString('en-IN')}`],
                ['Vehicle', selected.vehicleId || '—'], ['Driver', selected.driverId || '—'],
                ['POD', selected.pod ? 'Collected' : 'Pending'],
                ['Approval', selected.approvalStatus],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="font-medium text-slate-800 text-sm">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Vehicle Placement Modal ── */}
      {placementModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Confirm Vehicle Placement — {placementModal.voucherNo}</h3>
                <p className="text-xs text-slate-400">{placementModal.origin} → {placementModal.destination} · {placementModal.customer}</p>
              </div>
              <button onClick={() => setPlacementModal(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handlePlacementSave} className="p-6 space-y-4">
              <Field label="Vehicle *">
                <select required className={SELECT} value={placementForm.vehicleId}
                  onChange={e => {
                    const vehicleId = e.target.value;
                    const vehicle = vehicleOptions.find(v => v.id === vehicleId);
                    setPlacementForm(f => ({ ...f, vehicleId, driverId: vehicle?.driver || f.driverId }));
                  }}>
                  <option value="">Select vehicle</option>
                  {vehicleOptions.map(v => <option key={v.id} value={v.id}>{v.id} — {v.regNumber} ({v.status})</option>)}
                </select>
              </Field>
              {placementForm.vehicleId && (() => {
                const summary = complianceSummary(placementForm.vehicleId);
                if (!summary) return null;
                return (
                  <div className={`rounded-lg border p-3 space-y-2 ${COMPLIANCE_PANEL_COLORS[summary.worst]}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Vehicle Compliance Check</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${COMPLIANCE_BADGE_COLORS[summary.worst]}`}>
                        {summary.worst}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {summary.items.map(it => (
                        <div key={it.name} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1">
                          <span className="text-slate-600">{it.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${COMPLIANCE_BADGE_COLORS[it.status]}`}>
                            {it.status === 'Expired' ? `Expired ${Math.abs(it.daysLeft)}d ago` : `${it.expiry} (${it.daysLeft}d)`}
                          </span>
                        </div>
                      ))}
                    </div>
                    {summary.worst !== 'Valid' && (
                      <p className="text-xs text-slate-600 pt-1">
                        ⚠ This vehicle has compliance items that are {summary.worst.toLowerCase()} — resolve before dispatch to avoid issues during the trip.
                      </p>
                    )}
                  </div>
                );
              })()}
              <Field label="Driver *">
                <select required className={SELECT} value={placementForm.driverId}
                  onChange={e => setPlacementForm(f => ({ ...f, driverId: e.target.value }))}>
                  <option value="">Select driver</option>
                  {driverOptions.map(d => <option key={d.id} value={d.id}>{d.id} — {d.name} ({d.status})</option>)}
                </select>
              </Field>
              <Field label="Placement Date & Time *">
                <input required type="datetime-local" className={INPUT} value={placementForm.placementDateTime}
                  onChange={e => setPlacementForm(f => ({ ...f, placementDateTime: e.target.value }))} />
              </Field>
              <Field label="Remarks">
                <textarea rows={2} className={INPUT} placeholder="Optional notes for this placement"
                  value={placementForm.placementRemarks} onChange={e => setPlacementForm(f => ({ ...f, placementRemarks: e.target.value }))} />
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setPlacementModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={placementSaving}
                  className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {placementSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {placementSaving ? 'Saving…' : 'Confirm Placement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Generate CN Modal ── */}
      {cnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">{cnModal.cnNumber ? 'Edit Consignee' : 'Generate Consignment Note'} — {cnModal.voucherNo}</h3>
                <p className="text-xs text-slate-400">{cnModal.origin} → {cnModal.destination} · {cnModal.customer}</p>
              </div>
              <button onClick={() => setCnModal(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCnSave} className="p-6 space-y-4">
              <Field label="Consignee Name *">
                <input required className={INPUT} placeholder="Receiving party name" value={cnForm.consigneeName}
                  onChange={e => setCnForm(f => ({ ...f, consigneeName: e.target.value }))} />
              </Field>
              <Field label="Consignee Address *">
                <input required className={INPUT} placeholder="Delivery address" value={cnForm.consigneeAddress}
                  onChange={e => setCnForm(f => ({ ...f, consigneeAddress: e.target.value }))} />
              </Field>
              <Field label="Consignee Contact No.">
                <input className={INPUT} placeholder="9800000000" maxLength={10} value={cnForm.consigneeContact}
                  onChange={e => setCnForm(f => ({ ...f, consigneeContact: e.target.value }))} />
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setCnModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={cnSaving}
                  className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {cnSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {cnSaving ? 'Saving…' : (cnModal.cnNumber ? 'Save Changes' : 'Generate CN')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CN View / Print Modal ── */}
      {cnView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:bg-white print:p-0 print:static">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-none print:shadow-none print:rounded-none print:overflow-visible">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 print:hidden">
              <h3 className="text-base font-bold text-slate-800">Consignment Note — {cnView.cnNumber}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">Print</button>
                <button onClick={() => setCnView(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 text-sm">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Nexantra Technologies</h2>
                  <p className="text-xs text-slate-500">Consignment Note / Lorry Receipt</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">CN No.</div>
                  <div className="font-mono font-bold text-blue-700">{cnView.cnNumber}</div>
                  <div className="text-xs text-slate-500 mt-1">Date</div>
                  <div className="font-medium text-slate-800">{cnView.cnDate}</div>
                </div>
              </div>

              {/* Consignor / Consignee */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Consignor</div>
                  <div className="font-medium text-slate-800">{cnView.customer}</div>
                  <div className="text-xs text-slate-500">{cnView.address}</div>
                  <div className="text-xs text-slate-500 mt-1">{cnView.contactPerson} · {cnView.contactNo}</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Consignee</div>
                  <div className="font-medium text-slate-800">{cnView.consigneeName || '—'}</div>
                  <div className="text-xs text-slate-500">{cnView.consigneeAddress || '—'}</div>
                  <div className="text-xs text-slate-500 mt-1">{cnView.consigneeContact || '—'}</div>
                </div>
              </div>

              {/* Route & Vehicle */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Route & Vehicle</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-xs text-slate-500">From</span><div className="font-medium text-slate-800">{cnView.origin}</div></div>
                  <div><span className="text-xs text-slate-500">To</span><div className="font-medium text-slate-800">{cnView.destination}</div></div>
                  <div><span className="text-xs text-slate-500">Vehicle No.</span><div className="font-medium text-slate-800">{cnView.vehicleId}</div></div>
                  <div><span className="text-xs text-slate-500">Driver</span><div className="font-medium text-slate-800">{cnView.driverId}</div></div>
                  <div><span className="text-xs text-slate-500">Placement Date/Time</span><div className="font-medium text-slate-800">{cnView.placementDateTime ? cnView.placementDateTime.replace('T', ' ') : '—'}</div></div>
                  <div><span className="text-xs text-slate-500">Distance</span><div className="font-medium text-slate-800">{cnView.distance ? `${cnView.distance.toLocaleString()} km` : '—'}</div></div>
                </div>
              </div>

              {/* Goods */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Goods Description</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><span className="text-xs text-slate-500">Content</span><div className="font-medium text-slate-800">{cnView.content || cnView.cargo}</div></div>
                  <div><span className="text-xs text-slate-500">Weight</span><div className="font-medium text-slate-800">{cnView.weight} Tons</div></div>
                  <div><span className="text-xs text-slate-500">Packages</span><div className="font-medium text-slate-800">{cnView.packages}</div></div>
                </div>
              </div>

              {/* Freight */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Freight & Charges</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><span className="text-xs text-slate-500">Freight</span><div className="font-medium text-slate-800">₹{(cnView.freight || 0).toLocaleString('en-IN')}</div></div>
                  <div><span className="text-xs text-slate-500">Payment Terms</span><div className="font-medium text-slate-800">{cnView.paymentTerms}</div></div>
                  <div><span className="text-xs text-slate-500">Total</span><div className="font-bold text-slate-800">₹{(cnView.total || 0).toLocaleString('en-IN')}</div></div>
                  <div><span className="text-xs text-slate-500">Advance</span><div className="font-medium text-slate-800">₹{(cnView.advance || 0).toLocaleString('en-IN')}</div></div>
                  <div><span className="text-xs text-slate-500">Balance</span><div className="font-medium text-blue-700">₹{(cnView.balance || 0).toLocaleString('en-IN')}</div></div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-4 pt-8">
                <div className="border-t border-slate-300 pt-2 text-center text-xs text-slate-500">Consignor Signature</div>
                <div className="border-t border-slate-300 pt-2 text-center text-xs text-slate-500">Carrier / Driver Signature</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
