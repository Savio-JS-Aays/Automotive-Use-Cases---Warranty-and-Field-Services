import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { fetchTimeseries, fetchBreakdown } from '../api';
import { useAsync, tooltipStyle, STATUS_COLORS, num } from '../lib';
import { Card, DataState, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber } from '../../../lib/format';

const periodLabel = (d, grain) => {
  const date = new Date(`${d}T00:00:00`);
  if (grain === 'quarter') return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  if (grain === 'week') return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

export default function SummaryTab({ filters, fkey, actions }) {
  const [grain, setGrain] = useState('month');
  const series = useAsync(() => fetchTimeseries(filters, grain), `${fkey}|${grain}`);
  const liability = useAsync(() => fetchBreakdown(filters, 'liability_type', 5), fkey);
  const parts = useAsync(() => fetchBreakdown(filters, 'part', 10), fkey);

  const seriesRows = (series.data || []).map((r) => ({
    ...r,
    label: periodLabel(r.period, grain),
    cost_inr: num(r.cost_inr),
    claims_per_1000_vis: num(r.claims_per_1000_vis),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* S2 */}
        <Card
          className="xl:col-span-2"
          title="Claims & cost trend"
          subtitle="Bars = claim cost (₹) · line = claims · dashed = claims per 1,000 vehicles in service"
          info="Cost uses claim_amount_inr (seed claims derived, telematics claims reported). Normalising by vehicles in service separates fleet growth from quality change. Click a bar to narrow the date range to that period."
          actions={<Segmented value={grain} onChange={setGrain} options={[{ value: 'week', label: 'Wk' }, { value: 'month', label: 'Mo' }, { value: 'quarter', label: 'Qtr' }]} />}
        >
          <DataState state={series}>
            {() => (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={seriesRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={12} />
                    <YAxis yAxisId="cost" tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} />
                    <YAxis yAxisId="claims" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={36} />
                    <YAxis yAxisId="rate" orientation="right" hide />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v, name) => (name === 'Cost' ? formatINR(v) : name === 'Per 1,000 VIS' ? formatNumber(v, 2) : formatNumber(v))}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      yAxisId="cost" dataKey="cost_inr" name="Cost" fill="#bae6fd" radius={[3, 3, 0, 0]} cursor="pointer"
                      onClick={(d) => actions.narrowToPeriod(d.period, grain)}
                    />
                    <Line yAxisId="claims" dataKey="claims" name="Claims" stroke="#0284c7" strokeWidth={2} dot={false} />
                    <Line yAxisId="rate" dataKey="claims_per_1000_vis" name="Per 1,000 VIS" stroke="#6366f1" strokeDasharray="4 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>

        {/* S4 */}
        <Card
          title="Liability & recovery"
          subtitle="OEM vs supplier-liable cost; recovered share of supplier cost"
          info="Supplier-liable claims can be charged back (subrogation). Click a slice to filter by liability."
        >
          <DataState state={liability}>
            {(rows) => {
              const supplier = rows.find((r) => r.key === 'Supplier');
              const recovered = num(supplier?.recovered_inr) || 0;
              const supplierCost = num(supplier?.cost_inr) || 0;
              return (
                <div className="flex flex-col h-72">
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={rows.map((r) => ({ ...r, cost_inr: num(r.cost_inr) }))}
                          dataKey="cost_inr" nameKey="key" innerRadius="55%" outerRadius="85%" paddingAngle={2} cursor="pointer"
                          onClick={(d) => actions.addChip('liability_type', d.key ?? d.name)}
                        >
                          {rows.map((r) => (
                            <Cell key={r.key} fill={r.key === 'Supplier' ? '#6366f1' : '#0284c7'} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v) => formatINR(v)} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Recovered {formatINR(recovered)}</span>
                      <span>of supplier cost {formatINR(supplierCost)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${supplierCost ? (recovered / supplierCost) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              );
            }}
          </DataState>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* S3 */}
        <Card title="Status mix over time" subtitle="Claims by status group per period" info="Open = Open + Submitted + In Review; Approved = Paid. Click a segment to filter by status group.">
          <DataState state={series}>
            {() => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seriesRows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={12} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {[['approved', 'Approved'], ['rejected', 'Rejected'], ['open_claims', 'Open']].map(([k, name]) => (
                      <Bar key={k} dataKey={k} name={name} stackId="s" fill={STATUS_COLORS[name]} cursor="pointer" onClick={() => actions.addChip('status_group', name)} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>

        {/* S5 */}
        <Card title="Top 10 parts by cost" subtitle="Claim cost (₹) · claim count in label" info="Click a bar to open the part drill-down.">
          <DataState state={parts} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows.map((r) => ({ ...r, cost_inr: num(r.cost_inr) }))} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <XAxis type="number" tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="key" width={170} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${formatINR(v)} · ${p.payload.claims} claims`, 'Cost']} />
                    <Bar dataKey="cost_inr" fill="#0284c7" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d) => actions.openEntity('part', d.key)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>
      </div>
    </div>
  );
}
