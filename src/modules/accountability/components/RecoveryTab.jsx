import React, { useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { fetchRecoverySummary, fetchCandidatesPage, fetchCasesPage, fetchAllPages } from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { Card, DataState, KpiCard } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatKm, formatNumber, formatPct } from '../../../lib/format';
import { STAGE_STYLES, toCsv, downloadCsv, signed } from '../lib';
import { CsvButton, DemoTag, FlowBars, Pager, Pill, Table } from './common';

// Design: docs/modules/dealer-supplier-accountability/design.md §10. Case dates and agreement terms are a
// deterministic demo seed (migration 014); every amount is a real claim sum.

const STAGE_TONES = {
  'Awaiting adjudication': '#94a3b8', Identified: '#0ea5e9', Notified: '#6366f1', Disputed: '#f43f5e',
  Agreed: '#a855f7', Invoiced: '#f59e0b', Recovered: '#10b981',
};

export default function RecoveryTab({ filters, fkey, local, actions }) {
  const sum = useAsync(() => fetchRecoverySummary(filters), fkey);
  const d = sum.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard label="Recovery rate" value={d ? formatPct(Number(d.waterfall.agreed_inr) / Math.max(1, Number(d.waterfall.paid_inr))) : '…'}
          sub="agreed ÷ supplier-liable paid" info="Recovered ÷ supplier-liable paid cost (C&R K15)." />
        <KpiCard label="Agreed recovery" value={d ? formatINR(d.waterfall.agreed_inr) : '…'} sub={d ? `NFF ${formatINR(d.waterfall.nff_agreed_inr)}` : ''}
          info="Σ recovered_amount_inr on supplier-liable paid claims. NFF parts are not recoverable under the agreement, so recovery on NFF claims is a dispute risk." />
        <KpiCard label="Shortfall" value={d ? formatINR(d.waterfall.shortfall_inr) : '…'} sub="paid − agreed" />
        <KpiCard label="Cash recovered" value={d ? formatINR(d.waterfall.cash_recovered_inr) : '…'} sub="demo lifecycle" info="Agreed amounts in cases at stage Recovered at the as-of date (2026-09-24)." />
        <KpiCard label="Outstanding" value={d ? formatINR(d.waterfall.outstanding_inr) : '…'} sub="agreed, not yet paid · demo" />
        <KpiCard label="Dispute rate" value={d ? formatPct(d.dispute_rate, 0) : '…'} sub="cases · demo"
          info="Share of cases (excluding future-dated) where agreed ÷ claimed fell more than 5 pts below the agreed recovery %." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Recovery waterfall" subtitle="Supplier-liable claims in the selected range"
          info="Supplier-liable cost splits into rejected, awaiting adjudication and paid. Paid splits into agreed recovery and shortfall; agreed recovery into cash received, outstanding and future-dated (adjudicated after the as-of date).">
          <DataState state={sum}>
            {({ waterfall: w }) => (
              <FlowBars max={Number(w.supplier_liable_inr)} rows={[
                { label: 'Supplier-liable', value: w.supplier_liable_inr, tone: '#6366f1' },
                { label: 'rejected', value: w.rejected_inr, tone: '#cbd5e1', indent: true, onClick: () => actions.addChip('status_group', 'Rejected') },
                { label: 'awaiting adjudication', value: w.pending_inr, tone: '#cbd5e1', indent: true, onClick: () => actions.addChip('status_group', 'Open') },
                { label: 'paid', value: w.paid_inr, tone: '#818cf8', indent: true },
                { label: 'agreed recovery', value: w.agreed_inr, tone: '#10b981', indent: true, sub: `NFF ${formatINR(w.nff_agreed_inr)}` },
                { label: 'shortfall', value: w.shortfall_inr, tone: '#f43f5e', indent: true },
                { label: 'cash received', value: w.cash_recovered_inr, tone: '#059669', indent: true, sub: 'demo lifecycle' },
                { label: 'outstanding', value: w.outstanding_inr, tone: '#f59e0b', indent: true, sub: 'demo lifecycle' },
                { label: 'future-dated', value: w.future_dated_inr, tone: '#e2e8f0', indent: true },
              ]} />
            )}
          </DataState>
        </Card>
        <Card title="Case pipeline" tag="Demo lifecycle" subtitle="Claims awaiting adjudication, then chargeback cases by stage at the as-of date"
          info="A case bundles one supplier's supplier-liable paid claims for one adjudication month. Its stage comes from its dates at the as-of date. Click a stage to filter the cases table.">
          <DataState state={sum}>
            {({ pipeline }) => (
              <FlowBars format={formatINR} rows={(pipeline || []).map((p) => ({
                label: `${p.stage}${p.cases === null ? ` · ${p.claims} claims` : ` · ${p.cases} cases`}`,
                value: p.amount_inr, tone: STAGE_TONES[p.stage],
                onClick: p.cases === null ? () => actions.addChip('status_group', 'Open') : () => local.setCaseStage(local.caseStage === p.stage ? null : p.stage),
              }))} />
            )}
          </DataState>
        </Card>
      </div>

      {/* Outstanding aging is hidden */}
      <Card title="Recovery by adjudication month" subtitle="Supplier-liable paid · agreed · recovery rate">
        <DataState state={{ ...sum, data: sum.data?.by_month }} height="h-56">
          {(rows) => (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows.map((r) => ({ ...r, paid_inr: Number(r.paid_inr), agreed_inr: Number(r.agreed_inr), recovery_rate: Number(r.recovery_rate) }))}
                  margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="inr" tickFormatter={formatINRAxis} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => (n === 'Recovery rate' ? formatPct(v) : formatINR(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="inr" dataKey="paid_inr" name="Paid" fill="#c7d2fe" />
                  <Bar yAxisId="inr" dataKey="agreed_inr" name="Agreed" fill="#10b981" />
                  <Line yAxisId="pct" dataKey="recovery_rate" name="Recovery rate" stroke="#334155" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </DataState>
      </Card>

      {/* Supplier compliance and disputes & time to recover are hidden */}

      <Candidates filters={filters} fkey={fkey} actions={actions} />
      <Cases filters={filters} fkey={fkey} local={local} actions={actions} />
    </div>
  );
}

// R5
function Compliance({ state, actions }) {
  return (
    <Card className="xl:col-span-2" title="Supplier compliance" tag="Demo terms" subtitle="Recovery rate (●) vs agreed % (○) · 12-month cap use"
      info="Agreed % and the annual cap come from wty_supplier_agreement (demo terms by stated risk tier). Cap use = agreed recovery on claims adjudicated in the 12 months to the as-of date ÷ the annual cap.">
      <DataState state={{ ...state, data: state.data?.by_supplier }}>
        {(rows) => (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {rows.map((r) => {
              const rate = Number(r.recovery_rate);
              const agreed = Number(r.agreed_pct);
              const pos = (v) => `${Math.min(100, Math.max(0, ((v - 0.5) / 0.5) * 100))}%`;  // axis 50% … 100%
              const below = rate < agreed;
              return (
                <button key={r.supplier_id} type="button" onClick={() => actions.openSupplier(r.supplier_id)}
                  className="w-full grid grid-cols-[8rem_1fr_6rem_5rem] items-center gap-3 text-xs hover:bg-slate-50 rounded py-0.5 text-left">
                  <span className="truncate">{r.supplier_name}</span>
                  <span className="relative h-4">
                    <span className="absolute top-2 h-px bg-slate-200 left-0 right-0" />
                    {r.recovery_rate !== null && (
                      <span className={`absolute top-[7px] h-0.5 ${below ? 'bg-rose-300' : 'bg-emerald-300'}`}
                        style={{ left: below ? pos(rate) : pos(agreed), width: `calc(${below ? pos(agreed) : pos(rate)} - ${below ? pos(rate) : pos(agreed)})` }} />
                    )}
                    <span className="absolute top-0.5 w-3 h-3 -ml-1.5 rounded-full border-2 border-slate-500 bg-white" style={{ left: pos(agreed) }} />
                    {r.recovery_rate !== null && <span className={`absolute top-0.5 w-3 h-3 -ml-1.5 rounded-full ${below ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ left: pos(rate) }} />}
                  </span>
                  <span className={`text-right tabular-nums ${below ? 'text-rose-600' : 'text-emerald-600'}`}>{formatPct(rate, 0)} ({signed((rate - agreed) * 100, 0)} pt)</span>
                  <span className="flex items-center gap-1" title={`Cap use ${formatPct(r.cap_utilisation_12m, 0)} of ${formatINR(r.annual_cap_inr)}`}>
                    <span className="flex-1 h-1.5 bg-slate-100 rounded"><span className={`block h-1.5 rounded ${Number(r.cap_utilisation_12m) > 1 ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(100, Number(r.cap_utilisation_12m) * 100)}%` }} /></span>
                    <span className="tabular-nums text-slate-500 text-[10px]">{formatPct(r.cap_utilisation_12m, 0)}</span>
                  </span>
                </button>
              );
            })}
            <p className="text-[10px] text-slate-400 text-right pt-1">axis 50% … 100%</p>
          </div>
        )}
      </DataState>
    </Card>
  );
}

// R6
function Disputes({ state }) {
  return (
    <Card title="Disputes and time to recover" tag="Demo lifecycle"
      info="Dispute reasons are derived from the case's claims: any NFF claim, any claim outside the supplier window, any labor overrun, otherwise root cause. Days to recover = notified → paid for recovered cases.">
      <DataState state={state} height="h-48">
        {(d) => (
          <div className="space-y-4">
            <FlowBars format={(v) => `${v} cases`} rows={(d.disputes || []).map((r) => ({ label: r.reason, value: r.cases, tone: '#f43f5e' }))} />
            <div>
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Days to recover (recovered cases)</p>
              <FlowBars format={(v) => `${v}`} rows={(d.days_to_recover || []).map((r) => ({ label: `${r.bucket} days`, value: r.cases, tone: '#10b981' }))} />
            </div>
          </div>
        )}
      </DataState>
    </Card>
  );
}

// R7
const CAND_COLS = [
  { key: 'claim_id', label: 'Claim', render: (r) => <span className="font-mono text-sky-700">{r.claim_id}</span> },
  { key: 'submission_date', label: 'Date' },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'part_name', label: 'Part', render: (r) => <span className="max-w-[14rem] inline-block truncate align-bottom" title={r.part_name}>{r.part_name}</span> },
  { key: 'dealer_name', label: 'Dealer' },
  { key: 'mis_months', label: 'MIS', align: 'right' },
  { key: 'odometer_km_at_failure', label: 'km', align: 'right', render: (r) => formatKm(r.odometer_km_at_failure) },
  { key: 'claim_amount_inr', label: 'Amount', align: 'right', render: (r) => <b>{formatINR(r.claim_amount_inr)}</b> },
  { key: 'reason', label: 'Why a candidate', render: (r) => <span className="text-slate-500 max-w-[22rem] inline-block truncate align-bottom" title={r.reason}>{r.reason}</span> },
];

function Candidates({ filters, fkey, actions }) {
  const [page, setPage] = useState(0);
  const [lastKey, setLastKey] = useState(fkey);
  const [exporting, setExporting] = useState(false);
  if (lastKey !== fkey) {
    setLastKey(fkey);
    setPage(0);
  }
  const PAGE = 15;
  const state = useAsync(() => fetchCandidatesPage(filters, { limit: PAGE, offset: page * PAGE }), `${fkey}|${page}`);
  const total = Number(state.data?.[0]?.total_count || 0);
  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadCsv(toCsv(await fetchAllPages((p) => fetchCandidatesPage(filters, p), total), CAND_COLS), 'missed-recovery-candidates');
    } finally {
      setExporting(false);
    }
  };
  return (
    <Card title="Missed-recovery candidates" subtitle={`OEM-liable, paid, fault found, failed inside the supplier window · ${formatNumber(total)} claims`}
      info="Candidates only: liability reassignment is a business decision. Window = the supplier agreement's months in service and km (24 months / 200,000 km)."
      actions={<CsvButton onClick={exportCsv} busy={exporting} disabled={!total} />}>
      <DataState state={state} height="h-40" empty="No candidates in the current filter.">
        {(rows) => (
          <>
            <Table rows={rows} cols={CAND_COLS} rowKey={(r) => r.claim_id} onRow={(r) => actions.openClaim(r.claim_id)} />
            <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
          </>
        )}
      </DataState>
    </Card>
  );
}

// R8
const CASE_COLS = [
  { key: 'case_id', label: 'Case', render: (r) => <span className="font-mono text-sky-700">{r.case_id}</span> },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'case_month', label: 'Month', render: (r) => String(r.case_month).slice(0, 7) },
  { key: 'stage', label: 'Stage', render: (r) => <Pill text={r.stage} styles={STAGE_STYLES} /> },
  { key: 'claims', label: 'Claims', align: 'right' },
  { key: 'claimed_inr', label: 'Claimed', align: 'right', render: (r) => formatINR(r.claimed_inr) },
  { key: 'agreed_inr', label: 'Agreed', align: 'right', render: (r) => formatINR(r.agreed_inr) },
  { key: 'cash_recovered_inr', label: 'Cash', align: 'right', render: (r) => (Number(r.cash_recovered_inr) ? formatINR(r.cash_recovered_inr) : '—') },
  { key: 'dispute_reason', label: 'Dispute', render: (r) => r.dispute_reason || '—' },
  { key: 'days_open', label: 'Open', align: 'right', render: (r) => (r.days_open === null ? '—' : `${r.days_open} d`) },
  { key: 'is_overdue', label: '', render: (r) => (r.is_overdue ? <span className="text-[10px] font-bold text-rose-600" title="Invoiced and past the payment terms">OVERDUE</span> : '') },
];

function Cases({ filters, fkey, local, actions }) {
  const [page, setPage] = useState(0);
  const pageKey = `${fkey}|${local.caseStage}`;
  const [lastKey, setLastKey] = useState(pageKey);
  const [exporting, setExporting] = useState(false);
  if (lastKey !== pageKey) {
    setLastKey(pageKey);
    setPage(0);
  }
  const PAGE = 15;
  const state = useAsync(() => fetchCasesPage(filters, { stage: local.caseStage, limit: PAGE, offset: page * PAGE }), `${pageKey}|${page}`);
  const total = Number(state.data?.[0]?.total_count || 0);
  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadCsv(toCsv(await fetchAllPages((p) => fetchCasesPage(filters, { stage: local.caseStage, ...p }), total), CASE_COLS), 'recovery-cases');
    } finally {
      setExporting(false);
    }
  };
  return (
    <Card title={<span className="flex items-center gap-2">Recovery cases <DemoTag /></span>}
      subtitle={`${local.caseStage ? `Stage: ${local.caseStage}` : 'All stages'} · amounts summed over the claims in the current filter · overdue first`}
      actions={(
        <>
          {local.caseStage && <button type="button" onClick={() => local.setCaseStage(null)} className="text-xs text-slate-500 hover:text-rose-600">Clear stage</button>}
          <CsvButton onClick={exportCsv} busy={exporting} disabled={!total} />
        </>
      )}>
      <DataState state={state} height="h-40" empty="No cases in the current filter.">
        {(rows) => (
          <>
            <Table rows={rows} cols={CASE_COLS} rowKey={(r) => r.case_id} onRow={(r) => actions.openCase(r.case_id)} />
            <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
          </>
        )}
      </DataState>
    </Card>
  );
}
