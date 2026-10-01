import React from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { fetchSignalDetail, fetchClaimsPage, signalScope } from '../api';
import { useAsync, tooltipStyle, num } from '../../../lib/analytics';
import { DataState } from '../../../components/analytics/ui';
import { DrawerShell, Section, Facts } from '../../../components/analytics/drawer';
import { formatINR, formatKm, formatNumber, formatPct } from '../../../lib/format';
import { STATUS_STYLES, ACTION_STYLES } from '../lib';
import { Pill } from './common';
import { claimsAnalyticsHref } from '../store';

const KM_ORDER = ['0-50k', '50-100k', '100-200k', '200-300k', '300k+'];
const MIS_ORDER = ['pre-service', '0-12', '13-24', '25-36', '37-48', '48+'];
const ordered = (rows, order) => [...rows].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

// target: { kind: 'signal', signal } | { kind: 'cluster', clusterId, cluster }
export default function SignalDrawer({ target, filters, onClose, onOpenClaim, onFocusPart, onOpenInClaims }) {
  const scope = target.kind === 'signal' ? signalScope(target.signal) : { cluster_id: [target.clusterId] };
  const scoped = { ...filters, ...scope };
  const key = JSON.stringify(scoped);
  const detail = useAsync(() => fetchSignalDetail(scoped), key);
  const claims = useAsync(() => fetchClaimsPage(scoped, 15), key);

  const s = target.signal;
  const title = target.kind === 'signal' ? `${s.part_name} × ${s.grp}` : `${target.clusterId} · ${target.cluster?.cluster_name || ''}`;
  const subtitle = target.kind === 'signal'
    ? 'Signal evidence (selected window)'
    : `Failure cluster · ${target.cluster?.source === 'seed_ml_label' ? 'ML label (seed data)' : 'telematics label'} · status ${target.cluster?.status || '—'}`;

  return (
    <DrawerShell title={title} subtitle={subtitle} onClose={onClose}>
      {target.kind === 'signal' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Pill text={s.status} styles={STATUS_STYLES} />
          <span className="text-slate-600">{s.claims} claims vs {formatNumber(s.expected, 1)} expected · z {formatNumber(s.z, 1)} · rate ×{formatNumber(s.rate_ratio, 1)}</span>
          {s.suggested_action && (
            <span className={`font-semibold ${ACTION_STYLES[s.suggested_action] || ''}`} title="Rule-based: thresholds in wty_config">
              Suggested: {s.suggested_action} <span className="font-normal text-slate-400">(rule)</span>
            </span>
          )}
        </div>
      )}

      <DataState state={detail} height="h-64" empty="No claims for this selection in the window.">
        {(d) => {
          const h = d.header || {};
          const prod = (d.by_production_month || []).map((r) => ({ ...r, per_1000_built: num(r.per_1000_built) }));
          return (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Claims · vehicles" value={`${formatNumber(h.claims)} · ${formatNumber(h.vehicles)}`} />
                <Stat label="Cost" value={formatINR(h.cost_inr)} />
                <Stat label="Reported" value={`${h.first_date || '—'} → ${h.last_date || '—'}`} small />
              </div>

              <Section title="Supplier & recovery">
                <Facts items={[
                  ['Supplier-liable share', formatPct(h.supplier_share)],
                  ['Recovery rate (paid supplier claims)', formatPct(h.recovery_rate)],
                  ['Unrecovered', formatINR(h.unrecovered_inr)],
                  ['NFF rate', formatPct(h.nff_rate)],
                ]} />
                <table className="w-full text-[11px] mt-2">
                  <tbody>
                    {(d.by_supplier || []).map((r) => (
                      <tr key={r.supplier_id} className="border-b border-slate-50">
                        <td className="py-1 text-slate-700">{r.key} <span className="text-slate-400">({r.risk_tier} risk)</span></td>
                        <td className="text-right tabular-nums">{r.claims} claims</td>
                        <td className="text-right tabular-nums">{formatINR(r.cost_inr)}</td>
                        <td className="text-right tabular-nums text-emerald-700">rec {formatINR(r.recovered_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="Containment: claims per 1,000 built, by production month">
                {prod.length ? (
                  <>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={prod} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={8} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                          <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${formatNumber(v, 1)} per 1,000 (${p.payload.claims} of ${p.payload.built} built)`, 'Rate']} />
                          <Bar dataKey="per_1000_built" fill="#0284c7" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Production month stands in for a batch (the schema has no batch id). A narrow cluster of months points to a batch problem; a spread points to design or usage.
                    </p>
                  </>
                ) : <p className="text-[11px] text-slate-400">No data.</p>}
              </Section>

              <Section title="Life at failure">
                <Buckets label="km" rows={ordered(d.by_km_bucket || [], KM_ORDER)} />
                <Buckets label="Months in service" rows={ordered(d.by_mis_bucket || [], MIS_ORDER)} />
                {h.design_b10_km && <p className="text-[11px] text-slate-500 mt-1">Design B10 life: {formatKm(h.design_b10_km)}</p>}
              </Section>

              <Section title="Where" >
                <Facts items={[
                  ...(d.by_variant || []).slice(0, 3).map((r) => [`Variant ${r.key}`, `${r.claims} claims · ${formatINR(r.cost_inr)}`]),
                  ...(d.by_region || []).slice(0, 3).map((r) => [`Region ${r.key}`, `${r.claims} claims`]),
                ]} />
              </Section>

              {(d.failure_modes?.length > 0 || d.dtcs?.length > 0 || d.precursors?.length > 0) && (
                <Section title="Telematics evidence" tag="Connected fleet">
                  {d.failure_modes?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-slate-500 mb-1">Failure modes (replaced parts)</p>
                      {d.failure_modes.map((m) => <p key={m.key} className="text-xs text-slate-700">{m.key} <span className="text-slate-400">× {m.count}</span></p>)}
                    </div>
                  )}
                  {d.dtcs?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-slate-500 mb-1">Fault codes before the claim</p>
                      {d.dtcs.map((x) => (
                        <p key={x.dtc_id} className="text-xs text-slate-700">
                          <span className="font-mono">{x.dtc_id}</span> {x.description} · {x.severity} · {x.events} events
                          {x.derates > 0 && ` · ${x.derates} derates`} · median lead {formatNumber(x.median_lead_days, 1)} d
                        </p>
                      ))}
                    </div>
                  )}
                  {d.precursors?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 mb-1">Telemetry before failure (mean |z|, 30–21 days → 7–1 days)</p>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {d.precursors.map((p) => (
                            <tr key={p.signal_code} className="border-b border-slate-50">
                              <td className="py-1 text-slate-700">{p.signal_name || p.signal_code}</td>
                              <td className="text-right tabular-nums">{formatNumber(p.early_z, 2)} → {formatNumber(p.late_z, 2)}</td>
                              <td className={`text-right tabular-nums font-semibold ${num(p.uplift) > 0.5 ? 'text-rose-600' : 'text-slate-500'}`}>
                                {num(p.uplift) >= 0 ? '+' : ''}{formatNumber(p.uplift, 2)}
                              </td>
                              <td className="text-right tabular-nums text-slate-500">{formatPct(p.share_anomalous, 0)} anomalous</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              )}

              {(d.text_samples?.length > 0 || d.seed_text_templated) && (
                <Section title="Technician notes (3C)">
                  {(d.text_samples || []).map((t) => <p key={t} className="text-xs text-slate-600 bg-slate-50 rounded p-2 mb-1.5 italic">“{t}”</p>)}
                  {d.seed_text_templated && <p className="text-[11px] text-slate-400">Seed claims share one templated 3C text and are not shown.</p>}
                </Section>
              )}
            </>
          );
        }}
      </DataState>

      <Section title="Latest claims">
        <DataState state={claims} height="h-20" empty="No claims.">
          {(rows) => (
            <table className="w-full text-[11px]">
              <tbody>
                {rows.map((c) => (
                  <tr key={c.claim_id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => onOpenClaim(c.claim_id)}>
                    <td className="py-1 font-mono text-sky-700">{c.claim_id}</td>
                    <td>{c.submission_date}</td>
                    <td>{c.variant}</td>
                    <td>{c.status}</td>
                    <td className="text-right tabular-nums">{formatINR(c.claim_amount_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataState>
      </Section>

      <div className="grid grid-cols-2 gap-2">
        {target.kind === 'signal' && (
          <button type="button" onClick={() => onFocusPart(s.part_id, s.part_name)} className="text-xs font-semibold text-sky-700 border border-sky-200 rounded-lg py-2 hover:bg-sky-50">
            Reliability for this part →
          </button>
        )}
        <Link to={claimsAnalyticsHref(target.kind === 'signal'
          ? { part_id: [{ value: s.part_id, label: s.part_name }] }
          : { cluster_id: [{ value: target.clusterId, label: target.clusterId }] })}
          onClick={onOpenInClaims}
          className="text-center text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg py-2 hover:bg-slate-50">
          Open in Claims &amp; Repair ↗
        </Link>
      </div>
    </DrawerShell>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`${small ? 'text-xs' : 'text-lg'} font-bold text-slate-900`}>{value}</p>
    </div>
  );
}

function Buckets({ label, rows }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.claims)));
  return (
    <div className="mb-2">
      <p className="text-[11px] font-semibold text-slate-500 mb-1">{label}</p>
      <div className="flex gap-1.5 items-end h-14">
        {rows.map((r) => (
          <div key={r.key} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[10px] text-slate-600 tabular-nums">{r.claims}</span>
            <div className="w-full bg-sky-500 rounded-t" style={{ height: `${(Number(r.claims) / max) * 70}%` }} />
            <span className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">{r.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
