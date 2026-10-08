import React, { useState } from 'react';
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { fetchKpis, fetchLeakageSeries, fetchDealerScorecard, fetchRecoverySummary } from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { Card, DataState, KpiCard, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';
import { dealerBand } from '../lib';
import { FlowBars } from './common';

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
    </div>
  );
}

function KpiStrip({ kpis, ranked, flagged, dealersLoading, actions }) {
  const c = kpis.data?.current || {};
  const p = kpis.data?.previous || {};
  const v = (fmt, x) => (kpis.loading ? '…' : fmt(x));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
      <KpiCard label="Missed recovery" value={v(formatINR, c.missed_recovery_inr)} current={c.missed_recovery_inr} previous={p.missed_recovery_inr} betterWhen="down"
        sub={kpis.loading ? '' : `${formatNumber(c.missed_recovery_claims)} claims`} info="OEM-liable, paid, fault-found claims that failed inside the supplier window (24 months / 200,000 km by agreement). Candidates only." onClick={() => actions.setTab('recovery')} />
    </div>
  );
}

function Waterfall({ filters, fkey, kpis, actions }) {
  const rec = useAsync(() => fetchRecoverySummary(filters), fkey);
  const c = kpis.data?.current;
  return (
    <Card className="xl:col-span-5" title="Cost accountability" subtitle="Where warranty cost goes, and what is avoided or recovered"
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

const monthLabel = (m) => format(new Date(`${m}-01T00:00:00`), 'MMM yy');

function TrendStat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function LeakageTrend({ filters, fkey }) {
  const series = useAsync(() => fetchLeakageSeries(filters), fkey);
  const [view, setView] = useState('avoidable');
  const isAvoidable = view === 'avoidable';
  return (
    <Card className="xl:col-span-7" title={isAvoidable ? 'Avoidable cost by month' : 'Supplier recovery by month'}
      subtitle={isAvoidable
        ? 'Paid claims that should not have cost us: no fault found, labor billed above the SRT maximum, and repeat repairs'
        : 'Supplier-liable paid cost vs the amount agreed back from suppliers · line = recovery rate'}
      info="By claim submission month. Avoidable: NFF = whole claim paid where no fault was found; Labor above max = hours billed above the SRT maximum × ₹1,500/h; Repeat = whole claim for a repeat repair of the same part. Recovery: agreed recovery ÷ supplier-liable paid cost."
      actions={<Segmented value={view} onChange={setView} options={[{ value: 'avoidable', label: 'Avoidable cost' }, { value: 'recovery', label: 'Supplier recovery' }]} />}>
      <DataState state={series}>
        {(raw) => {
          const rows = raw.map((r) => ({
            ...r,
            label: monthLabel(r.month),
            nff: Number(r.nff_inr) || 0, labor: Number(r.excess_labor_inr) || 0, repeat: Number(r.repeat_inr) || 0,
            paid: Number(r.supplier_paid_inr) || 0, agreed: Number(r.agreed_inr) || 0,
            rate: r.recovery_rate === null ? null : Number(r.recovery_rate),
          })).map((r) => ({ ...r, avoidable: r.nff + r.labor + r.repeat, gap: Math.max(r.paid - r.agreed, 0) }));
          const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
          if (isAvoidable) {
            const total = sum('avoidable');
            const avg = rows.length ? total / rows.length : 0;
            const parts = [['NFF', sum('nff')], ['Labor above max', sum('labor')], ['Repeat repairs', sum('repeat')]].sort((a, b) => b[1] - a[1]);
            const peak = rows.reduce((m, r) => (!m || r.avoidable > m.avoidable ? r : m), null);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <TrendStat label="Total avoidable" value={formatINR(total)} tone="text-rose-600" />
                  <TrendStat label="Monthly average" value={formatINR(avg)} />
                  <TrendStat label="Biggest driver" value={`${parts[0][0]} · ${formatPct(total ? parts[0][1] / total : null, 0)}`} />
                  <TrendStat label="Worst month" value={peak ? `${peak.label} · ${formatINR(peak.avoidable)}` : '—'} />
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={8} />
                      <YAxis tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} formatter={(v, n) => [formatINR(v), n]}
                        labelFormatter={(l, p) => (p?.[0] ? `${l} · total ${formatINR(p[0].payload.avoidable)}` : l)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <ReferenceLine y={avg} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'monthly avg', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
                      <Bar dataKey="nff" name="NFF" stackId="a" fill="#f43f5e" />
                      <Bar dataKey="labor" name="Labor above max" stackId="a" fill="#f97316" />
                      <Bar dataKey="repeat" name="Repeat repairs" stackId="a" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          }
          const paid = sum('paid');
          const agreed = sum('agreed');
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <TrendStat label="Supplier-liable paid" value={formatINR(paid)} />
                <TrendStat label="Agreed recovery" value={formatINR(agreed)} tone="text-emerald-600" />
                <TrendStat label="Not recovered" value={formatINR(Math.max(paid - agreed, 0))} tone="text-rose-600" />
                <TrendStat label="Recovery rate" value={formatPct(paid ? agreed / paid : null)} />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={8} />
                    <YAxis yAxisId="inr" tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={52} />
                    <YAxis yAxisId="pct" orientation="right" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }} formatter={(v, n) => [n === 'Recovery rate' ? formatPct(v) : formatINR(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="inr" dataKey="agreed" name="Agreed recovery" stackId="r" fill="#10b981" />
                    <Bar yAxisId="inr" dataKey="gap" name="Not recovered" stackId="r" fill="#fecdd3" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="pct" dataKey="rate" name="Recovery rate" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-500">Each bar is the supplier-liable paid cost for the month: green = agreed back from the supplier, pink = not recovered.</p>
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}
