import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { fetchCohort, fetchMatrix } from '../api';
import { useAsync, tooltipStyle, CHART_COLORS, num } from '../lib';
import { Card, DataState, Segmented, Heatmap } from '../../../components/analytics/ui';
import { formatNumber } from '../../../lib/format';

// Aggregate quarter cohorts into production-year curves: cumulative claims per 1,000 vehicles by MIS.
function yearCurves(rows) {
  const byYear = {};
  const vehicles = {};
  rows.forEach((r) => {
    const year = r.cohort.slice(0, 4);
    const key = `${year}|${r.mis_from}`;
    byYear[key] = byYear[key] || { year, mis: r.mis_from, claims: 0, observable: true };
    byYear[key].claims += Number(r.claims);
    byYear[key].observable = byYear[key].observable && r.is_observable;
    vehicles[year] = vehicles[year] || {};
    vehicles[year][r.cohort] = Number(r.cohort_vehicles);
  });
  const years = Object.keys(vehicles).sort();
  const misSteps = [...new Set(rows.map((r) => r.mis_from))].sort((a, b) => a - b);
  const running = Object.fromEntries(years.map((y) => [y, 0]));
  return {
    years,
    data: misSteps.map((mis) => {
      const point = { mis };
      years.forEach((y) => {
        const cell = byYear[`${y}|${mis}`];
        running[y] += cell ? cell.claims : 0;
        const n = Object.values(vehicles[y]).reduce((a, b) => a + b, 0);
        point[y] = cell && cell.observable ? Number(((running[y] * 1000) / n).toFixed(1)) : null;
      });
      return point;
    }),
  };
}

export default function CohortTab({ filters, fkey, actions }) {
  const [step, setStep] = useState(6);
  const cohort = useAsync(() => fetchCohort(filters, step), `${fkey}|${step}`);
  const prodSubsystem = useAsync(() => fetchMatrix(filters, 'subsystem', 'production_quarter'), fkey);

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
        Cohort views are <strong>lifetime</strong> views: the date range is ignored so every production quarter keeps its full claim history.
        All other filters apply.
      </div>

      {/* C1 */}
      <Card
        title="Cohort maturity matrix"
        subtitle="Cumulative claims per 1,000 vehicles · rows = production quarter · columns = months in service"
        info="The classic warranty maturity triangle. Compare rows at the same age: a darker row means that production period is failing faster. Grey cells are ages the cohort has not reached by the as-of date."
        actions={<Segmented value={step} onChange={setStep} options={[{ value: 3, label: '3 mo' }, { value: 6, label: '6 mo' }, { value: 12, label: '12 mo' }]} />}
      >
        <DataState state={cohort}>
          {(rows) => {
            const cohorts = [...new Set(rows.map((r) => r.cohort))].sort();
            const steps = [...new Set(rows.map((r) => r.mis_from))].sort((a, b) => a - b);
            const lastObservable = Math.max(...rows.filter((r) => r.is_observable).map((r) => r.mis_from));
            const cols = steps.filter((s) => s <= lastObservable).map(String);
            const cell = {};
            const size = {};
            rows.forEach((r) => {
              cell[`${r.cohort}|${r.mis_from}`] = r;
              size[r.cohort] = r.cohort_vehicles;
            });
            return (
              <Heatmap
                rows={cohorts}
                cols={cols}
                rowLabel="Production qtr (vehicles)"
                getValue={(c, m) => num(cell[`${c}|${m}`]?.cum_claims_per_1000)}
                isMuted={(c, m) => !cell[`${c}|${m}`]?.is_observable}
                format={(v) => formatNumber(v, 0)}
                onCellClick={() => actions.setTab('explorer')}
              />
            );
          }}
        </DataState>
        {cohort.data && (
          <p className="text-[11px] text-slate-400 mt-2">
            Cohort sizes: {[...new Map(cohort.data.map((r) => [r.cohort, r.cohort_vehicles])).entries()].map(([c, n]) => `${c} ${n}`).join(' · ')}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* C2 */}
        <Card title="Cohort curves by production year" subtitle="Cumulative claims per 1,000 vehicles vs months in service" info="Each line is a production year. Lines that climb faster indicate worse build quality at the same age. Toggle lines via the legend.">
          <DataState state={cohort}>
            {(rows) => {
              const { years, data } = yearCurves(rows);
              return (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="mis" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} label={{ value: 'months in service', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} labelFormatter={(l) => `${l}+ months in service`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((y, i) => (
                        <Line key={y} dataKey={y} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </DataState>
        </Card>

        {/* C3 */}
        <Card title="Production quarter × subsystem" subtitle="Claims by build period and subsystem (lifetime)" info="Which subsystem drives a bad cohort. Click a cell to filter by that subsystem.">
          <DataState state={prodSubsystem} height="h-72">
            {(rows) => {
              const map = {};
              rows.forEach((r) => { map[`${r.y_key}|${r.x_key}`] = num(r.claims); });
              const ys = [...new Set(rows.map((r) => r.y_key))].filter(Boolean).sort();
              const xs = [...new Set(rows.map((r) => r.x_key))].filter(Boolean).sort();
              return (
                <div className="max-h-72 overflow-y-auto">
                  <Heatmap rows={ys} cols={xs} rowLabel="Production qtr" getValue={(r, c) => map[`${r}|${c}`] ?? null} format={(v) => formatNumber(v)} onCellClick={(r, c) => actions.addChip('subsystem', c)} />
                </div>
              );
            }}
          </DataState>
        </Card>
      </div>
    </div>
  );
}
