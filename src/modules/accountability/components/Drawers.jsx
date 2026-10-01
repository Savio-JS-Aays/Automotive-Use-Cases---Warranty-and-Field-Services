import React from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import {
  fetchDealerScorecard, fetchSupplierScorecard, fetchTimeseries, fetchBreakdown, fetchAuditPage, fetchCasesPage,
  fetchCandidatesPage, fetchSignalDetail, fetchAgreement, fetchCaseDetail,
} from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { DataState } from '../../../components/analytics/ui';
import { DrawerShell, Section, Facts } from '../../../components/analytics/drawer';
import { formatINR, formatPct, formatKm, formatNumber } from '../../../lib/format';
import { DEALER_BAND_STYLES, SUPPLIER_BAND_STYLES, STAGE_STYLES, dealerBand, supplierBand, factorContributions, signed } from '../lib';
import { claimsAnalyticsHref, reliabilityHref } from '../store';
import { DemoTag, Pill, RulePills } from './common';

// Design: docs/modules/dealer-supplier-accountability/design.md §11

const PEER_LABELS = { network: 'Network', tier: 'Same tier', region: 'Same region' };

// ---------------------------------------------------------------------------------------------- Dealer 360
export function DealerDrawer({ dealerId, filters, scoreFilters, peer, config, minClaims, onClose, onOpenClaim }) {
  const card = useAsync(() => fetchDealerScorecard(scoreFilters, peer), `${JSON.stringify(scoreFilters)}|${peer}`);
  const all = card.data || [];
  const row = all.find((d) => d.dealer_id === dealerId);
  const scoped = { ...scoreFilters, dealer_id: [dealerId] };
  const skey = JSON.stringify(scoped);
  const trend = useAsync(() => fetchTimeseries(scoped), `ts|${skey}`);
  const parts = useAsync(() => fetchBreakdown(scoped, 'part', 6), `bp|${skey}`);
  const audit = useAsync(() => fetchAuditPage({ ...filters, dealer_id: [dealerId] }, { limit: 8 }), `au|${JSON.stringify(filters)}|${dealerId}`);
  // peer averages (claims-weighted) for the comparison column
  const peers = row ? all.filter((d) => d.peer_group === row.peer_group) : [];
  const n = peers.reduce((s, d) => s + Number(d.claims), 0);
  const avg = (k) => (n ? peers.reduce((s, d) => s + Number(d[k] ?? 0) * Number(d.claims), 0) / n : null);

  return (
    <DrawerShell title={row?.dealer_name || dealerId}
      subtitle={row ? `${row.dealer_tier} · ${row.dealer_region} · ${row.bay_count} bays · ${row.dealer_status} · peers: ${PEER_LABELS[peer]}` : 'Dealer 360'}
      onClose={onClose}>
      <DataState state={{ ...card, data: card.data && (row || null) }} height="h-40" empty="This dealer has no claims in the scorecard period.">
        {() => (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Pill text={config ? dealerBand(row, config, minClaims) : row.band} styles={DEALER_BAND_STYLES} />
              <span>Risk index <b>{Number(row.risk_index).toFixed(2)}</b></span>
              <span>{row.claims} claims · {formatINR(row.cost_inr)}</span>
              <span>Avoidable <b>{formatINR(row.avoidable_inr)}</b></span>
              <span>{row.flagged_claims} flagged</span>
              {row.dealer_status === 'Suspended' && <span className="text-[10px] font-bold text-rose-600">SUSPENDED</span>}
            </div>

            <Section title="Risk factors vs peers">
              {config && (
                <div className="space-y-1.5">
                  {factorContributions(row, config).map((f) => {
                    const z = f.z ?? 0;
                    return (
                      <div key={f.key} className="grid grid-cols-[7rem_1fr_3.5rem_3.5rem] items-center gap-2 text-xs">
                        <span className="text-slate-600">{f.label}</span>
                        <span className="relative h-3 bg-slate-50 rounded">
                          <span className="absolute top-0 bottom-0 left-1/2 border-l border-slate-300" />
                          <span className="absolute top-0.5 bottom-0.5 rounded" style={{
                            backgroundColor: z > 0 ? f.color : '#cbd5e1',
                            left: z >= 0 ? '50%' : `${50 + (Math.max(z, -4) / 4) * 50}%`,
                            width: `${(Math.min(Math.abs(z), 4) / 4) * 50}%`,
                          }} />
                        </span>
                        <span className="tabular-nums text-right">z {f.z === null ? '—' : signed(z, 2)}</span>
                        <span className="tabular-nums text-right text-slate-500">+{f.value.toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-slate-400">Bars: signed z vs {PEER_LABELS[peer].toLowerCase()} peers (±4). Right column: weighted, shrunk contribution to the index; only positive z counts.</p>
                </div>
              )}
            </Section>

            <Section title="This dealer vs peer average">
              <Facts items={[
                ['Cost index', `${Number(row.cost_index).toFixed(2)} (peers ${avg('cost_index')?.toFixed(2) ?? '—'})`],
                ['Labor index', `${row.labor_index === null ? '—' : Number(row.labor_index).toFixed(2)} (peers ${avg('labor_index')?.toFixed(2) ?? '—'})`],
                ['Overrun rate', `${formatPct(row.overrun_rate)} (${formatPct(avg('overrun_rate'))})`],
                ['NFF rate', `${formatPct(row.nff_rate)} (${formatPct(avg('nff_rate'))})`],
                ['Rejection rate', `${formatPct(row.reject_rate)} (${formatPct(avg('reject_rate'))})`],
                ['AI-high share', `${formatPct(row.high_risk_rate)} (${formatPct(avg('high_risk_rate'))})`],
                ['Out-of-coverage share', `${formatPct(row.ooc_rate)} (${formatPct(avg('ooc_rate'))})`],
                ['Claims per bay', row.claims_per_bay ?? '—'],
              ]} />
            </Section>
          </>
        )}
      </DataState>

      <Section title="Claims per month (scorecard period)">
        <DataState state={trend} height="h-28">
          {(rows) => (
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows.map((r) => ({ month: String(r.period).slice(0, 7), claims: Number(r.claims) }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#64748b' }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="claims" fill="#0284c7" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DataState>
      </Section>

      <Section title="Top parts by cost">
        <DataState state={parts} height="h-20">
          {(rows) => <Facts items={rows.map((r) => [r.key, `${formatINR(r.cost_inr)} · ${r.claims} claims · NFF ${formatPct(r.nff_rate, 0)}`])} />}
        </DataState>
      </Section>

      <Section title="Top audit claims (selected range, ₹ at stake)">
        <DataState state={audit} height="h-20" empty="No flagged claims in the selected range.">
          {(rows) => (
            <ul className="divide-y divide-slate-100 text-xs">
              {rows.map((r) => (
                <li key={r.claim_id}>
                  <button type="button" onClick={() => onOpenClaim(r.claim_id)} className="w-full flex items-center gap-2 py-1.5 hover:bg-slate-50 text-left">
                    <span className="font-mono text-sky-700 w-20">{r.claim_id}</span>
                    <span className="flex-1 truncate text-slate-600">{r.part_name} · {r.status}</span>
                    <RulePills flags={r.flags} />
                    <b className="tabular-nums w-16 text-right">{formatINR(r.at_stake_inr)}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </Section>

      <Link to={claimsAnalyticsHref({ dealer_id: [{ value: dealerId, label: row?.dealer_name || dealerId }] }, 'labor')} className="inline-block text-xs font-semibold text-sky-700 hover:underline">
        Open in Claims &amp; Repair (labor) ↗
      </Link>
    </DrawerShell>
  );
}

// -------------------------------------------------------------------------------------------- Supplier 360
export function SupplierDrawer({ supplierId, filters, scoreFilters, config, minClaims, partIdByName, onClose, onOpenCase, onOpenClaim }) {
  const card = useAsync(() => fetchSupplierScorecard(scoreFilters), `sup|${JSON.stringify(scoreFilters)}`);
  const row = (card.data || []).find((s) => s.supplier_id === supplierId);
  const agreement = useAsync(() => fetchAgreement(supplierId), `ag|${supplierId}`);
  const scoped = { ...scoreFilters, supplier_id: [supplierId] };
  const skey = JSON.stringify(scoped);
  const evidence = useAsync(() => fetchSignalDetail(scoped), `ev|${skey}`);
  const parts = useAsync(() => fetchBreakdown(scoped, 'part', 5), `sp|${skey}`);
  const cases = useAsync(() => fetchCasesPage({ ...filters, supplier_id: [supplierId] }, { limit: 6 }), `cs|${JSON.stringify(filters)}|${supplierId}`);
  const missed = useAsync(() => fetchCandidatesPage({ ...filters, supplier_id: [supplierId] }, { limit: 5 }), `mc|${JSON.stringify(filters)}|${supplierId}`);
  const topPart = parts.data?.[0];
  const a = agreement.data;

  return (
    <DrawerShell title={row?.supplier_name || supplierId}
      subtitle={row ? `Stated risk ${row.stated_risk_tier}${row.observed_tier ? ` → observed ${row.observed_tier}` : ''}${row.tier_mismatch ? ' ⚠' : ''}` : 'Supplier 360'}
      onClose={onClose}>
      <DataState state={{ ...card, data: card.data && (row || null) }} height="h-40" empty="No claims for this supplier in the scorecard period.">
        {() => (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Pill text={config ? supplierBand(row, config, minClaims) : row.band} styles={SUPPLIER_BAND_STYLES} />
              <span>{row.claims} claims · {row.liable_claims} supplier-liable · {formatINR(row.liable_cost_inr)}</span>
            </div>
            <Section title="Quality (same parts, other suppliers)">
              <Facts items={[
                ['Cost index', Number(row.cost_index).toFixed(2)],
                ['Early-failure score', row.early_failure_score === null ? '—' : Number(row.early_failure_score).toFixed(2)],
                ['NFF rate', formatPct(row.nff_rate)],
                ['Median km at failure', formatKm(row.median_km)],
              ]} />
            </Section>
            <Section title="Recovery">
              <Facts items={[
                ['Recovery rate', `${formatPct(row.recovery_rate)} vs agreed ${formatPct(row.agreed_pct, 0)}`],
                ['Compliance gap', row.compliance_gap === null ? '—' : `${signed(Number(row.compliance_gap) * 100, 1)} pt`],
                ['Shortfall', formatINR(row.shortfall_inr)],
                ['Recovered on NFF claims', formatINR(row.nff_recovered_inr)],
                ['Cash recovered (demo)', formatINR(row.cash_recovered_inr)],
                ['Outstanding (demo)', formatINR(row.outstanding_agreed_inr)],
                ['Pending adjudication', formatINR(row.pending_liable_inr)],
                ['Missed-recovery candidates', formatINR(row.missed_recovery_inr)],
              ]} />
            </Section>
          </>
        )}
      </DataState>

      <Section title="Agreement" tag="demo terms">
        <DataState state={agreement} height="h-12" empty="No agreement on file.">
          {() => (
            <Facts items={[
              ['Reference', a.agreement_ref], ['Recovery %', formatPct(a.recovery_pct, 0)], ['Annual cap', formatINR(a.annual_cap_inr)],
              ['Supplier window', `${a.window_months} months / ${formatKm(a.window_km)}`], ['Payment terms', `${a.payment_terms_days} days`],
              ['NFF recoverable', a.nff_recoverable ? 'Yes' : 'No'],
            ]} />
          )}
        </DataState>
      </Section>

      <Section title="Top parts">
        <DataState state={parts} height="h-16">
          {(rows) => <Facts items={rows.map((r) => [r.key, `${formatINR(r.cost_inr)} · ${r.claims} claims`])} />}
        </DataState>
      </Section>

      <Section title="Failure modes" tag="connected fleet">
        <DataState state={{ ...evidence, data: evidence.data?.failure_modes }} height="h-12" empty="No telematics replacements for this supplier.">
          {(rows) => <Facts items={rows.slice(0, 6).map((r) => [r.key, r.count])} />}
        </DataState>
      </Section>

      <Section title="Recovery cases (selected range)" tag="demo lifecycle">
        <DataState state={cases} height="h-16" empty="No cases in the selected range.">
          {(rows) => (
            <ul className="divide-y divide-slate-100 text-xs">
              {rows.map((c) => (
                <li key={c.case_id}>
                  <button type="button" onClick={() => onOpenCase(c.case_id)} className="w-full flex items-center gap-2 py-1.5 hover:bg-slate-50 text-left">
                    <span className="font-mono text-sky-700">{c.case_id}</span>
                    <Pill text={c.stage} styles={STAGE_STYLES} />
                    <span className="flex-1 text-slate-500 truncate">{c.dispute_reason || ''}</span>
                    <b className="tabular-nums">{formatINR(c.agreed_inr)}</b>
                    {c.is_overdue && <span className="text-[10px] font-bold text-rose-600">OVERDUE</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </Section>

      <Section title="Missed-recovery candidates (selected range)">
        <DataState state={missed} height="h-12" empty="None.">
          {(rows) => (
            <ul className="divide-y divide-slate-100 text-xs">
              {rows.map((r) => (
                <li key={r.claim_id}>
                  <button type="button" onClick={() => onOpenClaim(r.claim_id)} className="w-full flex items-center gap-2 py-1.5 hover:bg-slate-50 text-left">
                    <span className="font-mono text-sky-700 w-20">{r.claim_id}</span>
                    <span className="flex-1 truncate text-slate-600">{r.part_name} · {r.mis_months} mo · {formatKm(r.odometer_km_at_failure)}</span>
                    <b className="tabular-nums">{formatINR(r.claim_amount_inr)}</b>
                  </button>
                </li>
              ))}
              {Number(rows[0]?.total_count) > rows.length && <li className="py-1 text-slate-400">+ {formatNumber(Number(rows[0].total_count) - rows.length)} more on the Recovery tab</li>}
            </ul>
          )}
        </DataState>
      </Section>

      <div className="flex flex-wrap gap-4 text-xs font-semibold">
        {topPart && <Link to={reliabilityHref(partIdByName?.[topPart.key], topPart.key)} className="text-sky-700 hover:underline">Reliability for {topPart.key} ↗</Link>}
        <Link to={claimsAnalyticsHref({ supplier_id: [{ value: supplierId, label: row?.supplier_name || supplierId }] })} className="text-sky-700 hover:underline">Open in Claims &amp; Repair ↗</Link>
      </div>
    </DrawerShell>
  );
}

// ------------------------------------------------------------------------------------------------- Case
export function CaseDrawer({ caseId, onClose, onOpenClaim }) {
  const state = useAsync(() => fetchCaseDetail(caseId), caseId);
  const d = state.data;
  const c = d?.case;
  return (
    <DrawerShell title={caseId} subtitle={c ? `${c.supplier_name} · ${String(c.case_month).slice(0, 7)} chargeback` : 'Recovery case'} onClose={onClose}>
      <DataState state={state} height="h-40" empty="Case not found.">
        {() => (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Pill text={c.stage} styles={STAGE_STYLES} />
              {c.is_overdue && <span className="text-[10px] font-bold text-rose-600">OVERDUE (terms {c.payment_terms_days} d)</span>}
              <DemoTag />
            </div>
            <Section title="Amounts">
              <Facts items={[
                ['Claims', c.claims], ['Claimed', formatINR(c.claimed_inr)],
                ['Agreed', `${formatINR(c.agreed_inr)} (${formatPct(Number(c.agreed_inr) / Number(c.claimed_inr), 0)} vs ${formatPct(c.agreed_pct, 0)} agreed)`],
                ['Cash received', formatINR(c.cash_recovered_inr)],
                ['Dispute', c.disputed ? c.dispute_reason : 'No'],
                ['Days open / to recover', c.days_to_recover !== null ? `${c.days_to_recover} d to recover` : c.days_open !== null ? `${c.days_open} d open` : '—'],
              ]} />
            </Section>
            <Section title={`Timeline (as of ${c.as_of})`}>
              <ol className="space-y-1 text-xs">
                {d.timeline.filter((t) => t.date).map((t) => {
                  const done = t.date <= c.as_of;
                  return (
                    <li key={t.step} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${done ? 'bg-emerald-500' : 'border-2 border-slate-300'}`} />
                      <span className={`w-28 ${done ? 'text-slate-800' : 'text-slate-400'}`}>{t.step}</span>
                      <span className={`tabular-nums ${done ? '' : 'text-slate-400'}`}>{t.date}{done ? '' : ' (scheduled)'}</span>
                    </li>
                  );
                })}
              </ol>
            </Section>
            <Section title="Claims in this case">
              <ul className="divide-y divide-slate-100 text-xs">
                {d.claims.map((cl) => (
                  <li key={cl.claim_id}>
                    <button type="button" onClick={() => onOpenClaim(cl.claim_id)} className="w-full flex items-center gap-2 py-1.5 hover:bg-slate-50 text-left">
                      <span className="font-mono text-sky-700 w-20">{cl.claim_id}</span>
                      <span className="flex-1 truncate text-slate-600">{cl.part_name} · {cl.dealer_name}{cl.nff && <span className="ml-1 text-rose-600 font-semibold">NFF</span>}</span>
                      <span className="tabular-nums">{formatINR(cl.claim_amount_inr)}</span>
                      <span className="tabular-nums text-emerald-700 w-16 text-right">{formatINR(cl.recovered_amount_inr)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </DataState>
    </DrawerShell>
  );
}
