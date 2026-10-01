import React, { useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from 'recharts';
import { fetchAuditSummary, fetchAuditPage, fetchRoPoints, fetchAllPages } from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { Card, DataState, Segmented, Heatmap, InfoTooltip } from '../../../components/analytics/ui';
import { formatINR, formatNumber, formatPct } from '../../../lib/format';
import { RULES, toCsv, downloadCsv } from '../lib';
import { CsvButton, Pager, RulePills, Table } from './common';

// Design: docs/modules/dealer-supplier-accountability/design.md §8. Read-only queue (no decision capture).

const PAGE = 50;
const SORTS = [{ value: 'at_stake', label: '₹ at stake' }, { value: 'amount', label: 'Amount' }, { value: 'risk', label: 'AI risk' }, { value: 'date', label: 'Date' }];

export default function AuditTab({ filters, fkey, local, lookups, actions }) {
  const summary = useAsync(() => fetchAuditSummary(filters), fkey);
  return (
    <div className="space-y-4">
      <RuleCards state={summary} local={local} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RuleDealerMatrix state={summary} lookups={lookups} actions={actions} local={local} />
        <BilledVsSrt filters={filters} fkey={fkey} actions={actions} />
      </div>
      <Queue filters={filters} local={local} actions={actions} />
    </div>
  );
}

// A1
function RuleCards({ state, local }) {
  const d = state.data;
  const byRule = Object.fromEntries((d?.by_rule || []).map((r) => [r.rule, r]));
  const box = 'bg-white rounded-xl shadow-sm border border-slate-200 p-3 text-left';
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
      <div className={box}>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Flagged claims</p>
        <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{d ? `${formatNumber(d.flagged_claims)}` : '…'}</p>
        <p className="text-[11px] text-slate-400">{d ? `${formatPct(d.flagged_claims / Math.max(1, d.claims), 0)} of ${formatNumber(d.claims)}` : ''}</p>
      </div>
      <div className={box}>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center">At stake<InfoTooltip text="Whole claim when NFF, repeat or out of coverage; otherwise the labor above the SRT maximum × ₹1,500/h." /></p>
        <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{d ? formatINR(d.at_stake_inr) : '…'}</p>
        <p className="text-[11px] text-slate-400">all flagged claims</p>
      </div>
      <div className={box}>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Open at stake</p>
        <p className="text-xl font-bold text-rose-700 tabular-nums mt-1">{d ? formatINR(d.open_at_stake_inr) : '…'}</p>
        <p className="text-[11px] text-slate-400">{d ? `${formatNumber(d.open_flagged)} open claims` : ''}</p>
      </div>
      {Object.entries(RULES).map(([key, r]) => (
        <button key={key} type="button" onClick={() => local.setAuditRule(local.auditRule === key ? null : key)}
          className={`${box} hover:shadow-md ${local.auditRule === key ? 'ring-2 ring-sky-500' : ''} ${key === 'repeat_repair' ? 'hidden xl:block' : ''}`}>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center">{r.label}<InfoTooltip text={r.info} /></p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{d ? formatNumber(byRule[key]?.claims || 0) : '…'}</p>
          <p className="text-[11px] text-slate-400">{d ? `${formatNumber(byRule[key]?.open || 0)} open` : ''}</p>
        </button>
      ))}
    </div>
  );
}

// A2
function RuleDealerMatrix({ state, lookups, actions, local }) {
  return (
    <Card title="Rule × dealer" subtitle="Top 15 dealers by ₹ at stake · flagged claims per rule"
      info="A claim can trip several rules, so a row can sum to more than the dealer's flagged claims. Click a cell to filter the queue to that dealer and rule.">
      <DataState state={state} empty="No flagged claims.">
        {(d) => {
          const cells = Object.fromEntries((d.by_dealer_rule || []).map((c) => [`${c.dealer_name}|${c.rule}`, c.claims]));
          const dealers = [...new Set((d.by_dealer_rule || []).map((c) => c.dealer_name))];
          const ruleLabels = Object.fromEntries(Object.entries(RULES).map(([k, r]) => [r.label, k]));
          return (
            <div className="max-h-[360px] overflow-y-auto">
              <Heatmap rows={dealers} cols={Object.keys(ruleLabels)} rowLabel="Dealer"
                getValue={(r, c) => cells[`${r}|${ruleLabels[c]}`] ?? null} format={(v) => String(v)}
                onCellClick={(r, c) => {
                  const id = lookups?.dealerIdByName[r];
                  if (id) actions.addChip('dealer_id', id, r);
                  local.setAuditRule(ruleLabels[c]);
                }} />
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}

// A3 (reuses the Claims & Repair RO points)
function BilledVsSrt({ filters, fkey, actions }) {
  const pts = useAsync(() => fetchRoPoints(filters, 1500), fkey);
  return (
    <Card title="Billed vs SRT hours" subtitle="Warranty repair orders · red = above the SRT maximum"
      info="Each dot is a repair order on a claim. Dots above the diagonal billed more than the SRT benchmark; red dots exceeded the maximum allowable hours. Click a dot for the claim.">
      <DataState state={pts}>
        {(rows) => {
          const data = rows.map((r) => ({ ...r, x: Number(r.benchmark_labor_hours), y: Number(r.billed_hours) }));
          const max = Math.ceil(Math.max(1, ...data.map((d) => Math.max(d.x, d.y))));
          return (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="x" name="SRT benchmark h" domain={[0, max]} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="number" dataKey="y" name="Billed h" domain={[0, max]} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: '3 3' }} formatter={(v) => `${Number(v).toFixed(1)} h`} />
                  <Scatter data={data} onClick={(d) => d.claim_id && actions.openClaim(d.claim_id)} cursor="pointer">
                    {data.map((d) => <Cell key={d.ro_id} fill={d.is_labor_overrun ? '#e11d48' : '#0284c7'} fillOpacity={0.45} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      </DataState>
    </Card>
  );
}

// A4
const COLS = [
  { key: 'claim_id', label: 'Claim / RO', render: (r) => <span><span className="font-mono text-sky-700">{r.claim_id}</span><span className="block text-[10px] text-slate-400">{r.ro_id}</span></span>, csv: (r) => r.claim_id },
  { key: 'ro_id', label: 'RO', hidden: true },
  { key: 'submission_date', label: 'Date' },
  { key: 'status', label: 'Status' },
  { key: 'vin', label: 'VIN', render: (r) => <span className="font-mono text-[11px]">{r.vin}</span> },
  { key: 'dealer_name', label: 'Dealer' },
  { key: 'part_name', label: 'Part', render: (r) => <span className="max-w-[12rem] inline-block truncate align-bottom" title={r.part_name}>{r.part_name}</span> },
  { key: 'hours', label: 'Billed / bench / max h', align: 'right',
    render: (r) => (r.billed_hours === null ? '—' : `${Number(r.billed_hours).toFixed(1)} / ${Number(r.benchmark_labor_hours).toFixed(1)} / ${Number(r.max_allowable_hours).toFixed(1)}`),
    csv: (r) => `${r.billed_hours}/${r.benchmark_labor_hours}/${r.max_allowable_hours}` },
  { key: 'excess_labor_inr', label: 'Excess labor', align: 'right', render: (r) => (Number(r.excess_labor_inr) ? formatINR(r.excess_labor_inr) : '—') },
  { key: 'claim_amount_inr', label: 'Amount', align: 'right', render: (r) => formatINR(r.claim_amount_inr) },
  { key: 'ai_risk_score', label: 'AI', align: 'right', render: (r) => <span className={Number(r.ai_risk_score) >= 80 ? 'text-rose-600 font-semibold' : ''}>{r.ai_risk_score}</span> },
  { key: 'flags', label: 'Rules', render: (r) => <RulePills flags={r.flags} /> },
  { key: 'at_stake_inr', label: 'At stake', align: 'right', render: (r) => <b>{formatINR(r.at_stake_inr)}</b> },
];

function Queue({ filters, local, actions }) {
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const qFilters = local.openOnly ? { ...filters, status_group: ['Open'] } : filters;
  const opts = { rule: local.auditRule, sort: local.auditSort };
  const pageKey = `${JSON.stringify(qFilters)}|${opts.rule}|${opts.sort}`;
  const [lastKey, setLastKey] = useState(pageKey);
  if (lastKey !== pageKey) {
    setLastKey(pageKey);
    setPage(0);
  }
  const state = useAsync(() => fetchAuditPage(qFilters, { ...opts, limit: PAGE, offset: page * PAGE }), `${pageKey}|${page}`);
  const total = Number(state.data?.[0]?.total_count || 0);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAllPages((p) => fetchAuditPage(qFilters, { ...opts, ...p }), total);
      downloadCsv(toCsv(all, COLS), 'audit-queue');
    } finally {
      setExporting(false);
    }
  };
  return (
    <Card title="Audit queue" subtitle={`${local.auditRule ? RULES[local.auditRule].label : 'Any rule'} · ${local.openOnly ? 'open claims only' : 'all statuses'} · read-only`}
      info="Every claim with at least one audit rule, ranked by money at stake. Open claims can still be challenged before payment. Decisions are not recorded here (needs authentication); export the queue to work it. Click a row for the claim."
      actions={(
        <>
          <Segmented size="xs" value={local.openOnly ? 'open' : 'all'} onChange={(v) => local.setOpenOnly(v === 'open')} options={[{ value: 'open', label: 'Open only' }, { value: 'all', label: 'All' }]} />
          <select value={local.auditRule || ''} onChange={(e) => local.setAuditRule(e.target.value || null)} className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white">
            <option value="">Any rule</option>
            {Object.entries(RULES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
          <select value={local.auditSort} onChange={(e) => local.setAuditSort(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white">
            {SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
          </select>
          <CsvButton onClick={exportCsv} busy={exporting} disabled={!total} />
        </>
      )}>
      <DataState state={state} empty="No flagged claims match the current filters.">
        {(rows) => (
          <>
            <Table rows={rows} cols={COLS.filter((c) => !c.hidden)} rowKey={(r) => r.claim_id} onRow={(r) => actions.openClaim(r.claim_id)} />
            <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
          </>
        )}
      </DataState>
    </Card>
  );
}
