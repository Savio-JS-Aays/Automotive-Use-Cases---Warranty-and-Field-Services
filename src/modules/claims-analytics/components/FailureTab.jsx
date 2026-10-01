import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { fetchBreakdown, fetchMatrix } from '../api';
import { useAsync, tooltipStyle, num, misBucketForMonths, kmBucketForKm } from '../lib';
import { Card, DataState, Segmented, Heatmap } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';

const PARETO_DIMS = [
  { value: 'part', label: 'Part' },
  { value: 'subsystem', label: 'Subsystem' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'dealer', label: 'Dealer' },
];

const MEASURES = {
  claims: { label: 'Claims', fmt: (v) => formatNumber(v) },
  cost_inr: { label: 'Cost', fmt: (v) => formatINR(v) },
  avg_cost_inr: { label: 'Avg cost', fmt: (v) => formatINR(v) },
  nff_rate: { label: 'NFF %', fmt: (v) => formatPct(v, 0) },
  overrun_rate: { label: 'Overrun %', fmt: (v) => formatPct(v, 0) },
};

function matrixLookup(rows, measure) {
  const map = {};
  const xs = new Set();
  const ys = new Set();
  (rows || []).forEach((r) => {
    xs.add(r.x_key);
    ys.add(r.y_key);
    map[`${r.y_key}|${r.x_key}`] = num(r[measure]);
  });
  return { map, xs: [...xs].filter((v) => v !== null).sort(), ys: [...ys].filter((v) => v !== null).sort() };
}

function MatrixCard({ title, subtitle, info, state, measures, rowLabel, onCellClick, showTotals }) {
  const [measure, setMeasure] = useState(measures[0]);
  return (
    <Card
      title={title} subtitle={subtitle} info={info}
      actions={<Segmented size="xs" value={measure} onChange={setMeasure} options={measures.map((m) => ({ value: m, label: MEASURES[m].label }))} />}
    >
      <DataState state={state} height="h-48">
        {(rows) => {
          const { map, xs, ys } = matrixLookup(rows, measure);
          const additive = measure === 'claims' || measure === 'cost_inr';
          return (
            <Heatmap
              rows={ys} cols={xs} rowLabel={rowLabel} showTotals={showTotals && additive}
              getValue={(r, c) => map[`${r}|${c}`] ?? null}
              format={MEASURES[measure].fmt}
              onCellClick={onCellClick}
            />
          );
        }}
      </DataState>
    </Card>
  );
}

export default function FailureTab({ filters, fkey, actions, lookups }) {
  const [paretoDim, setParetoDim] = useState('part');
  const pareto = useAsync(() => fetchBreakdown(filters, paretoDim, 25), `${fkey}|${paretoDim}`);
  const subsystemMonth = useAsync(() => fetchMatrix(filters, 'month', 'subsystem'), fkey);
  const variantSubsystem = useAsync(() => fetchMatrix(filters, 'subsystem', 'variant'), fkey);
  const customerSubsystem = useAsync(() => fetchMatrix(filters, 'subsystem', 'customer_type'), fkey);
  const mis = useAsync(() => fetchBreakdown(filters, 'mis_quarter', 40), fkey);
  const km = useAsync(() => fetchBreakdown(filters, 'km_25k', 40), fkey);
  const byPart = useAsync(() => fetchBreakdown(filters, 'part', 60), fkey);
  const suppliers = useAsync(() => fetchBreakdown(filters, 'supplier', 30), fkey);

  // B10 reference line when exactly one part is selected (design life is stored in miles)
  const selectedParts = filters.part_id || [];
  const singlePart = selectedParts.length === 1
    ? Object.values(lookups?.partByName || {}).find((p) => p.part_id === selectedParts[0])
    : null;
  const b10Km = singlePart?.b10_design_life_miles ? singlePart.b10_design_life_miles * 1.609344 : null;

  const onParetoClick = (key) => {
    if (paretoDim === 'part' || paretoDim === 'dealer') actions.openEntity(paretoDim, key);
    else if (paretoDim === 'subsystem') actions.addChip('subsystem', key);
    else actions.addNamedChip('supplier', key);
  };

  return (
    <div className="space-y-4">
      {/* F1 */}
      <Card
        title="Cost Pareto"
        subtitle="Bars = claim cost · line = cumulative share of cost · dashed = 80%"
        info="Identifies the vital few items that drive most of the warranty cost (top 25 shown). Click a bar to drill down."
        actions={<Segmented value={paretoDim} onChange={setParetoDim} options={PARETO_DIMS} />}
      >
        <DataState state={pareto}>
          {(rows) => (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={rows.map((r) => ({ ...r, cost_inr: num(r.cost_inr), cum: num(r.cum_cost_share) * 100 }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="key" interval={0} angle={-35} textAnchor="end" height={70} tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} />
                  <YAxis yAxisId="cost" tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} />
                  <YAxis yAxisId="cum" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...tooltipStyle} formatter={(v, name) => (name === 'Cumulative' ? `${Number(v).toFixed(1)}%` : formatINR(v))} />
                  <ReferenceLine yAxisId="cum" y={80} stroke="#f43f5e" strokeDasharray="4 4" />
                  <Bar yAxisId="cost" dataKey="cost_inr" name="Cost" fill="#0284c7" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d) => onParetoClick(d.key)} />
                  <Line yAxisId="cum" dataKey="cum" name="Cumulative" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </DataState>
      </Card>

      {/* F2 */}
      <MatrixCard
        title="Subsystem × month" subtitle="Emerging problems show up as darkening cells along a row"
        info="Rows = vehicle subsystem, columns = submission month. Click a cell to filter by that subsystem and narrow the date range to that month."
        state={subsystemMonth} measures={['claims', 'cost_inr', 'avg_cost_inr']} rowLabel="Subsystem"
        onCellClick={(sub, month) => { actions.addChip('subsystem', sub); actions.narrowToPeriod(`${month}-01`, 'month'); }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* F3 */}
        <MatrixCard
          title="Variant × subsystem" subtitle="Which product has which weakness" showTotals
          info="Click a cell to set the variant (global) and subsystem (local) filters."
          state={variantSubsystem} measures={['claims', 'cost_inr', 'nff_rate', 'overrun_rate']} rowLabel="Variant"
          onCellClick={(variant, sub) => { actions.setVariant(variant); actions.addChip('subsystem', sub); }}
        />
        {/* F6 */}
        <MatrixCard
          title="Customer type × subsystem" subtitle="Duty-severity effect by customer segment" showTotals
          info="Mining / construction duty cycles vs long-haul. Click a cell to set the customer type (global) and subsystem filters."
          state={customerSubsystem} measures={['claims', 'cost_inr', 'avg_cost_inr']} rowLabel="Customer type"
          onCellClick={(ct, sub) => { actions.setCustomerType(ct); actions.addChip('subsystem', sub); }}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* F4 */}
        <Card title="Months in service at claim" subtitle="Claims per 3-month bucket of vehicle age (claim date − in-service date)" info="Early-life failures (left) suggest build / quality issues; late failures suggest wear-out. Click a bar to filter by the matching MIS bucket.">
          <DataState state={mis} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...rows].sort((a, b) => Number(a.key) - Number(b.key)).map((r) => ({ ...r, label: Number(r.key) }))} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} label={{ value: 'months in service', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} labelFormatter={(l) => `${l}–${l + 2} months`} />
                    <Bar dataKey="claims" name="Claims" fill="#6366f1" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d) => actions.addChip('mis_bucket', misBucketForMonths(d.label))} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>
        {/* F5 */}
        <Card
          title="km at failure" subtitle={b10Km ? `Claims per 25k km · red line = B10 design life of the selected part (${formatNumber(b10Km)} km)` : 'Claims per 25k km (select a single part to see its B10 design life)'}
          info="Odometer at failure in km (converted from recorded miles). Click a bar to filter by the matching km bucket."
        >
          <DataState state={km} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...rows].sort((a, b) => Number(a.key) - Number(b.key)).map((r) => ({ ...r, km: Number(r.key) * 25000 }))} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="km" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => `${v / 1000}k`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} labelFormatter={(v) => `~${formatNumber(v)} km`} />
                    {b10Km && <ReferenceLine x={b10Km} stroke="#f43f5e" strokeDasharray="4 4" />}
                    <Bar dataKey="claims" name="Claims" fill="#0ea5e9" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d) => actions.addChip('km_bucket', kmBucketForKm(d.km))} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </DataState>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* F7 */}
        <Card title="No-fault-found rate by part" subtitle="Parts with ≥ 5 claims, highest NFF first" info="High NFF points to misdiagnosis (training or diagnostic gaps), not part quality. Click to open the part drill-down.">
          <DataState state={byPart} height="h-72">
            {(rows) => {
              const data = rows.filter((r) => Number(r.claims) >= 5).sort((a, b) => Number(b.nff_rate) - Number(a.nff_rate)).slice(0, 12)
                .map((r) => ({ ...r, nff: Number(r.nff_rate) * 100 }));
              return (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="key" width={170} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${Number(v).toFixed(1)}% of ${p.payload.claims} claims`, 'NFF']} />
                      <Bar dataKey="nff" fill="#f59e0b" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d) => actions.openEntity('part', d.key)} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </DataState>
        </Card>
        {/* F8 */}
        <Card title="Suppliers" subtitle="Claim cost, recovery and quality by liable supplier" info="Recovery % = recovered ÷ claim cost for this supplier's claims (all statuses). Click a row to filter by supplier.">
          <DataState state={suppliers} height="h-72">
            {(rows) => (
              <div className="h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="py-2 font-semibold">Supplier</th>
                      <th className="py-2 font-semibold text-right">Claims</th>
                      <th className="py-2 font-semibold text-right">Cost</th>
                      <th className="py-2 font-semibold text-right">Recovered</th>
                      <th className="py-2 font-semibold text-right">Recovery</th>
                      <th className="py-2 font-semibold text-right">NFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} onClick={() => actions.addNamedChip('supplier', r.key)} className="border-b border-slate-50 hover:bg-sky-50 cursor-pointer">
                        <td className="py-1.5 font-medium text-slate-700">{r.key}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatNumber(r.claims)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatINR(r.cost_inr)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatINR(r.recovered_inr)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatPct(Number(r.cost_inr) ? Number(r.recovered_inr) / Number(r.cost_inr) : null)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatPct(r.nff_rate)}</td>
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
