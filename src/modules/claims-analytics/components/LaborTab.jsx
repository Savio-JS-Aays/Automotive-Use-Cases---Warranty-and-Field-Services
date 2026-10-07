import React, { useState } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea, Cell,
} from 'recharts';
import { fetchRoBreakdown, fetchRoPoints, fetchBreakdown } from '../api';
import { useAsync, tooltipStyle, num } from '../lib';
import { Card, DataState, KpiCard, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';

const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
const AXIS_TICK = { fontSize: 11, fill: '#64748b' };

function overrunColor(rate) {
  if (rate >= 0.5) return '#e11d48';
  if (rate >= 0.35) return '#f59e0b';
  return '#10b981';
}

function OverrunLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="font-medium text-slate-600">Overrun rate</span>
      {[['#10b981', '< 35%'], ['#f59e0b', '35–50%'], ['#e11d48', '≥ 50%']].map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />{l}</span>
      ))}
    </div>
  );
}

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function TooltipBox({ title, lines }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-lg max-w-xs">
      <p className="font-semibold text-slate-900 mb-1">{title}</p>
      {lines.filter(Boolean).map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-slate-600"><span>{k}</span><span className="font-medium text-slate-900 tabular-nums">{v}</span></p>
      ))}
    </div>
  );
}

export default function LaborTab({ filters, fkey, actions, local, lookups }) {
  const totals = useAsync(() => fetchRoBreakdown(filters, 'ro_source', 10), fkey);
  const totalRows = totals.data || [];
  const totalRos = sum(totalRows, 'ros');
  const weighted = (k) => totalRows.reduce((s, r) => s + Number(r[k] || 0) * Number(r.ros), 0) / Math.max(totalRos, 1);
  const networkOverrun = totalRos ? weighted('overrun_rate') : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500 font-medium">Repair-order scope</span>
        <Segmented value={local.roScope} onChange={actions.setRoScope} options={[{ value: 'warranty', label: 'Warranty ROs' }, { value: 'all', label: 'All ROs' }]} />
        <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
          <input type="checkbox" checked={local.overrunOnly} onChange={(e) => actions.setOverrunOnly(e.target.checked)} className="accent-blue-600" />
          Labor overrun only
        </label>
        <span className="text-slate-400">Claim-only chips (status, liability, risk…) do not apply to repair orders.</span>
      </div>

      {/* R1 */}
      <DataState state={totals} height="h-24">
        {() => (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <KpiCard label="Repair orders" value={formatNumber(totalRos)} sub="in scope" accent="blue" />
            <KpiCard label="Overrun rate" value={formatPct(networkOverrun)} sub="billed > SRT max allowable" accent="amber" />
            <KpiCard label="Excess hours" value={formatNumber(sum(totalRows, 'excess_hours'), 0)} sub="above max allowable" accent="amber" />
            <KpiCard label="Excess labor ₹" value={formatINR(sum(totalRows, 'excess_labor_cost_inr'))} sub="excess hours × ₹1,500/h" accent="rose" />
            <KpiCard label="Billed vs SRT" value={`${weighted('avg_billed_hours').toFixed(2)} / ${weighted('avg_benchmark_hours').toFixed(2)} h`} sub="avg billed / benchmark" accent="violet" />
          </div>
        )}
      </DataState>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BilledVsSrtCard filters={filters} fkey={fkey} actions={actions} />
        <OverrunCard filters={filters} fkey={fkey} actions={actions} networkOverrun={networkOverrun} />
      </div>

      <DealerBenchmarkCard filters={filters} fkey={fkey} actions={actions} />

      <LaborPartsCostCard filters={filters} fkey={fkey} lookups={lookups} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// R2: billed hours vs SRT benchmark — by part (default) or one dot per repair order
// ---------------------------------------------------------------------------
function BilledVsSrtCard({ filters, fkey, actions }) {
  const [view, setView] = useState('part');
  const state = useAsync(() => (view === 'part' ? fetchRoBreakdown(filters, 'part', 60) : fetchRoPoints(filters, 1500)), `${fkey}|${view}`);

  return (
    <Card
      title="Billed hours vs SRT benchmark"
      subtitle={view === 'part'
        ? 'Average billed labor hours against the standard repair time, parts with the largest gap first'
        : 'Each dot is a repair order (latest 1,500) · above the red line = billed beyond max allowable'}
      info="SRT = standard repair time, the benchmark labor hours for a repair. Max allowable is the SRT plus tolerance; billing above it is a labor overrun. If one part is over-billed at most dealers, its SRT may be unrealistic. Click a bar to filter by part, or a dot to open its claim."
      actions={<Segmented value={view} onChange={setView} options={[{ value: 'part', label: 'By part' }, { value: 'ro', label: 'Each repair order' }]} />}
    >
      {view === 'part' ? (
        <DataState state={state} height="h-96">
          {(rows) => {
            const eligible = rows.filter((r) => Number(r.ros) >= 5 && r.key && r.avg_benchmark_hours !== null);
            const data = eligible
              .map((r) => {
                const billed = num(r.avg_billed_hours);
                const srt = num(r.avg_benchmark_hours);
                return { ...r, billed, srt, gap: billed - srt, gapPct: srt ? (billed - srt) / srt : 0, rate: num(r.overrun_rate) };
              })
              .sort((a, b) => b.gap - a.gap)
              .slice(0, 12);
            const ros = sum(eligible, 'ros');
            const avgGap = ros ? eligible.reduce((s, r) => s + (num(r.avg_billed_hours) - num(r.avg_benchmark_hours)) * Number(r.ros), 0) / ros : 0;
            const above = eligible.filter((r) => num(r.avg_billed_hours) > num(r.avg_benchmark_hours)).length;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Parts billed above SRT" value={`${above} of ${eligible.length}`} />
                  <Stat label="Avg gap per RO" value={`${avgGap >= 0 ? '+' : ''}${avgGap.toFixed(2)} h`} tone={avgGap > 0 ? 'text-rose-600' : 'text-emerald-600'} />
                  <Stat label="Largest gap" value={data[0] ? `+${data[0].gap.toFixed(2)} h` : '—'} tone="text-rose-600" />
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2} barCategoryGap="22%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" unit=" h" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="key" width={160} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} content={({ payload }) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return null;
                        return (
                          <TooltipBox title={p.key} lines={[
                            ['Repair orders', formatNumber(p.ros)],
                            ['Avg billed', `${p.billed.toFixed(2)} h`],
                            ['SRT benchmark', `${p.srt.toFixed(2)} h`],
                            ['Gap', `${p.gap >= 0 ? '+' : ''}${p.gap.toFixed(2)} h (${formatPct(p.gapPct, 0)})`],
                            ['Overrun rate', formatPct(p.rate, 0)],
                            ['Excess hours', formatNumber(p.excess_hours, 0)],
                          ]} />
                        );
                      }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="srt" name="SRT benchmark" fill="#cbd5e1" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="billed" name="Avg billed" fill="#6366f1" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d) => actions.addNamedChip('part', d.key)}>
                        {data.map((d) => <Cell key={d.key} fill={overrunColor(d.rate)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <OverrunLegend />
              </div>
            );
          }}
        </DataState>
      ) : (
        <DataState state={state} height="h-96">
          {(rows) => {
            const data = rows.map((r) => ({
              ...r, x: Number(r.benchmark_labor_hours), y: Number(r.billed_hours), max: Number(r.max_allowable_hours),
            }));
            const max = Math.ceil(Math.max(...data.map((d) => Math.max(d.x, d.y)), 1));
            const ratios = data.filter((d) => d.x > 0 && d.max > 0).map((d) => d.max / d.x).sort((a, b) => a - b);
            const tolerance = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
            const over = data.filter((d) => d.is_labor_overrun).length;
            const excess = data.reduce((s, d) => s + Math.max(d.y - d.max, 0), 0);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Repair orders plotted" value={formatNumber(data.length)} />
                  <Stat label="Above max allowable" value={`${formatNumber(over)} (${formatPct(data.length ? over / data.length : 0, 0)})`} tone="text-rose-600" />
                  <Stat label="Excess hours (plotted)" value={`${formatNumber(excess, 0)} h`} tone="text-rose-600" />
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" dataKey="x" name="SRT benchmark" domain={[0, max]} tick={AXIS_TICK} tickLine={false}
                        label={{ value: 'SRT benchmark (h)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#64748b' }} />
                      <YAxis type="number" dataKey="y" name="Billed" domain={[0, max]} tick={AXIS_TICK} tickLine={false} width={44}
                        label={{ value: 'Billed (h)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: '#64748b' }} />
                      <ZAxis range={[22, 22]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return null;
                        return (
                          <TooltipBox title={p.part_name || p.ro_id} lines={[
                            ['Repair order', p.ro_id],
                            ['Date', p.ro_date],
                            ['Dealer', p.dealer_name],
                            ['Billed', `${p.y.toFixed(2)} h`],
                            ['SRT benchmark', `${p.x.toFixed(2)} h`],
                            ['Max allowable', `${p.max.toFixed(2)} h`],
                            p.is_labor_overrun && ['Excess', `+${(p.y - p.max).toFixed(2)} h`],
                          ]} />
                        );
                      }} />
                      <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#94a3b8"
                        label={{ value: 'Billed = SRT', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
                      {tolerance && (
                        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max / tolerance, y: max }]} stroke="#e11d48" strokeDasharray="5 4"
                          label={{ value: 'Max allowable', position: 'insideTopLeft', fontSize: 10, fill: '#e11d48' }} />
                      )}
                      <Scatter name="Within limit" data={data.filter((d) => !d.is_labor_overrun)} fill="#94a3b8" fillOpacity={0.35} cursor="pointer" onClick={(d) => d.claim_id && actions.openClaim(d.claim_id)} />
                      <Scatter name="Above max allowable" data={data.filter((d) => d.is_labor_overrun)} fill="#e11d48" fillOpacity={0.75} cursor="pointer" onClick={(d) => d.claim_id && actions.openClaim(d.claim_id)} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          }}
        </DataState>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// R3 / R5 combined: overrun rate by dealer or by part
// ---------------------------------------------------------------------------
const OVERRUN_DIMS = {
  dealer: { label: 'Dealer', limit: 200, subtitle: 'Dealers with ≥ 5 repair orders, worst 15', yWidth: 160 },
  part: { label: 'Part', limit: 60, subtitle: 'Parts with ≥ 5 repair orders, worst 15 · if a part overruns at most dealers, review its SRT', yWidth: 170 },
};

function OverrunCard({ filters, fkey, actions, networkOverrun }) {
  const [dim, setDim] = useState('dealer');
  const cfg = OVERRUN_DIMS[dim];
  const state = useAsync(() => fetchRoBreakdown(filters, dim, cfg.limit), `${fkey}|${dim}`);
  return (
    <Card
      title={`Overrun rate by ${cfg.label.toLowerCase()}`}
      subtitle={`${cfg.subtitle} · dashed = network average`}
      info="Share of repair orders billed above the SRT maximum allowable hours. Click a dealer to open its drill-down, or a part to filter by it."
      actions={<Segmented value={dim} onChange={setDim} options={Object.entries(OVERRUN_DIMS).map(([value, d]) => ({ value, label: d.label }))} />}
    >
      <DataState state={state} height="h-96">
        {(rows) => {
          const data = rows.filter((r) => Number(r.ros) >= 5 && r.key)
            .sort((a, b) => Number(b.overrun_rate) - Number(a.overrun_rate)).slice(0, 15)
            .map((r) => ({ ...r, rate: Number(r.overrun_rate) * 100 }));
          return (
            <div className="space-y-3">
              <div className="h-[23rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} layout="vertical" margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="key" width={cfg.yWidth} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} content={({ payload }) => {
                      const p = payload?.[0]?.payload;
                      if (!p) return null;
                      return (
                        <TooltipBox title={p.key} lines={[
                          ['Overrun rate', `${p.rate.toFixed(0)}%`],
                          ['Repair orders', formatNumber(p.ros)],
                          ['Avg billed / SRT', `${p.avg_billed_hours} / ${p.avg_benchmark_hours} h`],
                          ['Excess hours', formatNumber(p.excess_hours, 0)],
                          ['Excess labor', formatINR(p.excess_labor_cost_inr)],
                        ]} />
                      );
                    }} />
                    {networkOverrun !== null && (
                      <ReferenceLine x={networkOverrun * 100} stroke="#64748b" strokeDasharray="4 4"
                        label={{ value: `Network ${formatPct(networkOverrun, 0)}`, position: 'top', fontSize: 10, fill: '#64748b' }} />
                    )}
                    <Bar dataKey="rate" radius={[0, 3, 3, 0]} cursor="pointer"
                      onClick={(d) => (dim === 'dealer' ? actions.openEntity('dealer', d.key) : actions.addNamedChip('part', d.key))}>
                      {data.map((d) => <Cell key={d.key} fill={overrunColor(d.rate / 100)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <OverrunLegend />
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// R4: dealer benchmark — volume vs average cost, with a review list
// ---------------------------------------------------------------------------
const FLAG_STYLES = {
  cost: 'bg-rose-50 text-rose-700 border-rose-200',
  nff: 'bg-amber-50 text-amber-700 border-amber-200',
  overrun: 'bg-violet-50 text-violet-700 border-violet-200',
};

function DealerBenchmarkCard({ filters, fkey, actions }) {
  const state = useAsync(() => fetchBreakdown(filters, 'dealer', 200), fkey);
  return (
    <Card
      title="Dealer benchmark"
      subtitle="Claim volume vs average claim cost · bubble size = NFF rate · colour = labor overrun rate · dashed = network average"
      info="Dealers in the shaded top-right area handle many claims at an above-average cost. Dealers above the network average on several measures (avg cost, NFF rate, overrun rate) are listed on the right. Click a bubble or a row to open the dealer drill-down."
    >
      <DataState state={state} height="h-96">
        {(rows) => {
          const data = rows.filter((r) => r.key).map((r) => ({
            ...r, x: Number(r.claims), y: num(r.avg_cost_inr), z: num(r.nff_rate) * 100, nff: num(r.nff_rate), o: num(r.overrun_rate),
          }));
          const claims = sum(data, 'x');
          const avgCost = claims ? sum(data, 'cost_inr') / claims : 0;
          const avgClaims = data.length ? claims / data.length : 0;
          const avgNff = claims ? data.reduce((s, d) => s + d.nff * d.x, 0) / claims : 0;
          const avgOverrun = claims ? data.reduce((s, d) => s + d.o * d.x, 0) / claims : 0;
          const maxX = Math.max(...data.map((d) => d.x), 1);
          const maxY = Math.max(...data.map((d) => d.y), 1);
          const review = data
            .map((d) => ({
              ...d,
              flags: [d.y > avgCost && 'cost', d.nff > avgNff && 'nff', d.o > avgOverrun && 'overrun'].filter(Boolean),
            }))
            .filter((d) => d.flags.length >= 2)
            .sort((a, b) => b.flags.length - a.flags.length || num(b.cost_inr) - num(a.cost_inr))
            .slice(0, 8);
          return (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2 space-y-3">
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <ReferenceArea x1={avgClaims} x2={maxX * 1.05} y1={avgCost} y2={maxY * 1.05} fill="#fff1f2" fillOpacity={0.7}
                        label={{ value: 'High volume · high cost', position: 'insideTopRight', fontSize: 11, fill: '#be123c' }} />
                      <XAxis type="number" dataKey="x" name="Claims" domain={[0, Math.ceil(maxX * 1.05)]} tick={AXIS_TICK} tickLine={false}
                        label={{ value: 'Claims', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#64748b' }} />
                      <YAxis type="number" dataKey="y" name="Avg cost" domain={[0, Math.ceil(maxY * 1.05)]} tickFormatter={formatINRAxis} tick={AXIS_TICK} tickLine={false} width={52} />
                      <ZAxis type="number" dataKey="z" range={[40, 420]} name="NFF %" />
                      <ReferenceLine x={avgClaims} stroke="#94a3b8" strokeDasharray="4 4" />
                      <ReferenceLine y={avgCost} stroke="#94a3b8" strokeDasharray="4 4"
                        label={{ value: `Network avg ${formatINR(avgCost)}`, position: 'insideBottomLeft', fontSize: 10, fill: '#64748b' }} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return null;
                        return (
                          <TooltipBox title={p.key} lines={[
                            ['Claims', formatNumber(p.x)],
                            ['Total cost', formatINR(p.cost_inr)],
                            ['Avg cost', `${formatINR(p.y)} (network ${formatINR(avgCost)})`],
                            ['NFF rate', `${formatPct(p.nff)} (network ${formatPct(avgNff)})`],
                            ['Overrun rate', `${formatPct(p.o)} (network ${formatPct(avgOverrun)})`],
                          ]} />
                        );
                      }} />
                      <Scatter data={data} cursor="pointer" onClick={(d) => actions.openEntity('dealer', d.key)}>
                        {data.map((d) => <Cell key={d.key} fill={overrunColor(d.o)} fillOpacity={0.65} stroke={overrunColor(d.o)} strokeOpacity={0.9} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <OverrunLegend />
                  <span className="text-[11px] text-slate-500">Bigger bubble = higher NFF rate</span>
                </div>
              </div>

              <div className="xl:border-l xl:border-slate-100 xl:pl-5">
                <p className="text-sm font-semibold text-slate-800">Dealers to review</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Above network average on 2+ measures, highest claim cost first</p>
                {review.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No dealer is above average on two or more measures.</p>
                ) : (
                  <ul className="space-y-2">
                    {review.map((d) => (
                      <li key={d.key}>
                        <button type="button" onClick={() => actions.openEntity('dealer', d.key)}
                          className="w-full text-left border border-slate-200 rounded-lg px-3 py-2 hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 truncate">{d.key}</span>
                            <span className="text-xs font-semibold text-slate-900 tabular-nums flex-shrink-0">{formatINR(d.cost_inr)}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2 mt-1">
                            <span className="flex gap-1">
                              {d.flags.map((f) => (
                                <span key={f} className={`text-[10px] font-medium border rounded px-1.5 py-px ${FLAG_STYLES[f]}`}>
                                  {f === 'cost' ? `Avg ${formatINR(d.y)}` : f === 'nff' ? `NFF ${formatPct(d.nff, 0)}` : `Overrun ${formatPct(d.o, 0)}`}
                                </span>
                              ))}
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">{formatNumber(d.x)} claims</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// R7: labor vs parts cost, grouped by time or by a dimension
// ---------------------------------------------------------------------------
const COST_GROUPS = {
  month: { label: 'Month', dim: 'month', time: true },
  quarter: { label: 'Quarter', dim: 'month', time: true },
  subsystem: { label: 'Subsystem', dim: 'subsystem' },
  variant: { label: 'Variant', dim: 'variant' },
  vehicle_region: { label: 'Region', dim: 'vehicle_region' },
};

const toQuarter = (month) => {
  const [y, m] = String(month).split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
};

function LaborPartsCostCard({ filters, fkey, lookups }) {
  const [group, setGroup] = useState('month');
  const [mode, setMode] = useState('cost');
  const [dealerId, setDealerId] = useState('');
  const cfg = COST_GROUPS[group];
  const dealers = Object.values(lookups?.dealerByName || {}).sort((a, b) => a.dealer_name.localeCompare(b.dealer_name));
  const f = dealerId ? { ...filters, dealer_id: [dealerId] } : filters;
  const state = useAsync(() => fetchRoBreakdown(f, cfg.dim, 120), `${fkey}|${cfg.dim}|${dealerId}`);
  const share = mode === 'share';

  return (
    <Card
      title={`Labor vs parts cost by ${cfg.label.toLowerCase()}`}
      subtitle={share ? 'Share of repair-order cost that is labor vs parts' : 'Repair-order cost composition (₹)'}
      info="Labor cost comes from all repair orders. Parts cost is only recorded on telematics repair orders; seed repair orders have labor only."
      actions={(
        <div className="flex flex-col items-end gap-1.5">
          <Segmented value={group} onChange={setGroup} options={Object.entries(COST_GROUPS).map(([value, g]) => ({ value, label: g.label }))} />
          <div className="flex items-center gap-2">
            <select value={dealerId} onChange={(e) => setDealerId(e.target.value)} aria-label="Dealer"
              className="border border-slate-200 rounded-md px-2 py-0.5 text-[11px] bg-white text-slate-700 max-w-[14rem]">
              <option value="">All dealers</option>
              {dealers.map((d) => <option key={d.dealer_id} value={d.dealer_id}>{d.dealer_name}</option>)}
            </select>
            <Segmented size="xs" value={mode} onChange={setMode} options={[{ value: 'cost', label: 'Cost ₹' }, { value: 'share', label: 'Share %' }]} />
          </div>
        </div>
      )}
    >
      <DataState state={state} height="h-72">
        {(rows) => {
          const buckets = new Map();
          rows.forEach((r) => {
            const key = r.key === null || r.key === undefined ? 'Unknown' : group === 'quarter' ? toQuarter(r.key) : String(r.key);
            const b = buckets.get(key) || { key, labor: 0, parts: 0, ros: 0 };
            b.labor += num(r.labor_cost) || 0;
            b.parts += num(r.parts_cost) || 0;
            b.ros += Number(r.ros) || 0;
            buckets.set(key, b);
          });
          const data = [...buckets.values()]
            .sort((a, b) => (cfg.time ? a.key.localeCompare(b.key) : (b.labor + b.parts) - (a.labor + a.parts)))
            .map((b) => {
              const total = b.labor + b.parts;
              return share
                ? { ...b, total, laborV: total ? (b.labor / total) * 100 : 0, partsV: total ? (b.parts / total) * 100 : 0 }
                : { ...b, total, laborV: b.labor, partsV: b.parts };
            });
          const labor = sum(data, 'labor');
          const parts = sum(data, 'parts');
          const fmt = (v) => (share ? `${Number(v).toFixed(1)}%` : formatINR(v));
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Total cost" value={formatINR(labor + parts)} />
                <Stat label="Labor" value={formatINR(labor)} />
                <Stat label="Parts" value={formatINR(parts)} />
                <Stat label="Parts share" value={formatPct(labor + parts ? parts / (labor + parts) : 0)} />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: cfg.time ? 0 : 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false}
                      {...(cfg.time ? { minTickGap: 16 } : { interval: 0, angle: -25, textAnchor: 'end', height: 50 })} />
                    <YAxis tickFormatter={share ? (v) => `${v}%` : formatINRAxis} domain={share ? [0, 100] : [0, 'auto']} tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }}
                      formatter={(v, n) => [fmt(v), n]}
                      labelFormatter={(l, p) => (p?.[0] ? `${l} · ${formatNumber(p[0].payload.ros)} ROs · ${formatINR(p[0].payload.total)}` : l)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="laborV" name="Labor" stackId="c" fill="#6366f1" />
                    <Bar dataKey="partsV" name="Parts" stackId="c" fill="#f97316" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}
