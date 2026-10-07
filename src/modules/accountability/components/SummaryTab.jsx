import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { fetchKpis, fetchLeakageSeries, fetchDealerScorecard, fetchSupplierScorecard, fetchRecoverySummary, fetchBreakdown } from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { Card, DataState, KpiCard } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';
import { DEALER_BAND_STYLES, SUPPLIER_BAND_STYLES, dealerBand, supplierBand } from '../lib';
import { FlowBars, Pill } from './common';

// Design: docs/modules/dealer-supplier-accountability/design.md §6

export default function SummaryTab({ filters, fkey, scoreFilters, local, lookups, actions }) {
  const kpis = useAsync(() => fetchKpis(filters), fkey);
  const dealers = useAsync(() => fetchDealerScorecard(scoreFilters, local.peer), `${JSON.stringify(scoreFilters)}|${local.peer}`);
  const minClaims = local.minClaims ?? lookups?.config.minClaims ?? 10;
  const ranked = (dealers.data || []).filter((d) => Number(d.claims) >= minClaims);
  const flagged = lookups ? ranked.filter((d) => ['High', 'Medium'].includes(dealerBand(d, lookups.config, minClaims))) : [];

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} ranked={ranked.length} flagged={flagged.length} dealersLoading={dealers.loading} actions={actions} />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Waterfall filters={filters} fkey={fkey} kpis={kpis} actions={actions} />
        <LeakageTrend filters={filters} fkey={fkey} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <TopDealers state={dealers} lookups={lookups} minClaims={minClaims} actions={actions} />
        <TopSuppliers filters={scoreFilters} lookups={lookups} minClaims={minClaims} actions={actions} />
        <RegionTiles dealers={dealers} filters={filters} fkey={fkey} minClaims={minClaims} lookups={lookups} />
      </div>
    </div>
  );
}

function KpiStrip({ kpis, ranked, flagged, dealersLoading, actions }) {
  const c = kpis.data?.current || {};
  const p = kpis.data?.previous || {};
  const v = (fmt, x) => (kpis.loading ? '…' : fmt(x));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard label="Avoidable (paid)" value={v(formatINR, c.avoidable_paid_inr)} current={c.avoidable_paid_inr} previous={p.avoidable_paid_inr} betterWhen="down"
        sub={kpis.loading ? '' : `NFF ${formatINR(c.nff_paid_inr)} · labor ${formatINR(c.excess_labor_paid_inr)}`}
        info="Paid claims: the whole claim if NFF or a repeat repair, otherwise labor billed above the SRT maximum × ₹1,500/h. Out-of-coverage claims are a separate policy check." onClick={() => actions.setTab('dealers')} />
      <KpiCard label="Open at stake" value={v(formatINR, c.open_at_stake_inr)} current={c.open_at_stake_inr} previous={p.open_at_stake_inr} betterWhen="down"
        sub="Can still be challenged" info="Open / Submitted / In Review claims with an audit flag: the whole claim if NFF, repeat or out of coverage, else the excess labor." onClick={() => actions.setTab('audit')} />
      <KpiCard label="Dealers flagged" value={dealersLoading ? '…' : `${flagged} of ${ranked}`} sub="Risk index ≥ Medium"
        info="Ranked dealers (enough claims in the scorecard period) whose Dealer Risk Index reaches the Medium band (wty_config acc_band_medium)." onClick={() => actions.setTab('dealers')} />
      <KpiCard label="Supplier-liable" value={v(formatINR, c.supplier_cost_inr)} current={c.supplier_cost_inr} previous={p.supplier_cost_inr}
        sub={kpis.loading ? '' : `${formatPct(c.supplier_share)} of cost`} info="Claim cost where the liable party is the supplier, any status." onClick={() => actions.setTab('suppliers')} />
      <KpiCard label="Recovery rate" value={v(formatPct, c.recovery_rate)} current={c.recovery_rate} previous={p.recovery_rate} betterWhen="up" deltaMode="pp"
        sub={kpis.loading ? '' : `shortfall ${formatINR(c.shortfall_inr)}`} info="Recovered ÷ supplier-liable paid cost. Same definition as Claims & Repair K15." onClick={() => actions.setTab('recovery')} />
      <KpiCard label="Cash recovered" value={v(formatINR, c.cash_recovered_inr)} current={c.cash_recovered_inr} previous={p.cash_recovered_inr} betterWhen="up"
        sub={kpis.loading ? '' : `outstanding ${formatINR(c.outstanding_agreed_inr)} · demo`} info="Agreed recovery in cases that have reached Recovered at the as-of date. Demo lifecycle (migration 014): dates are seeded, amounts are real." onClick={() => actions.setTab('recovery')} />
      <KpiCard label="Missed recovery" value={v(formatINR, c.missed_recovery_inr)} current={c.missed_recovery_inr} previous={p.missed_recovery_inr} betterWhen="down"
        sub={kpis.loading ? '' : `${formatNumber(c.missed_recovery_claims)} claims`} info="OEM-liable, paid, fault-found claims that failed inside the supplier window (24 months / 200,000 km by agreement). Candidates only." onClick={() => actions.setTab('recovery')} />
      <KpiCard label="Out of coverage (paid)" value={v(formatINR, c.ooc_paid_inr)} current={c.ooc_paid_inr} previous={p.ooc_paid_inr} betterWhen="down"
        sub={kpis.loading ? '' : `${formatNumber(c.ooc_paid_claims)} claims · policy check`} info="Paid claims submitted after the base-warranty end date or above the km limit. Goodwill or a policy gap: the claims-operations owner decides." onClick={() => actions.setTab('audit')} />
    </div>
  );
}

function Waterfall({ filters, fkey, kpis, actions }) {
  const rec = useAsync(() => fetchRecoverySummary(filters), fkey);
  const c = kpis.data?.current;
  return (
    <Card className="xl:col-span-7" title="Cost accountability" subtitle="Where warranty cost goes, and what is avoided or recovered"
      info="Supplier rows count supplier-liable claims only. Agreed recovery = recovered_amount_inr (C&R K15). Cash / outstanding follow the demo lifecycle.">
      <DataState state={{ loading: kpis.loading || rec.loading, error: kpis.error || rec.error, data: c && rec.data }}>
        {() => {
          const w = rec.data.waterfall;
          return (
            <div className="space-y-4">
              <FlowBars max={Number(c.cost_inr)} rows={[
                { label: 'Total claim cost', value: c.cost_inr, tone: '#334155' },
                { label: 'OEM-liable', value: Number(c.cost_inr) - Number(c.supplier_cost_inr), tone: '#94a3b8', indent: true, onClick: () => actions.addChip('liability_type', 'OEM') },
                { label: 'Supplier-liable', value: w.supplier_liable_inr, tone: '#6366f1', indent: true, onClick: () => actions.addChip('liability_type', 'Supplier') },
                { label: 'rejected', value: w.rejected_inr, tone: '#cbd5e1', indent: true },
                { label: 'awaiting adjudication', value: w.pending_inr, tone: '#cbd5e1', indent: true },
                { label: 'paid', value: w.paid_inr, tone: '#818cf8', indent: true },
                { label: 'agreed recovery', value: w.agreed_inr, tone: '#10b981', indent: true, sub: `NFF ${formatINR(w.nff_agreed_inr)}` },
                { label: 'shortfall', value: w.shortfall_inr, tone: '#f43f5e', indent: true },
              ]} />
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 mb-2">Dealer-avoidable (paid)</p>
                <FlowBars max={Number(c.cost_inr)} rows={[
                  { label: 'NFF claims', value: c.nff_paid_inr, tone: '#f43f5e', onClick: () => actions.openAuditRule('nff') },
                  { label: 'Labor above SRT max', value: c.excess_labor_paid_inr, tone: '#f97316' },
                  { label: 'Repeat repairs', value: c.repeat_paid_inr, tone: '#0ea5e9' },
                ]} />
              </div>
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}

function LeakageTrend({ filters, fkey }) {
  const series = useAsync(() => fetchLeakageSeries(filters), fkey);
  return (
    <Card className="xl:col-span-5" title="Leakage & recovery trend" subtitle="Paid claims by submission month"
      info="Bars: avoidable cost components and out-of-coverage paid cost. Line: recovery rate of supplier-liable paid claims (right axis).">
      <DataState state={series}>
        {(rows) => (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows.map((r) => ({ ...r, excess_labor_inr: Number(r.excess_labor_inr), nff_inr: Number(r.nff_inr), repeat_inr: Number(r.repeat_inr), ooc_inr: Number(r.ooc_inr), recovery_rate: r.recovery_rate === null ? null : Number(r.recovery_rate) }))}
                margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis yAxisId="inr" tickFormatter={formatINRAxis} tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => (name === 'Recovery rate' ? formatPct(v) : formatINR(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="inr" dataKey="ooc_inr" name="Out of coverage" stackId="a" fill="#cbd5e1" />
                <Bar yAxisId="inr" dataKey="nff_inr" name="NFF" stackId="a" fill="#f43f5e" />
                <Bar yAxisId="inr" dataKey="excess_labor_inr" name="Labor above max" stackId="a" fill="#f97316" />
                <Bar yAxisId="inr" dataKey="repeat_inr" name="Repeat" stackId="a" fill="#0ea5e9" />
                <Line yAxisId="pct" dataKey="recovery_rate" name="Recovery rate" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DataState>
    </Card>
  );
}

function TopDealers({ state, lookups, minClaims, actions }) {
  return (
    <Card className="xl:col-span-4" title="Top dealers by avoidable cost" subtitle="Scorecard period · paid claims">
      <DataState state={state} height="h-48">
        {(rows) => (
          <ol className="space-y-1 text-xs">
            {[...rows].sort((a, b) => Number(b.avoidable_inr) - Number(a.avoidable_inr)).slice(0, 10).map((d, i) => (
              <li key={d.dealer_id}>
                <button type="button" onClick={() => actions.openDealer(d.dealer_id)} className="w-full flex items-center gap-2 hover:bg-slate-50 rounded px-1 py-0.5 text-left">
                  <span className="w-4 text-slate-400">{i + 1}</span>
                  <span className="flex-1 truncate text-slate-800">{d.dealer_name}{d.dealer_status === 'Suspended' && <span className="ml-1 text-[10px] text-rose-600 font-semibold">SUSPENDED</span>}</span>
                  <span className="tabular-nums font-medium">{formatINR(d.avoidable_inr)}</span>
                  {lookups && <Pill text={dealerBand(d, lookups.config, minClaims)} styles={DEALER_BAND_STYLES} />}
                </button>
              </li>
            ))}
          </ol>
        )}
      </DataState>
    </Card>
  );
}

function TopSuppliers({ filters, lookups, minClaims, actions }) {
  const sup = useAsync(() => fetchSupplierScorecard({ ...filters, region_basis: 'vehicle' }), `sup|${JSON.stringify(filters)}`);
  return (
    <Card className="xl:col-span-4" title="Top suppliers by money not recovered" subtitle="Shortfall + missed-recovery candidates · scorecard period">
      <DataState state={sup} height="h-48">
        {(rows) => (
          <ol className="space-y-1 text-xs">
            {[...rows].sort((a, b) => (Number(b.shortfall_inr) + Number(b.missed_recovery_inr)) - (Number(a.shortfall_inr) + Number(a.missed_recovery_inr))).slice(0, 10).map((s, i) => (
              <li key={s.supplier_id}>
                <button type="button" onClick={() => actions.openSupplier(s.supplier_id)} className="w-full flex items-center gap-2 hover:bg-slate-50 rounded px-1 py-0.5 text-left">
                  <span className="w-4 text-slate-400">{i + 1}</span>
                  <span className="flex-1 truncate text-slate-800">{s.supplier_name}</span>
                  <span className="tabular-nums text-slate-500" title="Shortfall">{formatINR(s.shortfall_inr)}</span>
                  <span className="tabular-nums font-medium" title="Missed recovery">{formatINR(s.missed_recovery_inr)}</span>
                  {lookups && <Pill text={supplierBand(s, lookups.config, minClaims)} styles={SUPPLIER_BAND_STYLES} />}
                </button>
              </li>
            ))}
          </ol>
        )}
      </DataState>
    </Card>
  );
}

function RegionTiles({ dealers, filters, fkey, minClaims, lookups }) {
  // recovery by vehicle region: supplier-liable paid claims (Claims & Repair breakdown, same contract)
  const recFilters = { ...filters, region: null, region_basis: 'vehicle', liability_type: ['Supplier'], status: ['Paid'] };
  const rec = useAsync(() => fetchBreakdown(recFilters, 'vehicle_region', 10), `reg|${fkey}`);
  const byRegion = {};
  (dealers.data || []).forEach((d) => {
    const r = (byRegion[d.dealer_region] ||= { avoidable: 0, ranked: 0, flagged: 0 });
    r.avoidable += Number(d.avoidable_inr || 0);
    if (Number(d.claims) >= minClaims) r.ranked += 1;
    if (lookups && ['High', 'Medium'].includes(dealerBand(d, lookups.config, minClaims))) r.flagged += 1;
  });
  const recByRegion = Object.fromEntries((rec.data || []).map((r) => [r.key, Number(r.recovered_inr) / Number(r.cost_inr)]));
  return (
    <Card className="xl:col-span-4" title="Regions" subtitle="Dealer region: avoidable ₹ · flagged / ranked · vehicle region: recovery %">
      <DataState state={dealers} height="h-48">
        {() => (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(byRegion).sort((a, b) => b[1].avoidable - a[1].avoidable).map(([region, r]) => (
              <div key={region} className="border border-slate-200 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-slate-700">{region}</p>
                <p className="text-lg font-bold text-slate-900 tabular-nums">{formatINR(r.avoidable)}</p>
                <p className="text-[11px] text-slate-500">{r.flagged} / {r.ranked} flagged · recovery {formatPct(recByRegion[region])}</p>
              </div>
            ))}
          </div>
        )}
      </DataState>
    </Card>
  );
}
