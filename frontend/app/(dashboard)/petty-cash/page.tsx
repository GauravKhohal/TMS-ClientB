'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';

interface Expenses {
  diesel: number; toll: number; food: number; maintenance: number; misc: number;
}
interface PettyCashEntry {
  id: string; tripId: string; driverId: string; driverName: string;
  tripRoute: string; issueDate: string; cashIssued: number;
  expenses: Expenses; totalSpent: number; balance: number;
  status: string; settledDate: string | null; notes: string;
}
interface Summary {
  totalIssued: number; totalSpent: number; pending: number; netBalance: number;
}

const EMPTY_ISSUE = { tripId: '', driverId: '', cashIssued: 0, issueDate: new Date().toISOString().split('T')[0], notes: '' };
const EMPTY_EXP: Expenses = { diesel: 0, toll: 0, food: 0, maintenance: 0, misc: 0 };

const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = INPUT + " bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    Settled: 'bg-green-100 text-green-700',
    Pending: 'bg-yellow-100 text-yellow-700',
    'Short Paid': 'bg-red-100 text-red-700',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}

function inr(n: number) {
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}

export default function PettyCashPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <PettyCashPageInner />
    </Suspense>
  );
}

function PettyCashPageInner() {
  const searchParams = useSearchParams();
  const searchParam = searchParams.get('search');

  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIssued: 0, totalSpent: 0, pending: 0, netBalance: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState(searchParam || '');
  const [successMsg, setSuccessMsg] = useState('');

  // Issue cash modal
  const [showIssue, setShowIssue] = useState(false);
  const [issueForm, setIssueForm] = useState(EMPTY_ISSUE);
  const [issueSaving, setIssueSaving] = useState(false);

  // Reconcile modal
  const [reconciling, setReconciling] = useState<PettyCashEntry | null>(null);
  const [expForm, setExpForm] = useState<Expenses>(EMPTY_EXP);
  const [expNotes, setExpNotes] = useState('');
  const [expSaving, setExpSaving] = useState(false);

  // Ledger modal
  const [ledgerDriver, setLedgerDriver] = useState<string | null>(null);

  useEffect(() => {
    api.pettyCash()
      .then((data: { entries: PettyCashEntry[]; summary: Summary }) => {
        setEntries(data.entries);
        setSummary(data.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toast(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  }

  function recalcSummary(updated: PettyCashEntry[]) {
    setSummary({
      totalIssued: updated.reduce((s, p) => s + p.cashIssued, 0),
      totalSpent: updated.reduce((s, p) => s + p.totalSpent, 0),
      pending: updated.filter(p => p.status === 'Pending').length,
      netBalance: updated.reduce((s, p) => s + p.balance, 0),
    });
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setIssueSaving(true);
    try {
      const res = await api.issuePettyCash(issueForm);
      const updated = [res.entry, ...entries];
      setEntries(updated);
      recalcSummary(updated);
      setIssueForm(EMPTY_ISSUE);
      setShowIssue(false);
      toast('Cash issued successfully!');
    } catch { toast('Error issuing cash'); }
    setIssueSaving(false);
  }

  async function handleReconcile(e: React.FormEvent) {
    e.preventDefault();
    if (!reconciling) return;
    setExpSaving(true);
    try {
      const res = await api.reconcilePettyCash(reconciling.id, { ...expForm, notes: expNotes });
      const updated = entries.map(p => p.id === reconciling.id ? res.entry : p);
      setEntries(updated);
      recalcSummary(updated);
      setReconciling(null);
      setExpForm(EMPTY_EXP);
      setExpNotes('');
      toast(`Reconciled for ${reconciling.driverName}`);
    } catch { toast('Error reconciling'); }
    setExpSaving(false);
  }

  function openReconcile(entry: PettyCashEntry) {
    setReconciling(entry);
    setExpForm({ ...entry.expenses });
    setExpNotes(entry.notes || '');
  }

  const totalExp = expForm.diesel + expForm.toll + expForm.food + expForm.maintenance + expForm.misc;
  const previewBalance = reconciling ? reconciling.cashIssued - totalExp : 0;

  const filtered = entries.filter(p => {
    const matchFilter = filter === 'All' || p.status === filter;
    const matchSearch = p.driverName.toLowerCase().includes(search.toLowerCase()) ||
      p.tripId.toLowerCase().includes(search.toLowerCase()) ||
      p.tripRoute.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  // Ledger: all entries for a driver, sorted by date, with running balance
  const ledgerEntries = ledgerDriver
    ? [...entries].filter(p => p.driverName === ledgerDriver).sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    : [];
  let running = 0;

  // Download Excel
  function downloadExcel() {
    const rows = entries.map(p => ({
      'Entry ID': p.id, 'Trip ID': p.tripId, 'Driver': p.driverName,
      'Route': p.tripRoute, 'Issue Date': p.issueDate,
      'Cash Issued (₹)': p.cashIssued,
      'Diesel (₹)': p.expenses.diesel, 'Toll (₹)': p.expenses.toll,
      'Food (₹)': p.expenses.food, 'Maintenance (₹)': p.expenses.maintenance,
      'Misc (₹)': p.expenses.misc, 'Total Spent (₹)': p.totalSpent,
      'Balance (₹)': p.balance, 'Status': p.status,
      'Settled Date': p.settledDate || '', 'Notes': p.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Petty Cash');
    XLSX.writeFile(wb, 'petty_cash_ledger.xlsx');
  }

  const uniqueDrivers = [...new Set(entries.map(p => p.driverName))];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {successMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Cash Issued', value: inr(summary.totalIssued), color: 'text-slate-800', sub: 'All entries' },
          { label: 'Total Spent', value: inr(summary.totalSpent), color: 'text-blue-600', sub: 'By drivers' },
          { label: 'Pending Reconciliation', value: summary.pending, color: 'text-yellow-600', sub: 'Trips not settled' },
          {
            label: summary.netBalance >= 0 ? 'Net Recoverable' : 'Net Payable to Drivers',
            value: inr(summary.netBalance),
            color: summary.netBalance >= 0 ? 'text-green-600' : 'text-red-600',
            sub: summary.netBalance >= 0 ? 'Drivers owe company' : 'Company owes drivers',
          },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs font-medium text-slate-700 mt-1">{c.label}</div>
            <div className="text-xs text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['All', 'Pending', 'Settled', 'Short Paid'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            {s}
            <span className="ml-1.5 text-xs opacity-70">({s === 'All' ? entries.length : entries.filter(p => p.status === s).length})</span>
          </button>
        ))}
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Ledger view dropdown */}
            <select value={ledgerDriver || ''} onChange={e => setLedgerDriver(e.target.value || null)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Ledger Book — Select Driver</option>
              {uniqueDrivers.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={downloadExcel}
              className="px-3 py-2 text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Excel
            </button>
            <button onClick={() => setShowIssue(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Issue Cash
            </button>
          </div>
          <input type="text" placeholder="Search driver, trip, route..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 ml-auto" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Trip', 'Driver', 'Route', 'Issue Date', 'Cash Issued', 'Diesel', 'Toll', 'Food', 'Maintenance', 'Misc', 'Total Spent', 'Balance', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{p.tripId}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800 whitespace-nowrap">{p.driverName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{p.tripRoute}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{p.issueDate}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{inr(p.cashIssued)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.expenses.diesel ? inr(p.expenses.diesel) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.expenses.toll ? inr(p.expenses.toll) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.expenses.food ? inr(p.expenses.food) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.expenses.maintenance ? inr(p.expenses.maintenance) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.expenses.misc ? inr(p.expenses.misc) : '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700 whitespace-nowrap">{p.totalSpent ? inr(p.totalSpent) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.status === 'Pending' && p.totalSpent === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span className={`text-sm font-bold ${p.balance > 0 ? 'text-green-600' : p.balance < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {p.balance > 0 ? '+' : ''}{inr(p.balance)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.status === 'Pending' ? (
                      <button onClick={() => openReconcile(p)}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-800 border border-emerald-200 px-2 py-1 rounded-lg">
                        Reconcile
                      </button>
                    ) : (
                      <button onClick={() => openReconcile(p)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 px-2 py-1 rounded-lg">
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-10">No entries found.</div>
          )}
        </div>
      </div>

      {/* ── Issue Cash Modal ── */}
      {showIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Issue Petty Cash</h3>
              <button onClick={() => setShowIssue(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleIssue} className="p-6 space-y-4">
              <Field label="Trip ID *">
                <input required value={issueForm.tripId} onChange={e => setIssueForm(f => ({ ...f, tripId: e.target.value }))}
                  placeholder="T001" className={INPUT} />
              </Field>
              <Field label="Driver ID *">
                <input required value={issueForm.driverId} onChange={e => setIssueForm(f => ({ ...f, driverId: e.target.value }))}
                  placeholder="D001" className={INPUT} />
              </Field>
              <Field label="Cash Amount (₹) *">
                <input required type="number" min={1} value={issueForm.cashIssued || ''}
                  onChange={e => setIssueForm(f => ({ ...f, cashIssued: parseInt(e.target.value) || 0 }))}
                  placeholder="15000" className={INPUT} />
              </Field>
              <Field label="Issue Date *">
                <input required type="date" value={issueForm.issueDate}
                  onChange={e => setIssueForm(f => ({ ...f, issueDate: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="Notes">
                <input value={issueForm.notes} onChange={e => setIssueForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional note" className={INPUT} />
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowIssue(false)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={issueSaving}
                  className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {issueSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {issueSaving ? 'Saving...' : 'Issue Cash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reconcile Modal ── */}
      {reconciling && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Reconcile — {reconciling.driverName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{reconciling.tripRoute} · {reconciling.tripId}</p>
              </div>
              <button onClick={() => setReconciling(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleReconcile} className="p-6 space-y-5">
              {/* Cash issued banner */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-blue-700 font-medium">Cash Issued to Driver</span>
                <span className="text-lg font-bold text-blue-700">{inr(reconciling.cashIssued)}</span>
              </div>

              {/* Expense breakdown */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Expense Breakdown</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['diesel', 'toll', 'food', 'maintenance', 'misc'] as (keyof Expenses)[]).map(k => (
                    <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1) + ' (₹)'}>
                      <input type="number" min={0} value={expForm[k] || ''}
                        onChange={e => setExpForm(f => ({ ...f, [k]: parseInt(e.target.value) || 0 }))}
                        placeholder="0" className={INPUT} />
                    </Field>
                  ))}
                </div>
              </div>

              {/* Live balance preview */}
              <div className={`rounded-xl px-4 py-3 flex justify-between items-center ${previewBalance >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Total Spent</div>
                  <div className="text-sm font-bold text-slate-700">{inr(totalExp)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">↔</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-0.5">{previewBalance >= 0 ? 'Driver Returns' : 'Company Pays Driver'}</div>
                  <div className={`text-lg font-bold ${previewBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {previewBalance >= 0 ? '+' : ''}{inr(previewBalance)}
                  </div>
                </div>
              </div>

              <Field label="Notes">
                <input value={expNotes} onChange={e => setExpNotes(e.target.value)}
                  placeholder="Add reconciliation notes..." className={INPUT} />
              </Field>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setReconciling(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={expSaving}
                  className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
                  {expSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {expSaving ? 'Saving...' : 'Confirm Reconciliation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Ledger Book Modal ── */}
      {ledgerDriver && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Ledger Book — {ledgerDriver}</h3>
                <p className="text-xs text-slate-500">Complete petty cash history</p>
              </div>
              <button onClick={() => setLedgerDriver(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase">Trip / Route</th>
                    <th className="pb-2 text-right text-xs font-semibold text-red-400 uppercase">Debit (Given)</th>
                    <th className="pb-2 text-right text-xs font-semibold text-green-500 uppercase">Credit (Spent)</th>
                    <th className="pb-2 text-right text-xs font-semibold text-slate-500 uppercase">Balance</th>
                    <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase pl-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ledgerEntries.map(p => {
                    running += p.cashIssued - p.totalSpent;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 text-xs text-slate-600">{p.issueDate}</td>
                        <td className="py-3">
                          <div className="text-xs font-medium text-slate-700">{p.tripId}</div>
                          <div className="text-xs text-slate-400">{p.tripRoute}</div>
                        </td>
                        <td className="py-3 text-right text-sm font-medium text-red-500">{inr(p.cashIssued)}</td>
                        <td className="py-3 text-right text-sm font-medium text-green-600">{p.totalSpent ? inr(p.totalSpent) : '—'}</td>
                        <td className="py-3 text-right">
                          <span className={`text-sm font-bold ${running >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {running >= 0 ? '+' : ''}{inr(running)}
                          </span>
                        </td>
                        <td className="py-3 pl-4"><StatusBadge status={p.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={2} className="pt-3 text-xs font-semibold text-slate-600 uppercase">Total</td>
                    <td className="pt-3 text-right text-sm font-bold text-red-500">{inr(ledgerEntries.reduce((s, p) => s + p.cashIssued, 0))}</td>
                    <td className="pt-3 text-right text-sm font-bold text-green-600">{inr(ledgerEntries.reduce((s, p) => s + p.totalSpent, 0))}</td>
                    <td className="pt-3 text-right">
                      <span className={`text-sm font-bold ${running >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {running >= 0 ? '+' : ''}{inr(running)}
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              {ledgerEntries.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-8">No entries for this driver.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
