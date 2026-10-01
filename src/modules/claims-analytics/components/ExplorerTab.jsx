import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Columns3, ArrowUp, ArrowDown } from 'lucide-react';
import { fetchClaimsPage } from '../api';
import { useAsync } from '../lib';
import { Card, DataState } from '../../../components/analytics/ui';
import { formatINR, formatKm } from '../../../lib/format';

const PAGE = 50;

// sortable columns are the ones wty_ca_claims_page whitelists
const COLUMNS = [
  { key: 'claim_id', label: 'Claim', sortable: true, render: (r) => <span className="font-mono text-sky-700">{r.claim_id}</span> },
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

export default function ExplorerTab({ filters, fkey, actions }) {
  const [sort, setSort] = useState({ key: 'submission_date', desc: true });
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(() => Object.fromEntries(COLUMNS.map((c) => [c.key, !c.hidden])));
  const [showCols, setShowCols] = useState(false);
  const [exporting, setExporting] = useState(false);

  // reset to first page whenever filters or sort change
  const pageKey = `${fkey}|${sort.key}|${sort.desc}`;
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
      subtitle="Server-side paging and sorting · ◆ = derived INR amount (seed claim) · click a row for details"
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
                            {sort.key === c.key && (sort.desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
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
