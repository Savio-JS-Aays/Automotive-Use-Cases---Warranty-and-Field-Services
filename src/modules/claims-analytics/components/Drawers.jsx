import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { fetchClaimDetail, fetchKpis, fetchTimeseries, fetchBreakdown } from '../api';
import { useAsync, tooltipStyle, num } from '../lib';
import { DataState } from '../../../components/analytics/ui';
import { DrawerShell, Section, Facts } from '../../../components/analytics/drawer';
import { formatINR, formatINRAxis, formatKm, formatNumber, formatPct } from '../../../lib/format';

// ---------------------------------------------------------------------------
// Claim drawer
// ---------------------------------------------------------------------------
export function ClaimDrawer({ claimId, onClose, onOpenEntity }) {
  const state = useAsync(() => fetchClaimDetail(claimId), claimId);
  return (
    <DrawerShell title={claimId} subtitle="Claim detail" onClose={onClose}>
      <DataState state={state} height="h-64" empty="Claim not found.">
        {(d) => {
          const c = d.claim;
          const derived = c.amount_basis === 'derived';
          const timeline = [
            ['Production', c.production_date],
            ['In service', c.in_service_date],
            ['Submitted', c.submission_date],
            ['Adjudicated', c.adjudication_date],
          ];
          const billedPct = c.max_allowable_hours ? Math.min(100, (c.billed_hours / (c.max_allowable_hours * 1.5)) * 100) : 0;
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[11px] text-slate-500">Amount {derived && <span className="text-violet-600">(derived)</span>}</p>
                  <p className="text-lg font-bold">{formatINR(c.claim_amount_inr)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[11px] text-slate-500">Status · liability</p>
                  <p className="text-sm font-bold">{c.status}</p>
                  <p className="text-[11px] text-slate-500">{c.liability_type}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[11px] text-slate-500">AI risk</p>
                  <p className={`text-lg font-bold ${c.risk_band === 'High' ? 'text-rose-600' : ''}`}>{c.ai_risk_score} <span className="text-xs font-medium">{c.risk_band}</span></p>
                </div>
              </div>

              <Section title="Vehicle life timeline">
                <div className="flex items-start justify-between relative">
                  <div className="absolute top-2 left-2 right-2 h-0.5 bg-slate-200" />
                  {timeline.map(([label, date]) => (
                    <div key={label} className="relative flex flex-col items-center text-center w-1/4">
                      <span className={`w-4 h-4 rounded-full border-2 ${date ? 'bg-sky-500 border-sky-500' : 'bg-white border-slate-300'}`} />
                      <span className="text-[11px] font-semibold text-slate-700 mt-1">{label}</span>
                      <span className="text-[11px] text-slate-500">{date || 'pending'}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Failed at {formatKm(c.odometer_km_at_failure)} · {c.mis_months} months in service
                  {c.cycle_days !== null && c.cycle_days !== undefined && ` · decided in ${c.cycle_days} days`}
                  {c.is_nff && ' · No fault found'}{c.is_repeat_repair && ' · Repeat repair'}
                </p>
              </Section>

              <Section title="Vehicle">
                <Facts items={[
                  ['VIN', <span key="vin" className="font-mono">{c.vin}</span>], ['Variant', `${c.brand} ${c.variant}`], ['Type', c.vehicle_type],
                  ['Customer type', c.customer_type], ['Vehicle region', c.vehicle_region], ['Connected', c.is_connected ? 'Yes' : 'No'],
                ]} />
                <p className="text-[11px] font-semibold text-slate-500 mt-3 mb-1">Other claims on this vehicle ({d.vehicle_history.length}, all periods)</p>
                {d.vehicle_history.length ? (
                  <table className="w-full text-[11px]">
                    <tbody>
                      {d.vehicle_history.map((h) => (
                        <tr key={h.claim_id} className="border-b border-slate-50">
                          <td className="py-1 font-mono text-sky-700">{h.claim_id}</td><td>{h.submission_date}</td><td>{h.part_name}</td>
                          <td>{h.status}</td><td className="text-right">{formatINR(h.claim_amount_inr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-[11px] text-slate-400">None</p>}
              </Section>

              <Section title="Part & supplier">
                <Facts items={[
                  ['Part', <button key="part" type="button" className="text-sky-700 hover:underline" onClick={() => onOpenEntity('part', c.part_name)}>{c.part_name}</button>],
                  ['Subsystem', c.subsystem], ['Part unit cost', formatINR(c.part_unit_cost_inr)],
                  ['Liable supplier', c.supplier_name], ['Supplier risk tier', c.supplier_risk_tier],
                  ['Recovered', formatINR(c.recovered_amount_inr)], ['Cluster', c.cluster_id || '—'],
                ]} />
              </Section>

              <Section title="Repair order & labor">
                <Facts items={[
                  ['Repair order', c.ro_id], ['Dealer', <button key="dealer" type="button" className="text-sky-700 hover:underline" onClick={() => onOpenEntity('dealer', c.dealer_name)}>{c.dealer_name}</button>],
                  ['Dealer tier / region', `${c.dealer_tier} · ${c.dealer_region}`], ['Visit type', c.visit_type || 'Not recorded'],
                  ['Billed hours', c.billed_hours], ['SRT benchmark / max', `${c.benchmark_labor_hours ?? '—'} / ${c.max_allowable_hours ?? '—'} h`],
                ]} />
                {c.max_allowable_hours && (
                  <div className="mt-2">
                    <div className="relative h-3 bg-slate-100 rounded-full">
                      <div className={`h-full rounded-full ${c.is_labor_overrun ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${billedPct}%` }} />
                      <div className="absolute top-[-3px] h-[18px] w-0.5 bg-slate-700" style={{ left: `${(1 / 1.5) * 100}%` }} title="Max allowable" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{c.is_labor_overrun ? 'Billed above SRT maximum allowable hours' : 'Within SRT maximum allowable hours'}</p>
                  </div>
                )}
                {c.nlp_3c_text && <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 mt-2 italic">“{c.nlp_3c_text}”</p>}
              </Section>

              {(d.part_replacements.length > 0 || d.dtc_event || d.latest_health) && (
                <Section title="Telematics evidence" tag="Connected fleet">
                  {d.part_replacements.map((p) => (
                    <p key={p.replacement_id} className="text-xs text-slate-700">
                      Replacement {p.replacement_id}: <strong>{p.failure_mode}</strong> at {formatKm(p.odometer_km_at_failure)}, {formatNumber(p.engine_hours_at_failure)} engine h,
                      {' '}{p.vehicle_age_days} days old · {p.in_warranty ? 'in warranty' : 'out of warranty'} · predicted: {p.was_predicted ? 'yes' : 'no'}
                    </p>
                  ))}
                  {d.dtc_event && (
                    <p className="text-xs text-slate-700 mt-1">
                      DTC {d.dtc_event.dtc_id} ({d.dtc_event.spn_description} — {d.dtc_event.fmi_description}) · {d.dtc_event.severity_class} · lamp {d.dtc_event.lamp_status}
                      {d.dtc_event.caused_derate && ' · caused derate'}
                    </p>
                  )}
                  {d.latest_health && (
                    <p className="text-xs text-slate-700 mt-1">
                      Last health prediction before the claim: failure probability {formatPct(d.latest_health.failure_probability)} · RUL {formatNumber(d.latest_health.rul_km)} km · {d.latest_health.risk_band}
                    </p>
                  )}
                </Section>
              )}
            </>
          );
        }}
      </DataState>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Dealer / part drawer: same RPCs, with the entity id added to the page filters
// ---------------------------------------------------------------------------
export function EntityDrawer({ entity, filters, networkKpis, onClose, onApplyFilter }) {
  const { type, id, name } = entity;
  const scoped = { ...filters, [type === 'dealer' ? 'dealer_id' : 'part_id']: [id] };
  const key = JSON.stringify(scoped);
  const kpis = useAsync(() => fetchKpis(scoped), key);
  const series = useAsync(() => fetchTimeseries(scoped, 'month'), key);
  const top = useAsync(() => fetchBreakdown(scoped, type === 'dealer' ? 'part' : 'dealer', 8), key);
  const mis = useAsync(() => fetchBreakdown(scoped, 'mis_bucket', 10), key);

  const compare = [
    ['Claims', 'claims', (v) => formatNumber(v)],
    ['Avg cost', 'avg_cost_inr', (v) => formatINR(v)],
    ['NFF rate', 'nff_rate', (v) => formatPct(v)],
    ['Rejection rate', 'rejection_rate', (v) => formatPct(v)],
    ['Labor overrun', 'labor_overrun_rate', (v) => formatPct(v)],
    ['Excess labor', 'excess_labor_cost_inr', (v) => formatINR(v)],
    ['Avg cycle', 'avg_cycle_days', (v) => (v === null || v === undefined ? '—' : `${v} d`)],
  ];

  return (
    <DrawerShell title={name} subtitle={type === 'dealer' ? 'Dealer drill-down (current filters)' : 'Part drill-down (current filters)'} onClose={onClose}>
      <Section title="vs network (same filters)">
        <DataState state={kpis} height="h-32">
          {(k) => (
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500"><th className="text-left font-semibold py-1" /><th className="text-right font-semibold">{type === 'dealer' ? 'Dealer' : 'Part'}</th><th className="text-right font-semibold">Network</th></tr></thead>
              <tbody>
                {compare.map(([label, field, fmt]) => (
                  <tr key={field} className="border-b border-slate-50">
                    <td className="py-1 text-slate-600">{label}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{fmt(k.current?.[field])}</td>
                    <td className="py-1 text-right text-slate-500 tabular-nums">{fmt(networkKpis?.[field])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataState>
      </Section>

      <Section title="Monthly trend">
        <DataState state={series} height="h-40">
          {(rows) => (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows.map((r) => ({ ...r, cost: num(r.cost_inr), label: String(r.period).slice(0, 7) }))} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis yAxisId="c" tickFormatter={formatINRAxis} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
                  <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={24} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => (n === 'Cost' ? formatINR(v) : v)} />
                  <Bar yAxisId="c" dataKey="cost" name="Cost" fill="#bae6fd" />
                  <Line yAxisId="n" dataKey="claims" name="Claims" stroke="#0284c7" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </DataState>
      </Section>

      <Section title={type === 'dealer' ? 'Top parts' : 'Top dealers'}>
        <DataState state={top} height="h-24">
          {(rows) => (
            <table className="w-full text-xs">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-50">
                    <td className="py-1 text-slate-700">{r.key}</td>
                    <td className="py-1 text-right tabular-nums">{r.claims} claims</td>
                    <td className="py-1 text-right tabular-nums">{formatINR(r.cost_inr)}</td>
                    <td className="py-1 text-right tabular-nums text-slate-500">overrun {formatPct(r.overrun_rate, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataState>
      </Section>

      <Section title="Age at failure (months in service)">
        <DataState state={mis} height="h-16">
          {(rows) => (
            <div className="flex gap-2 flex-wrap">
              {[...rows].sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true })).map((r) => (
                <span key={r.key} className="text-xs bg-slate-100 rounded px-2 py-1">{r.key}: <strong>{r.claims}</strong></span>
              ))}
            </div>
          )}
        </DataState>
      </Section>

      <button type="button" onClick={onApplyFilter} className="w-full text-xs font-semibold text-sky-700 border border-sky-200 rounded-lg py-2 hover:bg-sky-50">
        Filter the page to this {type} and show its claims →
      </button>
    </DrawerShell>
  );
}
