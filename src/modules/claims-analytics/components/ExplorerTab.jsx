import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Columns3, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react';
import { fetchClaimsPage } from '../api';
import { useAsync } from '../lib';
import { Card, DataState } from '../../../components/analytics/ui';
import { formatINR, formatKm } from '../../../lib/format';

const PAGE = 50;
const selectClass = 'w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

// Table-only filters, merged into the page filters (a value set here replaces the same page chip for this table)
const EMPTY_XF = { status: '', liability_type: '', risk_band: '', subsystem: '', dealer_id: '', part_id: '', nff: '', overrun: '' };

function applyTableFilters(filters, xf) {
  const f = { ...filters };
  ['status', 'liability_type', 'risk_band', 'subsystem', 'dealer_id', 'part_id'].forEach((k) => {
    if (xf[k]) f[k] = [xf[k]];
  });
  if (xf.nff) f.nff = xf.nff === 'yes';
  if (xf.overrun) f.overrun_only = true;
  return f;
}

function FilterField({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// sortable columns are the ones wty_ca_claims_page whitelists
const COLUMNS = [
  { key: 'claim_id', label: 'Claim', sortable: true, render: (r) => <span className="font-mono text-blue-700">{r.claim_id}</span> },
  { key: 'submission_date', label: 'Date', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'claim_source', label: 'Source', render: (r) => (r.claim_source === 'telematics_sim' ? 'Telematics' : 'Seed') },
  { key: 'vin', label: 'VIN', render: (r) => <span className="font-mono text-[11px]">{r.vin}</span> },
  { key: 'variant', label: 'Variant' },
  { key: 'part_name', label: 'Part', sortable: true },
  { key: 'subsystem', label: 'Subsystem' },
  { key: 'dealer_name', label: 'Dealer', sortable: true },
  { key: 'supplier_name', label: 'Supplier', hidden: true },
  { key: 'liability_type', label: 'Liability' },
  {
    key: 'claim_amount_inr', label: 'Amount', sortable: true, align: 'right',
    render: (r) => (
      <span title={r.claim_source === 'telematics_sim' ? 'Reported INR' : 'Derived INR (part cost + billed hours × ₹1,500)'}>
        {formatINR(r.claim_amount_inr)}{r.claim_source !== 'telematics_sim' && <span className="text-violet-500 ml-0.5">◆</span>}
      </span>
    ),
  },
  { key: 'odometer_km_at_failure', label: 'km', sortable: true, align: 'right', render: (r) => formatKm(r.odometer_km_at_failure) },
  { key: 'mis_months', label: 'MIS', sortable: true, align: 'right' },
  { key: 'risk_band', label: 'Risk', render: (r) => <span className={r.risk_band === 'High' ? 'text-rose-600 font-semibold' : r.risk_band === 'Medium' ? 'text-amber-600' : 'text-slate-500'}>{r.risk_band}</span> },
  { key: 'is_nff', label: 'NFF', render: (r) => (r.is_nff ? 'Yes' : ''), hidden: true },
  { key: 'is_labor_overrun', label: 'Overrun', render: (r) => (r.is_labor_overrun ? <span className="text-rose-600">Yes</span> : '') },
];

function toCsv(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => c.label).join(','), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(','))].join('\n');
}

export default function ExplorerTab({ filters: pageFilters, fkey, actions, lookups }) {
  const [xf, setXf] = useState(EMPTY_XF);
  const setField = (k) => (e) => setXf((v) => ({ ...v, [k]: e.target.value }));
  const activeXf = Object.values(xf).filter(Boolean).length;
  const filters = applyTableFilters(pageFilters, xf);
  const [sort, setSort] = useState({ key: 'submission_date', desc: true });
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(() => Object.fromEntries(COLUMNS.map((c) => [c.key, !c.hidden])));
  const [showCols, setShowCols] = useState(false);
  const [exporting, setExporting] = useState(false);

  // reset to first page whenever filters or sort change
  const pageKey = `${fkey}|${JSON.stringify(xf)}|${sort.key}|${sort.desc}`;
  const [lastKey, setLastKey] = useState(pageKey);
  if (lastKey !== pageKey) {
    setLastKey(pageKey);
    setPage(0);
  }

  const state = useAsync(
    () => fetchClaimsPage(filters, { sort: sort.key, desc: sort.desc, limit: PAGE, offset: page * PAGE }),
    `${pageKey}|${page}`,
  );
  const total = state.data?.[0]?.total_count ?? 0;
  const cols = COLUMNS.filter((c) => visible[c.key]);
  const sortable = COLUMNS.filter((c) => c.sortable);
  const dealers = Object.values(lookups?.dealerByName || {}).sort((a, b) => a.dealer_name.localeCompare(b.dealer_name));
  const parts = Object.values(lookups?.partByName || {}).sort((a, b) => a.part_name.localeCompare(b.part_name));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = [];
      for (let offset = 0; offset < total; offset += 500) {
        const rows = await fetchClaimsPage(filters, { sort: sort.key, desc: sort.desc, limit: 500, offset });
        all.push(...rows);
      }
      const blob = new Blob([toCsv(all, COLUMNS)], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `warranty-claims-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card
      title={`Claims (${total.toLocaleString('en-IN')})`}
      subtitle="Sort by any column marked ⇅ · ◆ = derived INR amount (seed claim) · click a row for details"
      actions={
        <>
          <div className="relative">
            <button type="button" onClick={() => setShowCols((v) => !v)} className="flex items-center gap-1 text-xs border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50">
              <Columns3 className="w-3.5 h-3.5" /> Columns
            </button>
            {showCols && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-20">
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer">
                    <input type="checkbox" className="accent-sky-600" checked={visible[c.key]} onChange={(e) => setVisible((v) => ({ ...v, [c.key]: e.target.checked }))} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" disabled={!total || exporting} onClick={exportCsv} className="flex items-center gap-1 text-xs border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </>
      }
    >
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <FilterField label="Status">
            <select value={xf.status} onChange={setField('status')} className={selectClass}>
              <option value="">All</option>
              {['Open', 'Submitted', 'In Review', 'Paid', 'Rejected'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Liability">
            <select value={xf.liability_type} onChange={setField('liability_type')} className={selectClass}>
              <option value="">All</option><option>OEM</option><option>Supplier</option>
            </select>
          </FilterField>
          <FilterField label="Risk">
            <select value={xf.risk_band} onChange={setField('risk_band')} className={selectClass}>
              <option value="">All</option><option>High</option><option>Medium</option><option>Low</option>
            </select>
          </FilterField>
          <FilterField label="Subsystem">
            <select value={xf.subsystem} onChange={setField('subsystem')} className={selectClass}>
              <option value="">All</option>
              {(lookups?.subsystems || []).map((v) => <option key={v}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Dealer">
            <select value={xf.dealer_id} onChange={setField('dealer_id')} className={selectClass}>
              <option value="">All</option>
              {dealers.map((d) => <option key={d.dealer_id} value={d.dealer_id}>{d.dealer_name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Part">
            <select value={xf.part_id} onChange={setField('part_id')} className={selectClass}>
              <option value="">All</option>
              {parts.map((p) => <option key={p.part_id} value={p.part_id}>{p.part_name}</option>)}
            </select>
          </FilterField>
          <FilterField label="NFF">
            <select value={xf.nff} onChange={setField('nff')} className={selectClass}>
              <option value="">Any</option><option value="yes">NFF only</option><option value="no">Fault found</option>
            </select>
          </FilterField>
          <FilterField label="Labor overrun">
            <select value={xf.overrun} onChange={setField('overrun')} className={selectClass}>
              <option value="">Any</option><option value="yes">Overrun only</option>
            </select>
          </FilterField>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-end gap-2">
            <FilterField label="Sort by">
              <select value={sort.key} onChange={(e) => setSort((s) => ({ ...s, key: e.target.value }))} className={`${selectClass} w-44`}>
                {sortable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </FilterField>
            <button type="button" onClick={() => setSort((s) => ({ ...s, desc: !s.desc }))}
              className="flex items-center gap-1 text-xs border border-slate-200 bg-white rounded-md px-2.5 py-1.5 hover:bg-slate-100">
              {sort.desc ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
              {sort.desc ? 'Descending' : 'Ascending'}
            </button>
          </div>
          {activeXf > 0 && (
            <button type="button" onClick={() => setXf(EMPTY_XF)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600">
              <X className="w-3.5 h-3.5" /> Clear {activeXf} table filter{activeXf > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      <DataState state={state} height="h-96">
        {(rows) => (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    {cols.map((c) => (
                      <th key={c.key} className={`py-2 px-2 font-semibold whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>
                        {c.sortable ? (
                          <button type="button" className="inline-flex items-center gap-0.5 hover:text-slate-900"
                            onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}>
                            {c.label}
                            {sort.key === c.key
                              ? (sort.desc ? <ArrowDown className="w-3 h-3 text-blue-600" /> : <ArrowUp className="w-3 h-3 text-blue-600" />)
                              : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                          </button>
                        ) : c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.claim_id} onClick={() => actions.openClaim(r.claim_id)} className="border-b border-slate-50 hover:bg-sky-50 cursor-pointer">
                      {cols.map((c) => (
                        <td key={c.key} className={`py-1.5 px-2 whitespace-nowrap text-slate-700 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                          {c.render ? c.render(r) : r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 mt-3 text-xs text-slate-500">
              <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString('en-IN')}</span>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </>
        )}
      </DataState>
    </Card>
  );
}
