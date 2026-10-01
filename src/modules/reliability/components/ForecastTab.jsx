import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { fetchForecast, fetchCalibration, fetchModelPerformance, fetchAtRiskPage } from '../api';
import { useAsync, tooltipStyle, num } from '../../../lib/analytics';
import { Card, DataState, KpiCard, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatKm, formatNumber, formatPct } from '../../../lib/format';
import { weibullF, RECOMMENDATION_STYLES, WARRANTY_MONTHS, WARRANTY_KM } from '../lib';
import { Pill, ConnectedTag } from './common';

// Design: docs/modules/reliability-early-warning/design.md §8

const RISK_PAGE = 15;

export default function ForecastTab({ filters, fkey, local, actions }) {
  const horizon = local.horizon;
  const forecast = useAsync(() => fetchForecast(filters, horizon), `${fkey}|${horizon}`);
  const calibration = useAsync(() => fetchCalibration(filters, horizon), `${fkey}|${horizon}`);
  const perf = useAsync(() => fetchModelPerformance(filters, 30), fkey);
  const risk = useAsync(() => fetchAtRiskPage(filters, { minBand: local.minBand, beforeExpiryOnly: local.beforeExpiryOnly, limit: 500 }),
    `${fkey}|${local.minBand}|${local.beforeExpiryOnly}`);

  const fRows = forecast.data || [];
  const factor = num(fRows[0]?.calibration_factor);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Horizon</span>
          <Segmented value={horizon} onChange={local.setHorizon} options={[6, 12, 24].map((h) => ({ value: h, label: `${h} mo` }))} />
        </div>
        <span className="text-slate-400">Forecast starts at the as-of date. The date range only sets the window for out-of-coverage claims.</span>
      </div>

      <Kpis forecast={forecast} calibration={calibration} risk={risk} factor={factor} horizon={horizon} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* P1 */}
        <Card className="xl:col-span-2" title="Actual vs forecast in-warranty claims"
          subtitle="Bars: actual claims (inside / outside base coverage) · lines: model and calibrated expectation · band: 95% Poisson"
          info="Model = expected first failures inside each vehicle's warranty window, from the fitted Weibull per part and the fleet's age. The raw model under-predicts because seed claims only start in 2025, so it is calibrated with a factor: actual ÷ model over the last 11 complete months. Both lines are shown so the correction stays visible."
          tag="model">
          <DataState state={forecast}>
            {(rows) => <ForecastChart rows={rows} factor={factor} />}
          </DataState>
        </Card>

        {/* P2 */}
        <Card title="Coverage simulator" subtitle="Effect of a different base warranty on new vehicles"
          info="Δ expected warranty claims per 1,000 new vehicles over their coverage = Σ parts [F(new limit) − F(36 months)] × calibration factor, weighting each part by the share of the fleet it fits. Cost uses each part's average claim cost. The months limit uses the whole-fleet fit; the km limit uses the connected-fleet fit; each is evaluated on its own."
          tag="model">
          <DataState state={calibration}>
            {(rows) => <Simulator rows={rows} factor={factor || 1} />}
          </DataState>
        </Card>
      </div>

      {/* P3 */}
      <Card title="Part calibration" subtitle={`Reliability fit, design gap, warranty exposure and the ${horizon}-month forecast per part`}
        info="β/η: whole-fleet months-in-service fit. B10 observed vs design: km-basis fit (connected fleet). P(fail in warranty) = F(36 months). Expected claims are calibrated (× factor). Out-of-coverage = claims in the date window submitted after the vehicle's warranty end or above its km limit. Recommendation is a rule (thresholds in wty_config). Click a row to open the part on the Reliability tab.">
        <DataState state={calibration} height="h-64">
          {(rows) => <CalibrationTable rows={rows} factor={factor || 1} onSelect={(r) => actions.focusPart(r.part_id, r.part_name, 'reliability')} />}
        </DataState>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* P4 */}
        <Card className="xl:col-span-2" title="Health-model performance" subtitle="fact_vehicle_health predictions vs replacements within 30 days (9 modelled parts)"
          info="Hit rate: share of weekly predictions in a risk band followed by a replacement of that part within 30 days (only predictions whose 30 days are observed). Recall: share of replacements that had a High/Critical flag in the 30 days before. Lead: days from the first flag to the replacement."
          actions={<ConnectedTag />}>
          <DataState state={perf} height="h-64">
            {(d) => <ModelPerformance d={d} />}
          </DataState>
        </Card>

        {/* P5 */}
        <Card className="xl:col-span-3" title="At-risk vehicles" subtitle="Latest health prediction per vehicle and part, with remaining warranty"
          info="From fact_vehicle_health (latest prediction up to the as-of date) and wty_vehicle_coverage. “Fails before expiry” = remaining useful life (days, and km where the odometer is known) is shorter than the remaining warranty."
          actions={(
            <>
              <Segmented size="xs" value={local.minBand} onChange={local.setMinBand} options={['Medium', 'High', 'Critical'].map((v) => ({ value: v, label: `${v}+` }))} />
              <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                <input type="checkbox" className="accent-sky-600" checked={local.beforeExpiryOnly} onChange={(e) => local.setBeforeExpiryOnly(e.target.checked)} />
                Fails before expiry
              </label>
              <ConnectedTag />
            </>
          )}>
          <DataState state={risk} height="h-64" empty="No vehicles at this risk level.">
            {(rows) => <AtRiskTable rows={rows} />}
          </DataState>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Kpis({ forecast, calibration, risk, factor, horizon }) {
  const f = forecast.data || [];
  const c = calibration.data || [];
  const r = risk.data || [];
  const future = f.filter((x) => x.is_forecast);
  const history = f.filter((x) => !x.is_forecast);
  // Parts that fit every powertrain cover the whole (filtered) fleet, so the max is the fleet's in-warranty count
  const inWarranty = c.length ? Math.max(...c.map((x) => num(x.vehicles_in_warranty) || 0)) : null;
  const sum = (rows, k) => rows.reduce((s, x) => s + (num(x[k]) || 0), 0);
  const factorOk = factor !== null && factor >= 0.8 && factor <= 1.25;
  const cards = [
    { label: 'Vehicles in warranty', value: formatNumber(inWarranty), sub: 'base coverage 36 mo / 300k km', info: 'Vehicles (matching the filters) younger than their warranty end at the as-of date.' },
    { label: `Expected claims ${horizon} mo`, value: formatNumber(sum(future, 'calibrated_claims')), sub: `last 12 mo in coverage: ${formatNumber(sum(history, 'actual_in_coverage_claims'))}`,
      info: 'Calibrated expectation of in-warranty claims over the horizon. It falls over time because no vehicles entered service after March 2025, so the fleet is ageing out of coverage.' },
    { label: `Expected cost ${horizon} mo`, value: formatINR(sum(future, 'calibrated_cost_inr')), sub: 'calibrated', info: 'Expected claims × each part\'s average claim cost, × calibration factor.' },
    { label: 'Calibration factor', value: factor === null ? '—' : `×${formatNumber(factor, 2)}`, sub: factorOk ? 'model matches history' : 'raw model under-predicts',
      info: 'Actual in-coverage claims ÷ model expectation over the last 11 complete months. Outside 0.8–1.25 means the raw model should not be used alone.' },
    { label: 'Out-of-coverage claims', value: formatNumber(sum(c, 'out_of_coverage_claims')), sub: `${formatINR(sum(c, 'out_of_coverage_cost_inr'))} · policy check`,
      info: 'Claims in the date window submitted after the vehicle\'s warranty end date or above its km limit. Either goodwill or a policy-enforcement gap; mostly seed claims.' },
    { label: 'At risk, in warranty', value: formatNumber(r.filter((x) => x.warranty_days_left > 0).length), sub: `${formatNumber(r.filter((x) => x.fails_before_expiry).length)} fail before expiry · of ${r.length}`,
      info: 'Connected fleet: vehicle-parts at the selected risk level whose warranty has not expired, and how many are predicted to fail before it does.' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((k) => <KpiCard key={k.label} {...k} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ForecastChart({ rows, factor }) {
  const data = rows.map((r) => {
    const actual = r.actual_claims === null ? null : num(r.actual_claims);
    const inCov = r.actual_in_coverage_claims === null ? null : num(r.actual_in_coverage_claims);
    return {
      ...r,
      label: format(new Date(`${r.period}T00:00:00`), 'MMM yy'),
      inCov,
      outCov: actual === null ? null : actual - inCov,
      model: num(r.expected_claims),
      calibrated: num(r.calibrated_claims),
      band: [num(r.lower_claims) * (factor || 1), num(r.upper_claims) * (factor || 1)],
    };
  });
  const firstForecast = data.find((d) => d.is_forecast);
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={8} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => (Array.isArray(v) ? [`${formatNumber(v[0], 0)} – ${formatNumber(v[1], 0)}`, n] : [formatNumber(v, 1), n])} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {firstForecast && <ReferenceLine x={firstForecast.label} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'forecast →', fontSize: 10, fill: '#64748b', position: 'insideTopLeft' }} />}
          <Area dataKey="band" name="95% band (calibrated)" fill="#e0e7ff" stroke="none" />
          <Bar dataKey="inCov" name="Actual: in coverage" stackId="a" fill="#0284c7" />
          <Bar dataKey="outCov" name="Actual: out of coverage" stackId="a" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
          <Line dataKey="calibrated" name="Calibrated expectation" stroke="#6366f1" strokeWidth={2} dot={false} />
          <Line dataKey="model" name="Raw model" stroke="#6366f1" strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Simulator({ rows, factor }) {
  const [months, setMonths] = useState(WARRANTY_MONTHS);
  const [km, setKm] = useState(WARRANTY_KM);
  const maxFleet = Math.max(1, ...rows.map((r) => num(r.vehicles_in_warranty) || 0));
  const parts = rows.map((r) => {
    const share = (num(r.vehicles_in_warranty) || 0) / maxFleet;  // share of the fleet the part fits
    const cost = num(r.avg_cost_inr) || 0;
    const dMonths = r.fit_ok_mis ? weibullF(months, num(r.beta_mis), num(r.eta_months)) - weibullF(WARRANTY_MONTHS, num(r.beta_mis), num(r.eta_months)) : 0;
    const dKm = r.fit_ok_km ? weibullF(km, num(r.beta_km), num(r.eta_km)) - weibullF(WARRANTY_KM, num(r.beta_km), num(r.eta_km)) : 0;
    return { ...r, dMonths: dMonths * share * factor, dKm: dKm * share * factor, costMonths: dMonths * share * factor * cost, costKm: dKm * share * factor * cost };
  });
  const total = (k) => parts.reduce((s, p) => s + p[k], 0);
  const top = [...parts].sort((a, b) => Math.abs(b.costMonths) - Math.abs(a.costMonths)).slice(0, 5);
  const signed = (v, f) => `${v >= 0 ? '+' : '−'}${f(Math.abs(v))}`;
  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="flex justify-between mb-1"><span className="font-semibold text-slate-700">Warranty months</span><span className="tabular-nums">{months} mo <span className="text-slate-400">(now 36)</span></span></div>
        <input type="range" min={12} max={72} step={6} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-full accent-sky-600" />
        <p className="mt-1 text-slate-600">
          <strong className="tabular-nums">{signed(total('dMonths') * 1000, (v) => formatNumber(v, 1))}</strong> claims per 1,000 vehicles ·{' '}
          <strong className="tabular-nums">{signed(total('costMonths'), formatINR)}</strong> per vehicle
        </p>
      </div>
      <div>
        <div className="flex justify-between mb-1"><span className="font-semibold text-slate-700">Warranty km</span><span className="tabular-nums">{formatKm(km)} <span className="text-slate-400">(now 300k)</span></span></div>
        <input type="range" min={100000} max={500000} step={25000} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full accent-sky-600" />
        <p className="mt-1 text-slate-600">
          <strong className="tabular-nums">{signed(total('dKm') * 1000, (v) => formatNumber(v, 1))}</strong> claims per 1,000 vehicles ·{' '}
          <strong className="tabular-nums">{signed(total('costKm'), formatINR)}</strong> per vehicle <span className="text-slate-400">(connected-fleet fit)</span>
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-500 mb-1">Parts driving the months change</p>
        <table className="w-full text-[11px]">
          <tbody>
            {top.map((p) => (
              <tr key={p.part_id} className="border-b border-slate-50">
                <td className="py-1 text-slate-700">{p.part_name}</td>
                <td className="text-right tabular-nums">{signed(p.dMonths * 1000, (v) => formatNumber(v, 2))} / 1k</td>
                <td className="text-right tabular-nums">{signed(p.costMonths, formatINR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CalibrationTable({ rows, factor, onSelect }) {
  return (
    <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="text-[11px] text-slate-500 border-b border-slate-100">
            <th className="text-left font-semibold py-2 pr-2">Part</th>
            <th className="text-right font-semibold pr-2">Failures</th>
            <th className="text-right font-semibold pr-2">β</th>
            <th className="text-right font-semibold pr-2">η (mo)</th>
            <th className="text-right font-semibold pr-2">B10 observed / design</th>
            <th className="text-right font-semibold pr-2">Gap</th>
            <th className="text-right font-semibold pr-2">P(fail in wty)</th>
            <th className="text-right font-semibold pr-2">Exp. claims</th>
            <th className="text-right font-semibold pr-2">Exp. cost</th>
            <th className="text-right font-semibold pr-2">Out-of-cov.</th>
            <th className="text-left font-semibold">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gap = num(r.b10_gap);
            return (
              <tr key={r.part_id} onClick={() => onSelect(r)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer text-slate-700">
                <td className="py-1.5 pr-2 font-medium">{r.part_name}<span className="block text-[10px] text-slate-400 font-normal">{r.subsystem}</span></td>
                <td className="pr-2 text-right tabular-nums">{r.n_fail_mis}</td>
                <td className={`pr-2 text-right tabular-nums ${num(r.beta_mis) < 1 ? 'text-amber-600 font-semibold' : ''}`}>{formatNumber(r.beta_mis, 2)}</td>
                <td className="pr-2 text-right tabular-nums">{formatNumber(r.eta_months)}</td>
                <td className="pr-2 text-right tabular-nums whitespace-nowrap">{r.fit_ok_km ? formatKm(r.b10_km) : '—'} / {formatKm(r.design_b10_km)}</td>
                <td className={`pr-2 text-right tabular-nums ${gap === null ? '' : gap <= -0.2 ? 'text-rose-600 font-semibold' : gap < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {r.fit_ok_km && gap !== null ? `${gap >= 0 ? '+' : ''}${formatPct(gap, 0)}` : '—'}
                </td>
                <td className="pr-2 text-right tabular-nums">{formatPct(r.p_fail_in_warranty, 2)}</td>
                <td className="pr-2 text-right tabular-nums">{formatNumber((num(r.expected_claims) || 0) * factor, 1)}</td>
                <td className="pr-2 text-right tabular-nums">{formatINR((num(r.expected_cost_inr) || 0) * factor)}</td>
                <td className="pr-2 text-right tabular-nums">{r.out_of_coverage_claims}</td>
                <td><Pill text={r.recommendation} styles={RECOMMENDATION_STYLES} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ModelPerformance({ d }) {
  const bands = (d.bands || []).map((b) => ({ ...b, rate: num(b.hit_rate) }));
  const deciles = (d.deciles || []).map((x) => ({ ...x, label: `D${x.decile}`, predicted: num(x.avg_probability), observed: num(x.observed_rate) }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[11px] text-slate-500">Recall</p><p className="text-lg font-bold">{formatPct(d.recall, 0)}</p><p className="text-[10px] text-slate-400">{d.flagged_replacements} of {d.replacements} flagged</p></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[11px] text-slate-500">Median lead</p><p className="text-lg font-bold">{d.median_lead_days ?? '—'} d</p><p className="text-[10px] text-slate-400">flag → replacement</p></div>
        <div className="bg-slate-50 rounded-lg p-2"><p className="text-[11px] text-slate-500">Lead time</p>
          <p className="text-[11px] text-slate-700 mt-1">{(d.lead_histogram || []).map((h) => `${h.bucket} d: ${h.count}`).join(' · ') || '—'}</p></div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {bands.map((b) => (
            <tr key={b.band}>
              <td className="py-1 w-20 text-slate-700 font-medium">{b.band}</td>
              <td className="py-1">
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-600" style={{ width: `${(b.rate || 0) * 100}%` }} />
                </div>
              </td>
              <td className="py-1 pl-2 w-32 text-right tabular-nums text-slate-600">{formatPct(b.rate, 1)} · {b.hits}/{formatNumber(b.predictions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={deciles} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => formatPct(v, 0)} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} formatter={(v, n) => [formatPct(v, 2), n]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="predicted" name="Predicted probability" fill="#cbd5e1" />
            <Bar dataKey="observed" name="Observed rate" fill="#0284c7" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-400">Calibration by probability decile: matching bars mean the probabilities can be taken at face value.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AtRiskTable({ rows }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(rows.length / RISK_PAGE);
  const shown = rows.slice(page * RISK_PAGE, (page + 1) * RISK_PAGE);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500 border-b border-slate-100">
              <th className="text-left font-semibold py-2 pr-2">VIN</th>
              <th className="text-left font-semibold pr-2">Part</th>
              <th className="text-right font-semibold pr-2">p(fail)</th>
              <th className="text-right font-semibold pr-2">RUL</th>
              <th className="text-right font-semibold pr-2">Warranty left</th>
              <th className="text-right font-semibold pr-2">Prior claims</th>
              <th className="text-left font-semibold">Prescribed action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.vehicle_id}-${r.part_id}`} className="border-b border-slate-50 text-slate-700 align-top">
                <td className="py-1.5 pr-2"><span className="font-mono text-[11px]">{r.vin}</span><span className="block text-[10px] text-slate-400">{r.variant} · {r.customer_type} · {r.vehicle_region}</span></td>
                <td className="pr-2">{r.part_name}<span className="block text-[10px] text-slate-400">{r.risk_band} · {r.top_signal_code || '—'}</span></td>
                <td className="pr-2 text-right tabular-nums font-semibold">{formatPct(r.failure_probability, 0)}</td>
                <td className="pr-2 text-right tabular-nums whitespace-nowrap">{r.rul_days} d · {formatKm(r.rul_km)}</td>
                <td className={`pr-2 text-right tabular-nums whitespace-nowrap ${r.warranty_days_left > 0 ? '' : 'text-slate-400'}`}>
                  {r.warranty_days_left > 0 ? `${r.warranty_days_left} d · ${formatKm(r.warranty_km_left)}` : 'expired'}
                  {r.fails_before_expiry && <span className="block text-[10px] font-semibold text-rose-600">fails before expiry</span>}
                </td>
                <td className="pr-2 text-right tabular-nums">{r.prior_claims}</td>
                <td className="text-[11px] text-slate-600">{r.ai_prescriptive_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-2 text-[11px] text-slate-500">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-0.5 border rounded disabled:opacity-40">Prev</button>
          <span>{page + 1} / {pages}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-0.5 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
