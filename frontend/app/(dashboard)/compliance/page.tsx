'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DateRangeBar } from '@/components/DateRangeBar';
import { useDateRange } from '@/lib/useDateRange';

interface DocItem {
  status: string;
  expiry: string;
  daysLeft: number;
  provider?: string;
}

interface ComplianceRecord {
  vehicleId: string;
  rc: DocItem;
  insurance: DocItem;
  fitness: DocItem;
  pollution: DocItem;
  statePermit: DocItem;
  nationalPermit: DocItem;
}

interface Driver {
  id: string;
  name: string;
  dlNumber: string;
  licenseExpiry: string;
  licenseDaysLeft?: number;
  licenseStatus?: string;
}

const STATUS_STYLES: Record<string, string> = {
  Valid:           'bg-green-100 text-green-700',
  'Due Soon':      'bg-yellow-100 text-yellow-700',
  'Expiring Soon': 'bg-orange-100 text-orange-700',
  Expired:         'bg-red-100 text-red-700',
};

function daysLeft(expiryStr: string) {
  return Math.ceil((new Date(expiryStr).getTime() - Date.now()) / 86400000);
}

function licenseStatus(days: number) {
  if (days < 0)   return 'Expired';
  if (days <= 30)  return 'Expiring Soon';
  if (days <= 90)  return 'Due Soon';
  return 'Valid';
}

function ComplianceCell({ item }: { item: DocItem }) {
  const days = item.daysLeft;
  return (
    <td className="px-4 py-3">
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[item.status] || 'bg-slate-100 text-slate-600'}`}>
        {item.status}
      </span>
      <div className="text-xs text-slate-400 mt-0.5">{item.expiry}</div>
      <div className={`text-xs font-medium mt-0.5 ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : days <= 90 ? 'text-yellow-600' : 'text-slate-400'}`}>
        {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
      </div>
    </td>
  );
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function CompliancePage() {
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange } = useDateRange();

  useEffect(() => {
    Promise.all([api.compliance(), api.drivers()])
      .then(([comp, drvs]) => { setRecords(comp); setDrivers(drvs); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter records to vehicles with any doc expiring within the selected period
  const filteredRecords = records.filter(r =>
    [r.rc, r.insurance, r.fitness, r.pollution, r.statePermit, r.nationalPermit].some(d => inRange(d.expiry))
  );
  const displayRecords = filteredRecords.length > 0 ? filteredRecords : records;

  const allDocs = records.flatMap(r => [r.rc, r.insurance, r.fitness, r.pollution, r.statePermit, r.nationalPermit]);
  const expired  = allDocs.filter(d => d.status === 'Expired').length;
  const expiring = allDocs.filter(d => d.status === 'Expiring Soon').length;
  const dueSoon  = allDocs.filter(d => d.status === 'Due Soon').length;
  const valid    = allDocs.filter(d => d.status === 'Valid').length;

  function handleExport() {
    const headers = ['Vehicle', 'RC Status', 'RC Expiry', 'RC Days Left', 'Insurance Status', 'Insurance Expiry', 'Insurance Days Left', 'Fitness Status', 'Fitness Expiry', 'Fitness Days Left', 'Pollution Status', 'Pollution Expiry', 'State Permit', 'State Expiry', 'National Permit', 'National Expiry'];
    const rows = displayRecords.map(r => [
      r.vehicleId,
      r.rc.status, r.rc.expiry, String(r.rc.daysLeft),
      r.insurance.status, r.insurance.expiry, String(r.insurance.daysLeft),
      r.fitness.status, r.fitness.expiry, String(r.fitness.daysLeft),
      r.pollution.status, r.pollution.expiry, String(r.pollution.daysLeft),
      r.statePermit.status, r.statePermit.expiry,
      r.nationalPermit.status, r.nationalPermit.expiry,
    ]);
    downloadCSV('tms_compliance_report.csv', rows, headers);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      <DateRangeBar preset={preset} setPreset={setPreset} fromYM={fromYM} setFromYM={setFromYM} toYM={toYM} setToYM={setToYM} effectiveFrom={effectiveFrom} effectiveTo={effectiveTo} count={filteredRecords.length} total={records.length} />

      {/* Alert banner */}
      {(expired > 0 || expiring > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-red-700">{expired} Expired · {expiring} Expiring within 30 days</div>
            <div className="text-xs text-red-500">Immediate action required to avoid fines</div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Valid',           value: valid,    color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Due in 90 days',  value: dueSoon,  color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Expiring (30d)',   value: expiring, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Expired',          value: expired,  color: 'text-red-600',    bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-slate-100`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-600 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Threshold legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Valid — 90+ days remaining</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Due Soon — 31–90 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Expiring Soon — within 30 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Expired</span>
      </div>

      {/* Compliance Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-800">Fleet Compliance Matrix</h3>
          <button onClick={handleExport}
            className="text-sm text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Vehicle', 'RC', 'Insurance', 'Fitness Cert.', 'Pollution Cert.', 'State Permit', 'National Permit'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayRecords.map(r => (
                <tr key={r.vehicleId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-sm font-medium text-slate-700">{r.vehicleId}</td>
                  <ComplianceCell item={r.rc} />
                  <ComplianceCell item={r.insurance} />
                  <ComplianceCell item={r.fitness} />
                  <ComplianceCell item={r.pollution} />
                  <ComplianceCell item={r.statePermit} />
                  <ComplianceCell item={r.nationalPermit} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver License Compliance — from real API data */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Driver License Compliance</h3>
        <div className="space-y-3">
          {drivers.map(d => {
            const days = daysLeft(d.licenseExpiry);
            const status = licenseStatus(days);
            return (
              <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-slate-700">{d.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{d.dlNumber} · Exp: {d.licenseExpiry}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : days <= 90 ? 'text-yellow-600' : 'text-slate-400'}`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>{status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
