import React from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { fetchBreakdown } from '../api';
import { useAsync, tooltipStyle, sortByOrder, CYCLE_BUCKETS, AGING_BUCKETS, STATUS_COLORS } from '../lib';
import { Card, DataState } from '../../../components/analytics/ui';
import { formatINR, formatNumber, formatPct } from '../../../lib/format';

const SLA_DAYS = 21; // design.md §14 D4 (proposed)

export default function LifecycleTab({ filters, fkey, actions }) {
  const groups = useAsync(() => fetchBreakdown(filters, 'status_group', 5), fkey);
  const statuses = useAsync(() => fetchBreakdown(filters, 'status', 10), fkey);
  const cycle = useAsync(() => fetchBreakdown(filters, 'cycle_bucket', 10), fkey);
  const aging = useAsync(() => fetchBreakdown(filters, 'aging_bucket', 10), fkey);
  const byMonth = useAsync(() => fetchBreakdown(filters, 'month', 120), fkey);
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

        {/* L2 */}
        <Card title="Time to decision" subtitle={`Days from submission to adjudication · amber = beyond ${SLA_DAYS}-day target`} info="Distribution of adjudication cycle time. 'Not adjudicated' = no decision date yet.">
          <DataState state={cycle} height="h-60">
            {(rows) => (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortByOrder(rows, CYCLE_BUCKETS)} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="claims" name="Claims" radius={[3, 3, 0, 0]}>
                      {sortByOrder(rows, CYCLE_BUCKETS).map((r) => (
                        <Cell key={r.key} fill={['22-30', '30+'].includes(r.key) ? '#f59e0b' : r.key === 'Not adjudicated' ? '#cbd5e1' : '#0284c7'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>

        {/* L3 */}
        <Card title="Backlog aging" subtitle="Open claims by days since submission (at the as-of date)" info="'Future-dated' = open claims submitted after the as-of date: a data-quality flag. Click a bar to list the open claims in the Explorer.">
          <DataState state={aging} height="h-60">
            {(rows) => {
              const data = sortByOrder(rows.filter((r) => r.key !== 'Closed'), AGING_BUCKETS);
              return (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${v} claims · ${formatINR(p.payload.cost_inr)}`, 'Open']} />
                      <Bar dataKey="claims" radius={[3, 3, 0, 0]} cursor="pointer" onClick={() => { actions.addChip('status_group', 'Open'); actions.setTab('explorer'); }}>
                        {data.map((r) => (
                          <Cell key={r.key} fill={r.key === '60+' ? '#e11d48' : r.key === '31-60' ? '#f59e0b' : r.key === 'Future-dated' ? '#a855f7' : '#0284c7'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </DataState>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* L4 */}
        <Card title="Cycle time trend" subtitle="Average days to decision by submission month" info="Is claims processing speeding up or slowing down?">
          <DataState state={byMonth} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...rows].sort((a, b) => String(a.key).localeCompare(String(b.key))).map((r) => ({ ...r, days: r.avg_cycle_days === null ? null : Number(r.avg_cycle_days) }))} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis unit="d" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)} days`} />
                    <Line dataKey="days" name="Avg cycle" stroke="#0284c7" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>

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
