import React from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts';
import { fetchRoBreakdown, fetchRoPoints, fetchBreakdown } from '../api';
import { useAsync, tooltipStyle, num } from '../lib';
import { Card, DataState, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';

const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);

function overrunColor(rate) {
  if (rate >= 0.5) return '#e11d48';
  if (rate >= 0.35) return '#f59e0b';
  return '#10b981';
}

export default function LaborTab({ filters, fkey, actions, local }) {
  const totals = useAsync(() => fetchRoBreakdown(filters, 'ro_source', 10), fkey);
  const points = useAsync(() => fetchRoPoints(filters, 1500), fkey);
  const byDealer = useAsync(() => fetchRoBreakdown(filters, 'dealer', 200), fkey);
  const dealerClaims = useAsync(() => fetchBreakdown(filters, 'dealer', 200), fkey);
  const byPart = useAsync(() => fetchRoBreakdown(filters, 'part', 60), fkey);
  const allScope = { ...filters, ro_scope: 'all' };
  const visit = useAsync(() => fetchRoBreakdown(allScope, 'visit_type', 10), `${fkey}|all`);
  const byMonth = useAsync(() => fetchRoBreakdown(filters, 'month', 120), fkey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500 font-medium">Repair-order scope</span>
        <Segmented value={local.roScope} onChange={actions.setRoScope} options={[{ value: 'warranty', label: 'Warranty ROs' }, { value: 'all', label: 'All ROs' }]} />
        <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
          <input type="checkbox" checked={local.overrunOnly} onChange={(e) => actions.setOverrunOnly(e.target.checked)} className="accent-sky-600" />
          Labor overrun only
        </label>
        <span className="text-slate-400">Claim-only chips (status, liability, risk…) do not apply to repair orders.</span>
      </div>

      {/* R1 */}
      <DataState state={totals} height="h-24">
        {(rows) => {
          const ros = sum(rows, 'ros');
          const weighted = (k) => rows.reduce((s, r) => s + Number(r[k] || 0) * Number(r.ros), 0) / Math.max(ros, 1);
          const cards = [
            ['Repair orders', formatNumber(ros), 'in scope'],
            ['Overrun rate', formatPct(weighted('overrun_rate')), 'billed > SRT max allowable'],
            ['Excess hours', formatNumber(sum(rows, 'excess_hours'), 0), 'above max allowable'],
            ['Excess labor ₹', formatINR(sum(rows, 'excess_labor_cost_inr')), 'excess hours × ₹1,500/h'],
            ['Billed vs SRT', `${weighted('avg_billed_hours').toFixed(2)} / ${weighted('avg_benchmark_hours').toFixed(2)} h`, 'avg billed / benchmark'],
          ];
          return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {cards.map(([label, value, sub]) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                  <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
                  <p className="text-[11px] text-slate-400">{sub}</p>
                </div>
              ))}
            </div>
          );
        }}
      </DataState>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* R2 */}
        <Card title="Billed hours vs SRT benchmark" subtitle="Each dot is a repair order · grey line = billed equals benchmark · red = above max allowable" info="Points far above the diagonal are over-billed. A vertical stack at one benchmark value means many ROs for the same part; if they are all high, the SRT itself may be unrealistic. Click a dot to open the claim.">
          <DataState state={points}>
            {(rows) => {
              const data = rows.map((r) => ({ ...r, x: Number(r.benchmark_labor_hours), y: Number(r.billed_hours) }));
              const max = Math.ceil(Math.max(...data.map((d) => Math.max(d.x, d.y)), 1));
              return (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" dataKey="x" name="SRT benchmark" unit=" h" domain={[0, max]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis type="number" dataKey="y" name="Billed" unit=" h" domain={[0, max]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <ZAxis range={[18, 18]} />
                      <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [`${Number(v).toFixed(2)} h`, n]}
                        labelFormatter={() => ''} />
                      <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#94a3b8" />
                      <Scatter name="Within limit" data={data.filter((d) => !d.is_labor_overrun)} fill="#94a3b8" fillOpacity={0.5} cursor="pointer" onClick={(d) => d.claim_id && actions.openClaim(d.claim_id)} />
                      <Scatter name="Overrun" data={data.filter((d) => d.is_labor_overrun)} fill="#e11d48" fillOpacity={0.7} cursor="pointer" onClick={(d) => d.claim_id && actions.openClaim(d.claim_id)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </DataState>
        </Card>

        {/* R3 */}
        <Card title="Overrun rate by dealer" subtitle="Dealers with ≥ 5 repair orders, worst 15 · dashed = network average" info="Share of the dealer's repair orders billed above the SRT maximum allowable hours. Label = excess labor ₹. Click a bar to open the dealer drill-down.">
          <DataState state={byDealer}>
            {(rows) => {
              const eligible = rows.filter((r) => Number(r.ros) >= 5);
              const avg = sum(rows, 'ros') ? rows.reduce((s, r) => s + Number(r.overrun_rate || 0) * Number(r.ros), 0) / sum(rows, 'ros') : 0;
              const data = eligible.sort((a, b) => Number(b.overrun_rate) - Number(a.overrun_rate)).slice(0, 15)
                .map((r) => ({ ...r, rate: Number(r.overrun_rate) * 100 }));
              return (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="key" width={160} tick={{ fontSize: 10, fill: '#334155' }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${Number(v).toFixed(0)}% of ${p.payload.ros} ROs · excess ${formatINR(p.payload.excess_labor_cost_inr)}`, 'Overrun']} />
                      <ReferenceLine x={avg * 100} stroke="#64748b" strokeDasharray="4 4" />
                      <Bar dataKey="rate" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d) => actions.openEntity('dealer', d.key)}>
                        {data.map((d) => <Cell key={d.key} fill={overrunColor(d.rate / 100)} />)}
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
        {/* R4 */}
        <Card title="Dealer benchmark" subtitle="x = claims · y = avg claim cost · bubble size = NFF % · colour = labor overrun rate" info="Outlier dealers on several dimensions at once: top-right with large red bubbles need an audit. Click a bubble to open the dealer drill-down.">
          <DataState state={dealerClaims}>
            {(rows) => {
              const data = rows.map((r) => ({ ...r, x: Number(r.claims), y: Number(r.avg_cost_inr), z: Number(r.nff_rate) * 100, o: Number(r.overrun_rate) }));
              return (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" dataKey="x" name="Claims" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis type="number" dataKey="y" name="Avg cost" tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} width={48} />
                      <ZAxis type="number" dataKey="z" range={[30, 400]} name="NFF %" />
                      <Tooltip {...tooltipStyle} content={({ payload }) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return null;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow">
                            <p className="font-semibold text-slate-800">{p.key}</p>
                            <p>{p.x} claims · avg {formatINR(p.y)}</p>
                            <p>NFF {p.z.toFixed(1)}% · overrun {formatPct(p.o)}</p>
                          </div>
                        );
                      }} />
                      <Scatter data={data} cursor="pointer" onClick={(d) => actions.openEntity('dealer', d.key)}>
                        {data.map((d) => <Cell key={d.key} fill={overrunColor(d.o)} fillOpacity={0.65} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </DataState>
        </Card>

        {/* R5 */}
        <Card title="Overrun rate by part" subtitle="Parts with ≥ 5 repair orders, worst 15" info="If a part overruns at most dealers, review its SRT benchmark rather than the dealers. Click to filter by part.">
          <DataState state={byPart}>
            {(rows) => {
              const data = rows.filter((r) => Number(r.ros) >= 5 && r.key).sort((a, b) => Number(b.overrun_rate) - Number(a.overrun_rate)).slice(0, 15)
                .map((r) => ({ ...r, rate: Number(r.overrun_rate) * 100 }));
              return (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="key" width={170} tick={{ fontSize: 10, fill: '#334155' }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${Number(v).toFixed(0)}% of ${p.payload.ros} ROs · billed ${p.payload.avg_billed_hours} vs SRT ${p.payload.avg_benchmark_hours} h`, 'Overrun']} />
                      <Bar dataKey="rate" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d) => actions.addNamedChip('part', d.key)}>
                        {data.map((d) => <Cell key={d.key} fill={overrunColor(d.rate / 100)} />)}
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
        {/* R6 */}
        <Card title="Visit type & downtime" tag="Connected fleet" subtitle="All repair orders · bars = ROs · line = avg downtime (h)" info="Visit type and downtime are only recorded for telematics repair orders (200 connected vehicles). Seed repair orders appear as 'Not recorded'. Breakdown visits cost far more downtime than planned or predicted ones.">
          <DataState state={visit} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows.map((r) => ({ ...r, downtime: num(r.avg_downtime_hours) }))} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="ros" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="dt" orientation="right" unit="h" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="ros" dataKey="ros" name="Repair orders" fill="#0ea5e9" radius={[3, 3, 0, 0]} cursor="pointer"
                      onClick={(d) => d.key !== 'Not recorded (seed)' && actions.addChip('visit_type', d.key)} />
                    <Line yAxisId="dt" dataKey="downtime" name="Avg downtime" stroke="#e11d48" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>

        {/* R7 */}
        <Card title="Labor vs parts cost by month" subtitle="Repair-order cost composition" info="Labor cost comes from all ROs. Parts cost is only recorded on telematics ROs; seed ROs have labor only.">
          <DataState state={byMonth} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...rows].sort((a, b) => String(a.key).localeCompare(String(b.key))).map((r) => ({ ...r, labor: num(r.labor_cost), parts: num(r.parts_cost) || 0 }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip {...tooltipStyle} formatter={(v) => formatINR(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="labor" name="Labor" stackId="c" fill="#6366f1" />
                    <Bar dataKey="parts" name="Parts" stackId="c" fill="#f97316" />
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
