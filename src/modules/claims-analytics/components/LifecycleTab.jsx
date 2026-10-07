import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts';
import { fetchBreakdown } from '../api';
import { useAsync, tooltipStyle, sortByOrder, CYCLE_BUCKETS, AGING_BUCKETS, STATUS_COLORS } from '../lib';
import { Card, DataState, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatNumber, formatPct } from '../../../lib/format';

const SLA_DAYS = 21; // design.md §14 D4 (proposed)

export default function LifecycleTab({ filters, fkey, actions, lookups }) {
  const groups = useAsync(() => fetchBreakdown(filters, 'status_group', 5), fkey);
  const statuses = useAsync(() => fetchBreakdown(filters, 'status', 10), fkey);
  const byDealer = useAsync(() => fetchBreakdown(filters, 'dealer', 200), fkey);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* L1 */}
        <Card title="Claim funnel" subtitle="All → decided → paid / rejected" info="Decided = Paid + Rejected. Open covers Open, Submitted and In Review. Click a stage to filter.">
          <DataState state={groups} height="h-60">
            {(rows) => {
              const g = Object.fromEntries(rows.map((r) => [r.key, Number(r.claims)]));
              const total = rows.reduce((s, r) => s + Number(r.claims), 0);
              const decided = (g.Approved || 0) + (g.Rejected || 0);
              const stages = [
                ['All claims', total, '#0f172a', null],
                ['Decided', decided, '#475569', null],
                ['Paid', g.Approved || 0, STATUS_COLORS.Approved, 'Approved'],
                ['Rejected', g.Rejected || 0, STATUS_COLORS.Rejected, 'Rejected'],
                ['Still open', g.Open || 0, STATUS_COLORS.Open, 'Open'],
              ];
              return (
                <div className="space-y-2.5 pt-1">
                  {stages.map(([label, n, color, chip]) => (
                    <button key={label} type="button" disabled={!chip} onClick={() => chip && actions.addChip('status_group', chip)} className="w-full text-left group disabled:cursor-default">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className="tabular-nums text-slate-500">{formatNumber(n)} · {formatPct(total ? n / total : null)}</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full group-hover:opacity-80" style={{ width: `${total ? (n / total) * 100 : 0}%`, backgroundColor: color }} />
                      </div>
                    </button>
                  ))}
                  <DataState state={statuses} height="h-6">
                    {(s) => <p className="text-[11px] text-slate-400 pt-1">Raw statuses: {s.map((r) => `${r.key} ${r.claims}`).join(' · ')}</p>}
                  </DataState>
                </div>
              );
            }}
          </DataState>
        </Card>

        {/* L2 / L3 combined */}
        <DecisionAgingCard filters={filters} fkey={fkey} actions={actions} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* L4 */}
        <CycleTrendCard filters={filters} fkey={fkey} lookups={lookups} />

        {/* L5 */}
        <Card title="Rejection & cycle time by dealer" subtitle="Dealers with ≥ 5 decided claims, highest rejection first" info="High rejection points to poor claim quality at the dealer (documentation, eligibility). Click a row to open the dealer drill-down.">
          <DataState state={byDealer} height="h-64">
            {(rows) => (
              <div className="h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="py-2 font-semibold">Dealer</th>
                      <th className="py-2 font-semibold text-right">Claims</th>
                      <th className="py-2 font-semibold text-right">Rejection</th>
                      <th className="py-2 font-semibold text-right">Avg cycle</th>
                      <th className="py-2 font-semibold text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((r) => Number(r.claims) >= 5 && r.rejection_rate !== null)
                      .sort((a, b) => Number(b.rejection_rate) - Number(a.rejection_rate))
                      .map((r) => (
                        <tr key={r.key} onClick={() => actions.openEntity('dealer', r.key)} className="border-b border-slate-50 hover:bg-sky-50 cursor-pointer">
                          <td className="py-1.5 font-medium text-slate-700">{r.key}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatNumber(r.claims)}</td>
                          <td className={`py-1.5 text-right tabular-nums ${Number(r.rejection_rate) > 0.25 ? 'text-rose-600 font-semibold' : ''}`}>{formatPct(r.rejection_rate)}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.avg_cycle_days ?? '—'} d</td>
                          <td className="py-1.5 text-right tabular-nums">{formatINR(r.cost_inr)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataState>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L2 + L3: decided claims by time to decision, or open claims by age
// ---------------------------------------------------------------------------
const CYCLE_COLOR = (key) => (['22-30', '30+'].includes(key) ? '#f59e0b' : key === 'Not adjudicated' ? '#cbd5e1' : '#0284c7');
const AGING_COLOR = (key) => (key === '60+' ? '#e11d48' : key === '31-60' ? '#f59e0b' : key === 'Future-dated' ? '#a855f7' : '#0284c7');

function DecisionAgingCard({ filters, fkey, actions }) {
  const [view, setView] = useState('decision');
  const isDecision = view === 'decision';
  const state = useAsync(() => fetchBreakdown(filters, isDecision ? 'cycle_bucket' : 'aging_bucket', 10), `${fkey}|${view}`);
  return (
    <Card
      className="xl:col-span-2"
      title={isDecision ? 'Time to decision' : 'Backlog aging'}
      subtitle={isDecision
        ? `Days from submission to adjudication · amber = beyond the ${SLA_DAYS}-day target`
        : 'Open claims by days since submission (at the as-of date) · amber = 31-60 d · red = 60+ d'}
      info="Time to decision: how long decided claims took ('Not adjudicated' = no decision date yet). Backlog aging: how long open claims have been waiting; 'Future-dated' = open claims submitted after the as-of date, a data-quality flag. Click a backlog bar to list the open claims in the Explorer."
      actions={<Segmented value={view} onChange={setView} options={[{ value: 'decision', label: 'Time to decision' }, { value: 'aging', label: 'Backlog aging' }]} />}
    >
      <DataState state={state} height="h-60">
        {(rows) => {
          const data = isDecision ? sortByOrder(rows, CYCLE_BUCKETS) : sortByOrder(rows.filter((r) => r.key !== 'Closed'), AGING_BUCKETS);
          const total = data.reduce((s, r) => s + Number(r.claims), 0);
          const late = isDecision
            ? data.filter((r) => ['22-30', '30+'].includes(r.key)).reduce((s, r) => s + Number(r.claims), 0)
            : data.filter((r) => ['31-60', '60+'].includes(r.key)).reduce((s, r) => s + Number(r.claims), 0);
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>{isDecision ? 'Claims' : 'Open claims'} <strong className="text-slate-900 tabular-nums">{formatNumber(total)}</strong></span>
                <span>{isDecision ? `Beyond ${SLA_DAYS} days` : 'Older than 30 days'} <strong className="text-amber-600 tabular-nums">{formatNumber(late)} ({formatPct(total ? late / total : null, 0)})</strong></span>
                {!isDecision && <span>Value at stake <strong className="text-slate-900 tabular-nums">{formatINR(data.reduce((s, r) => s + Number(r.cost_inr || 0), 0))}</strong></span>}
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }}
                      formatter={(v, n, p) => [`${formatNumber(v)} claims · ${formatINR(p.payload.cost_inr)}`, isDecision ? 'Decided' : 'Open']}
                      labelFormatter={(l) => (isDecision && l !== 'Not adjudicated' ? `${l} days` : l)} />
                    <Bar dataKey="claims" radius={[3, 3, 0, 0]} cursor={isDecision ? 'default' : 'pointer'}
                      onClick={isDecision ? undefined : () => { actions.addChip('status_group', 'Open'); actions.setTab('explorer'); }}>
                      {data.map((r) => <Cell key={r.key} fill={isDecision ? CYCLE_COLOR(r.key) : AGING_COLOR(r.key)} />)}
                    </Bar>
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

// ---------------------------------------------------------------------------
// L4: average days to decision, grouped by time or by a dimension, with local filters
// ---------------------------------------------------------------------------
const TREND_GROUPS = {
  month: { label: 'Month', time: true },
  quarter: { label: 'Quarter', time: true },
  subsystem: { label: 'Subsystem' },
  liability_type: { label: 'Liability' },
  variant: { label: 'Variant' },
  vehicle_region: { label: 'Region' },
  customer_type: { label: 'Customer type' },
};

const smallSelect = 'border border-slate-200 rounded-md px-2 py-1 text-xs bg-white text-slate-700';

function CycleTrendCard({ filters, fkey, lookups }) {
  const [group, setGroup] = useState('month');
  const [liability, setLiability] = useState('');
  const [subsystem, setSubsystem] = useState('');
  const [risk, setRisk] = useState('');
  const cfg = TREND_GROUPS[group];
  const f = {
    ...filters,
    ...(liability && { liability_type: [liability] }),
    ...(subsystem && { subsystem: [subsystem] }),
    ...(risk && { risk_band: [risk] }),
  };
  const state = useAsync(() => fetchBreakdown(f, group, 120), `${fkey}|${group}|${liability}|${subsystem}|${risk}`);

  return (
    <Card
      title={`Cycle time by ${cfg.label.toLowerCase()}`}
      subtitle={`Average days from submission to decision · amber = above the ${SLA_DAYS}-day target`}
      info="Is claims processing speeding up or slowing down, and where is it slow? Only decided claims have a cycle time. The filters here apply to this chart only."
      actions={(
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={smallSelect} aria-label="Group by">
          {Object.entries(TREND_GROUPS).map(([value, g]) => <option key={value} value={value}>By {g.label.toLowerCase()}</option>)}
        </select>
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <select value={liability} onChange={(e) => setLiability(e.target.value)} className={smallSelect} aria-label="Liability">
          <option value="">All liability</option><option value="OEM">OEM</option><option value="Supplier">Supplier</option>
        </select>
        <select value={subsystem} onChange={(e) => setSubsystem(e.target.value)} className={smallSelect} aria-label="Subsystem">
          <option value="">All subsystems</option>
          {(lookups?.subsystems || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={risk} onChange={(e) => setRisk(e.target.value)} className={smallSelect} aria-label="Risk band">
          <option value="">All risk bands</option><option value="High">High risk</option><option value="Medium">Medium risk</option><option value="Low">Low risk</option>
        </select>
        {(liability || subsystem || risk) && (
          <button type="button" onClick={() => { setLiability(''); setSubsystem(''); setRisk(''); }} className="text-slate-500 hover:text-rose-600">Clear</button>
        )}
      </div>
      <DataState state={state} height="h-64">
        {(rows) => {
          const data = rows.filter((r) => r.key !== null && r.avg_cycle_days !== null)
            .map((r) => ({ ...r, days: Number(r.avg_cycle_days) }))
            .sort((a, b) => (cfg.time ? String(a.key).localeCompare(String(b.key)) : b.days - a.days));
          return (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: cfg.time ? 0 : 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false}
                    {...(cfg.time ? { minTickGap: 12 } : { interval: 0, angle: -25, textAnchor: 'end', height: 50 })} />
                  <YAxis unit="d" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#f8fafc' }}
                    formatter={(v, n, p) => [`${Number(v).toFixed(1)} days · ${formatNumber(p.payload.claims)} claims · ${formatPct(p.payload.rejection_rate, 0)} rejected`, 'Avg cycle']} />
                  <ReferenceLine y={SLA_DAYS} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `${SLA_DAYS}-day target`, position: 'insideTopRight', fontSize: 10, fill: '#b45309' }} />
                  <Bar dataKey="days" name="Avg cycle" radius={[3, 3, 0, 0]}>
                    {data.map((r) => <Cell key={r.key} fill={r.days > SLA_DAYS ? '#f59e0b' : '#0284c7'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}
