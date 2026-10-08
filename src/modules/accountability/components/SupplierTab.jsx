import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from 'recharts';
import { fetchSupplierScorecard, fetchMatrix, fetchHeadToHead, fetchSignalDetail, fetchBreakdown } from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { Card, DataState, Segmented, Heatmap } from '../../../components/analytics/ui';
import { formatINR, formatKm, formatPct } from '../../../lib/format';
import { supplierBand, toCsv, downloadCsv, signed } from '../lib';
import { CsvButton, Table } from './common';

// Design: docs/modules/dealer-supplier-accountability/design.md §9. No PPM: there is no fitted-volume denominator.


export default function SupplierTab({ scoreFilters, local, lookups, actions }) {
  const card = useAsync(() => fetchSupplierScorecard(scoreFilters), `sup|${JSON.stringify(scoreFilters)}`);
  const config = lookups?.config;
  const minClaims = local.minClaims ?? config?.minClaims ?? 10;
  const rows = (card.data || []).map((s) => ({ ...s, uiBand: config ? supplierBand(s, config, minClaims) : s.band }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2"><span className="text-slate-500 font-medium">Min claims to rank</span>
          <Segmented value={minClaims} onChange={local.setMinClaims} options={[5, 10, 20].map((n) => ({ value: n, label: String(n) }))} />
        </span>
        <span className="ml-auto text-slate-400">No PPM: dim_part lists one supplier for every part, so there is no fitted-volume denominator. Indices compare suppliers on the same parts.</span>
      </div>
      <Scorecard state={card} rows={rows} actions={actions} />
      <SupplierPartMatrix filters={scoreFilters} local={local} lookups={lookups} actions={actions} />
      {/* Same part, different suppliers and supplier evidence are hidden */}
    </div>
  );
}

// Q1
function Scorecard({ state, rows, actions }) {
  const cols = [
    { key: 'supplier_name', label: 'Supplier', render: (r) => <span className="font-medium text-slate-800">{r.supplier_name}</span> },
    { key: 'tier', label: 'Stated → observed', render: (r) => (
      <span>{r.stated_risk_tier}{r.observed_tier && <> → <span className={r.tier_mismatch ? 'text-amber-700 font-semibold' : ''}>{r.observed_tier}</span></>}{r.tier_mismatch && <span title="Observed quality tier differs from dim_supplier.risk_tier"> ⚠</span>}</span>
    ) },
    { key: 'claims', label: 'Claims', align: 'right' },
    { key: 'liable_cost_inr', label: 'Liable ₹', align: 'right', render: (r) => formatINR(r.liable_cost_inr) },
    { key: 'cost_index', label: 'Cost ×', align: 'right', render: (r) => Number(r.cost_index).toFixed(2) },
    { key: 'nff_rate', label: 'NFF', align: 'right', render: (r) => formatPct(r.nff_rate, 0) },
    { key: 'recovery_rate', label: 'Recov.', align: 'right', render: (r) => formatPct(r.recovery_rate, 0) },
    { key: 'agreed_pct', label: 'Agreed', align: 'right', render: (r) => formatPct(r.agreed_pct, 0) },
    { key: 'compliance_gap', label: 'Gap', align: 'right', render: (r) => (r.compliance_gap === null ? '—' : <span className={Number(r.compliance_gap) < 0 ? 'text-rose-600' : 'text-emerald-600'}>{signed(Number(r.compliance_gap) * 100, 0)} pt</span>) },
    { key: 'shortfall_inr', label: 'Shortfall', align: 'right', render: (r) => formatINR(r.shortfall_inr) },
    { key: 'missed_recovery_inr', label: 'Missed', align: 'right', render: (r) => formatINR(r.missed_recovery_inr) },
    { key: 'open_cases', label: 'Open cases', align: 'right' },
  ];
  const exportCsv = () => downloadCsv(toCsv(rows, [
    { key: 'supplier_id', label: 'Supplier ID' }, { key: 'supplier_name', label: 'Supplier' }, { key: 'stated_risk_tier', label: 'Stated tier' },
    { key: 'observed_tier', label: 'Observed tier' }, { key: 'claims', label: 'Claims' }, { key: 'liable_claims', label: 'Liable claims' },
    { key: 'liable_cost_inr', label: 'Liable INR' }, { key: 'cost_index', label: 'Cost index' },
    { key: 'nff_rate', label: 'NFF rate' }, { key: 'median_km', label: 'Median km' }, { key: 'recovery_rate', label: 'Recovery rate' },
    { key: 'agreed_pct', label: 'Agreed %' }, { key: 'compliance_gap', label: 'Compliance gap' }, { key: 'shortfall_inr', label: 'Shortfall INR' },
    { key: 'missed_recovery_inr', label: 'Missed recovery INR' }, { key: 'open_cases', label: 'Open cases' },
  ]), 'supplier-scorecard');
  return (
    <Card title="Supplier scorecard" subtitle="Failures-only, mix-adjusted quality · recovery vs agreement"
      info="Cost × = cost ÷ network average cost of the same parts. Ranked over the last 12 months up to the as-of date. Observed tier uses quality only. Gap = recovery rate minus the agreed recovery %. Agreement terms are a demo seed."
      actions={<CsvButton onClick={exportCsv} disabled={!rows.length} />}>
      <DataState state={state}>
        {() => <Table rows={rows} cols={cols} rowKey={(r) => r.supplier_id} onRow={(r) => actions.openSupplier(r.supplier_id)} rowClass={(r) => (r.uiBand === 'Not ranked' ? 'text-slate-400' : '')} />}
      </DataState>
    </Card>
  );
}


// Q3 (reuses the Claims & Repair matrix)
const MEASURES = { claims: 'Claims', cost_inr: 'Cost', nff_rate: 'NFF %' };

function SupplierPartMatrix({ filters, local, lookups, actions }) {
  const m = useAsync(() => fetchMatrix(filters, 'supplier', 'part'), `smx|${JSON.stringify(filters)}`);
  const measure = MEASURES[local.heatMeasure] ? local.heatMeasure : 'claims';
  const partCost = {};
  (m.data || []).forEach((c) => { partCost[c.y_key] = (partCost[c.y_key] || 0) + Number(c.cost_inr); });
  const parts = Object.entries(partCost).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const suppliers = [...new Set((m.data || []).map((c) => c.x_key))].sort();
  const cells = Object.fromEntries((m.data || []).map((c) => [`${c.x_key}|${c.y_key}`, c]));
  const fmt = measure === 'cost_inr' ? formatINR : measure === 'claims' ? (v) => String(v) : (v) => formatPct(v, 0);
  return (
    <Card title="Supplier × part" subtitle="Top 10 parts by cost"
      info="Which supplier-part pairs drive cost. Click a cell to add both chips."
      actions={<Segmented size="xs" value={measure} onChange={local.setHeatMeasure} options={Object.entries(MEASURES).map(([value, label]) => ({ value, label }))} />}>
      <DataState state={m}>
        {() => (
          <div className="max-h-[320px] overflow-auto">
            <Heatmap rows={suppliers} cols={parts} rowLabel="Supplier"
              getValue={(r, c) => { const v = cells[`${r}|${c}`]?.[measure]; return v === undefined || v === null ? null : Number(v); }}
              format={fmt}
              onCellClick={(r, c) => {
                const sid = lookups?.supplierIdByName[r];
                const pid = lookups?.partIdByName[c];
                if (sid) actions.addChip('supplier_id', sid, r);
                if (pid) actions.addChip('part_id', pid, c);
              }} />
          </div>
        )}
      </DataState>
    </Card>
  );
}

// Q4
function HeadToHead({ filters, fkey, local, lookups, actions }) {
  const chipPart = local.chips.part_id?.[0]?.value;
  // default: the costliest part in the current filter
  const top = useAsync(() => fetchBreakdown(filters, 'part', 1), `top|${fkey}`);
  const partId = local.h2hPart || chipPart || lookups?.partIdByName[top.data?.[0]?.key] || null;
  // the selected part replaces any part / supplier chips so every source of that part is compared
  const f = { ...filters, part_id: partId ? [partId] : [], supplier_id: [] };
  const state = useAsync(() => (partId ? fetchHeadToHead(f) : Promise.resolve([])), `h2h|${fkey}|${partId}`);
  const rows = state.data || [];
  const maxKm = Math.max(1, ...rows.map((r) => Number(r.km_p75 || 0)));
  return (
    <Card title="Same part, different suppliers" subtitle="km at failure (p25 – median – p75) per supplier of the selected part · selected date range"
      info="The supplier on a claim often differs from dim_part's supplier (known issue B4), so most parts have several sources. Boxes further left fail earlier. Click a row to add the supplier chip."
      actions={(
        <select value={partId || ''} onChange={(e) => local.setH2hPart(e.target.value || null)} className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white max-w-xs">
          {!partId && <option value="">Pick a part…</option>}
          {(lookups?.parts || []).map((p) => <option key={p.part_id} value={p.part_id}>{p.part_name}</option>)}
        </select>
      )}>
      <DataState state={state} height="h-40" empty="No claims for this part in the selected range.">
        {() => (
          <div className="space-y-1">
            <div className="grid grid-cols-[9rem_1fr_16rem] gap-3 text-[10px] text-slate-400 uppercase tracking-wide">
              <span>Supplier (claims)</span><span>0 km … {formatKm(maxKm)}</span><span className="text-right">median MIS · NFF · avg cost · recovery</span>
            </div>
            {rows.map((r) => {
              const pos = (v) => `${(100 * Number(v)) / maxKm}%`;
              return (
                <button key={r.supplier_id} type="button" onClick={() => actions.addChip('supplier_id', r.supplier_id, r.supplier_name)}
                  className="w-full grid grid-cols-[9rem_1fr_16rem] gap-3 items-center text-xs hover:bg-slate-50 rounded py-0.5 text-left">
                  <span className="truncate">{r.supplier_name} <span className="text-slate-400">({r.claims})</span></span>
                  <span className="relative h-4 bg-slate-50 rounded" title={`p25 ${formatKm(r.km_p25)} · median ${formatKm(r.km_p50)} · p75 ${formatKm(r.km_p75)}`}>
                    <span className="absolute top-1 bottom-1 bg-sky-200 border border-sky-500 rounded-sm" style={{ left: pos(r.km_p25), width: `calc(${pos(r.km_p75)} - ${pos(r.km_p25)} + 2px)` }} />
                    <span className="absolute top-0 bottom-0 w-0.5 bg-sky-800" style={{ left: pos(r.km_p50) }} />
                  </span>
                  <span className="text-right tabular-nums text-slate-600">{r.mis_p50} mo · {formatPct(r.nff_rate, 0)} · {formatINR(r.avg_cost_inr)} · {formatPct(r.recovery_rate, 0)}</span>
                </button>
              );
            })}
          </div>
        )}
      </DataState>
    </Card>
  );
}

// Q5 + Q6 (reuse the Reliability evidence pack with a supplier chip)
function SupplierEvidence({ filters, supplierId, rows, onPick }) {
  const f = { ...filters, supplier_id: supplierId ? [supplierId] : [] };
  const state = useAsync(() => (supplierId ? fetchSignalDetail(f) : Promise.resolve(null)), `ev|${JSON.stringify(f)}`);
  const d = state.data;
  const months = (d?.by_production_month || []).filter((m) => m.built).map((m) => ({ ...m, rate: Number(m.per_1000_built) }));
  const mean = months.length ? months.reduce((s, m) => s + m.rate, 0) / months.length : 0;
  const sd = months.length > 1 ? Math.sqrt(months.reduce((s, m) => s + (m.rate - mean) ** 2, 0) / (months.length - 1)) : 0;
  const modes = (d?.failure_modes || []).slice(0, 8);
  return (
    <Card title="Supplier evidence" subtitle="Failure modes (connected fleet) and production-month containment (batch proxy)"
      info="From the Reliability evidence pack with a supplier filter. Failure modes come from fact_part_replacement, which only covers the 200 connected vehicles. Containment: claims per 1,000 vehicles built in each production month, with mean ± 3σ; the schema has no batch column, so build month stands in for the batch."
      actions={(
        <select value={supplierId || ''} onChange={(e) => onPick(e.target.value || null)} className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white">
          {rows.map((r) => <option key={r.supplier_id} value={r.supplier_id}>{r.supplier_name}</option>)}
        </select>
      )}>
      <DataState state={{ ...state, data: d }} height="h-48" empty="Pick a supplier.">
        {() => (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <p className="text-[11px] font-semibold text-slate-500 mb-2">Failure modes <span className="text-violet-600">· connected fleet</span></p>
              {modes.length === 0 ? <p className="text-xs text-slate-400">No telematics replacements for this supplier.</p> : (
                <ul className="space-y-1">
                  {modes.map((m) => (
                    <li key={m.key} className="text-xs flex items-center gap-2">
                      <span className="w-24 h-2 bg-slate-100 rounded"><span className="block h-2 bg-violet-500 rounded" style={{ width: `${(100 * m.count) / modes[0].count}%` }} /></span>
                      <span className="tabular-nums w-6 text-right">{m.count}</span>
                      <span className="truncate text-slate-700" title={m.key}>{m.key}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="lg:col-span-3 h-56">
              <p className="text-[11px] font-semibold text-slate-500 mb-1">Claims per 1,000 built by production month <span className="text-slate-400">· mean ± 3σ</span></p>
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart data={months} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${Number(v).toFixed(1)} (${p.payload.claims} of ${p.payload.built})`, 'per 1,000 built']} />
                  <ReferenceLine y={mean} stroke="#0284c7" strokeDasharray="4 4" />
                  {sd > 0 && <ReferenceLine y={mean + 3 * sd} stroke="#e11d48" strokeDasharray="4 4" />}
                  <Bar dataKey="rate" isAnimationActive={false}>
                    {months.map((m) => <Cell key={m.month} fill={sd > 0 && m.rate > mean + 3 * sd ? '#e11d48' : '#94a3b8'} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DataState>
    </Card>
  );
}
