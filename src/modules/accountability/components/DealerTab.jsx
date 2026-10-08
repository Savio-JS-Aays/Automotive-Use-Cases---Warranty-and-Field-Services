import React, { useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from 'recharts';
import { fetchDealerScorecard, fetchMatrix } from '../api';
import { useAsync, tooltipStyle } from '../../../lib/analytics';
import { Card, DataState, Segmented, Heatmap } from '../../../components/analytics/ui';
import { formatINR, formatPct } from '../../../lib/format';
import { FACTORS, dealerBand, factorContributions, funnelLimits, toCsv, downloadCsv, signed } from '../lib';
import { CsvButton, Table } from './common';

// Design: docs/modules/dealer-supplier-accountability/design.md §7

const BAND_COLORS = { High: '#e11d48', Medium: '#f59e0b', Low: '#0284c7', 'Not ranked': '#cbd5e1' };

const FUNNEL_METRICS = {
  nff_rate: 'NFF %',
  overrun_rate: 'Overrun %',
  reject_rate: 'Rejection %',
  high_risk_rate: 'AI-high %',
};

export default function DealerTab({ scoreFilters, local, lookups, actions }) {
  const skey = `${JSON.stringify(scoreFilters)}|${local.peer}`;
  const card = useAsync(() => fetchDealerScorecard(scoreFilters, local.peer), skey);
  const config = lookups?.config;
  const minClaims = local.minClaims ?? config?.minClaims ?? 10;
  const rows = (card.data || []).map((d) => ({ ...d, uiBand: config ? dealerBand(d, config, minClaims) : d.band }));
  const ranked = rows.filter((d) => d.uiBand !== 'Not ranked');
  const maxIdx = Math.max(0, ...ranked.map((d) => Number(d.risk_index)));
  const flagged = ranked.filter((d) => d.uiBand === 'High' || d.uiBand === 'Medium').length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2"><span className="text-slate-500 font-medium">Peer group</span>
          <Segmented value={local.peer} onChange={local.setPeer} options={[{ value: 'network', label: 'Network' }, { value: 'tier', label: 'Same tier' }, { value: 'region', label: 'Same region' }]} />
        </span>
        <span className="flex items-center gap-2"><span className="text-slate-500 font-medium">Min claims to rank</span>
          <Segmented value={minClaims} onChange={local.setMinClaims} options={[5, 10, 20].map((n) => ({ value: n, label: String(n) }))} />
        </span>
        {!card.loading && config && (
          <span className={`ml-auto ${flagged ? 'text-rose-700' : 'text-slate-500'}`}>
            {flagged
              ? `${flagged} of ${ranked.length} ranked dealers score 75 or below (watch or audit).`
              : `No dealer is a statistical outlier in this period: lowest score ${Math.round(100 * (1 - Math.min(maxIdx, 4) / 4))}, watch starts at 75.`}
          </span>
        )}
      </div>

      <Scorecard state={card} rows={rows} config={config} actions={actions} />

      {/* Outlier quadrant, funnel plot and regions & tiers are hidden */}
      <OverrunMatrix filters={scoreFilters} local={local} rows={rows} lookups={lookups} actions={actions} />
    </div>
  );
}

// D1
// Dealer score 0-100 (higher = better) from the Dealer Risk Index: 100 × (1 − index ÷ 4). The index is capped at 4
// (weights sum to 1, each factor z is clamped to 4), so Medium (index ≥ 1) is a score ≤ 75 and High (≥ 2) ≤ 50.
const INDEX_MAX = 4;
const dealerScore = (r) => (r.uiBand === 'Not ranked' ? null : Math.round(100 * (1 - Math.min(Math.max(Number(r.risk_index) || 0, 0), INDEX_MAX) / INDEX_MAX)));
const scoreTone = (s) => (s === null ? '#cbd5e1' : s <= 50 ? '#e11d48' : s <= 75 ? '#f59e0b' : '#10b981');

function ScoreCell({ row, config }) {
  const score = row.score;
  if (score === null) return <span className="text-slate-400">not ranked</span>;
  const parts = config ? factorContributions(row, config).filter((f) => f.value > 0.005) : [];
  const why = parts.length
    ? `Pulled down by: ${parts.sort((a, b) => b.value - a.value).map((f) => f.label.toLowerCase()).join(', ')}`
    : 'No factor is worse than the peer group';
  return (
    <span className="inline-flex items-center gap-2" title={`Score ${score} / 100. ${why}.`}>
      <span className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden inline-block">
        <span className="block h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreTone(score) }} />
      </span>
      <span className="font-semibold tabular-nums w-6 text-right" style={{ color: scoreTone(score) }}>{score}</span>
    </span>
  );
}

function Scorecard({ state, rows: rawRows, config, actions }) {
  const [sort, setSort] = useState({ key: 'score', desc: false });
  const [q, setQ] = useState('');
  const [costMode, setCostMode] = useState('index');
  const [laborMode, setLaborMode] = useState('index');
  const rows = rawRows.map((r) => ({ ...r, score: dealerScore(r) }));
  const shown = rows
    .filter((r) => !q || r.dealer_name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      // unranked dealers always go last
      if ((a.uiBand === 'Not ranked') !== (b.uiBand === 'Not ranked')) return a.uiBand === 'Not ranked' ? 1 : -1;
      const x = Number(a[sort.key] ?? -1e9);
      const y = Number(b[sort.key] ?? -1e9);
      return sort.desc ? y - x : x - y;
    });
  const sortBtn = (key, label) => (
    <button type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))} className={`uppercase ${sort.key === key ? 'text-blue-700' : ''}`}>
      {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </button>
  );
  // Header with a sort button plus a small × / ₹ switch; the sort follows the switch
  const switchHead = (mode, setMode, keys, labels) => {
    const key = mode === 'index' ? keys[0] : keys[1];
    const flip = (m) => {
      setMode(m);
      setSort((s) => (keys.includes(s.key) ? { ...s, key: m === 'index' ? keys[0] : keys[1] } : s));
    };
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        {sortBtn(key, mode === 'index' ? labels[0] : labels[1])}
        <span className="inline-flex rounded border border-slate-200 overflow-hidden normal-case">
          {[['index', '×'], ['inr', '₹']].map(([m, t]) => (
            <button key={m} type="button" onClick={() => flip(m)} title={m === 'index' ? labels[2] : labels[3]}
              className={`px-1.5 py-px text-[10px] font-semibold ${mode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{t}</button>
          ))}
        </span>
      </span>
    );
  };
  const cols = [
    { key: 'dealer_name', label: 'Dealer', render: (r) => (
      <span className="font-medium text-slate-800">{r.dealer_name}{r.dealer_status === 'Suspended' && <span className="ml-1.5 text-[10px] font-bold text-rose-600" title="dim_dealer.status = Suspended">SUSPENDED</span>}</span>
    ) },
    { key: 'dealer_region', label: 'Region' },
    { key: 'claims', label: sortBtn('claims', 'Claims'), align: 'right' },
    { key: 'cost', align: 'right',
      label: switchHead(costMode, setCostMode, ['cost_index', 'cost_inr'], ['Cost ×', 'Cost', 'Cost index: actual ÷ network cost of the same parts (1.00 = average)', 'Total claim cost in ₹']),
      render: (r) => (costMode === 'index' ? Number(r.cost_index).toFixed(2) : formatINR(r.cost_inr)) },
    { key: 'labor', align: 'right',
      label: switchHead(laborMode, setLaborMode, ['labor_index', 'excess_labor_inr'], ['Labor ×', 'Labor', 'Labor index: billed ÷ SRT benchmark hours (1.00 = on benchmark)', 'Excess labor in ₹: hours billed above the SRT maximum × ₹1,500']),
      render: (r) => (laborMode === 'index' ? (r.labor_index === null ? '—' : Number(r.labor_index).toFixed(2)) : formatINR(r.excess_labor_inr)) },
    { key: 'overrun_rate', label: sortBtn('overrun_rate', 'Ovr'), align: 'right', render: (r) => formatPct(r.overrun_rate, 0) },
    { key: 'nff_rate', label: sortBtn('nff_rate', 'NFF'), align: 'right', render: (r) => formatPct(r.nff_rate, 0) },
    { key: 'score', label: sortBtn('score', 'Score'), render: (r) => <ScoreCell row={r} config={config} /> },
  ];
  const exportCsv = () => downloadCsv(toCsv(shown, [
    { key: 'dealer_id', label: 'Dealer ID' }, { key: 'dealer_name', label: 'Dealer' }, { key: 'dealer_tier', label: 'Tier' },
    { key: 'dealer_region', label: 'Region' }, { key: 'dealer_status', label: 'Status' }, { key: 'claims', label: 'Claims' },
    { key: 'cost_inr', label: 'Cost INR' }, { key: 'cost_index', label: 'Cost index' }, { key: 'labor_index', label: 'Labor index' },
    { key: 'excess_labor_inr', label: 'Excess labor INR' }, { key: 'overrun_rate', label: 'Overrun rate' }, { key: 'nff_rate', label: 'NFF rate' },
    { key: 'score', label: 'Score (0-100)' },
  ]), 'dealer-scorecard');
  return (
    <Card title="Dealer scorecard" subtitle="Mix-adjusted cost and labor, quality rates and an overall score (100 = best) · use × / ₹ in the column headers to switch between index and amount"
      info="Cost × = actual cost ÷ network average cost of the same parts; ₹ = total claim cost. Labor × = billed ÷ SRT benchmark hours; ₹ = labor billed above the SRT maximum × ₹1,500/h. Score = 100 × (1 − Dealer Risk Index ÷ 4): the risk index combines cost, labor, NFF, rejection and AI-high rates against the peer group, shrunk for small dealers. 75 or below = watch (Medium), 50 or below = audit (High). Hover a score to see what pulls it down. Ranked over the last 12 months up to the as-of date. Click a row for the Dealer 360."
      actions={(
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dealer…" className="border border-slate-200 rounded-md px-2 py-1 text-xs w-40" />
          <CsvButton onClick={exportCsv} disabled={!rows.length} />
        </>
      )}>
      <DataState state={state}>
        {() => (
          <div className="max-h-[480px] overflow-y-auto">
            <Table rows={shown} cols={cols} rowKey={(r) => r.dealer_id} onRow={(r) => actions.openDealer(r.dealer_id)}
              rowClass={(r) => (r.uiBand === 'Not ranked' ? 'text-slate-400' : '')} />
          </div>
        )}
      </DataState>
    </Card>
  );
}

// D2
function Quadrant({ state, rows, actions }) {
  const pts = rows.filter((r) => r.labor_index !== null).map((r) => ({ ...r, x: Number(r.labor_index), y: Number(r.cost_index), z: Number(r.claims) }));
  return (
    <Card title="Outlier quadrant" subtitle="x = labor index · y = cost index · size = claims · colour = band"
      info="Both indices are 1.0 at the network norm. Right = bills more hours than SRT; top = costs more per job than the same parts elsewhere. Click a bubble for the Dealer 360.">
      <DataState state={state}>
        {() => (
          <div className="h-80 relative">
            <span className="absolute right-3 top-1 text-[10px] text-slate-400">Both</span>
            <span className="absolute left-12 top-1 text-[10px] text-slate-400">Costs more per job</span>
            <span className="absolute right-3 bottom-8 text-[10px] text-slate-400">Bills more hours</span>
            <span className="absolute left-12 bottom-8 text-[10px] text-slate-400">In line</span>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="x" name="Labor index" domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v.toFixed(2)} />
                <YAxis type="number" dataKey="y" name="Cost index" domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => v.toFixed(2)} />
                <ZAxis type="number" dataKey="z" range={[20, 220]} />
                <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" />
                <Tooltip {...tooltipStyle} content={({ payload }) => {
                  const d = payload?.[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow p-2 text-xs">
                      <p className="font-semibold">{d.dealer_name}</p>
                      <p>Labor × {d.x.toFixed(2)} · Cost × {d.y.toFixed(2)} · {d.claims} claims · {d.uiBand}</p>
                    </div>
                  );
                }} />
                <Scatter data={pts} onClick={(p) => actions.openDealer(p.dealer_id)} cursor="pointer">
                  {pts.map((p) => <Cell key={p.dealer_id} fill={BAND_COLORS[p.uiBand]} fillOpacity={0.75} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </DataState>
    </Card>
  );
}

// D3
function FunnelPlot({ state, rows, local, actions }) {
  const metric = local.funnelMetric;
  const pts = rows.filter((r) => r[metric] !== null).map((r) => ({ ...r, n: Number(r.claims), rate: Number(r[metric]) }));
  const total = pts.reduce((s, r) => s + r.n, 0);
  const p = total ? pts.reduce((s, r) => s + r.rate * r.n, 0) / total : 0;
  const maxN = Math.max(1, ...pts.map((r) => r.n));
  const limits = funnelLimits(p, maxN);
  const outside = (z) => pts.filter((r) => Math.abs(r.rate - p) > z * Math.sqrt((p * (1 - p)) / r.n)).length;
  const series = (key) => limits.map((l) => ({ n: l.n, rate: l[key] }));
  return (
    <Card title="Funnel plot" subtitle={`${FUNNEL_METRICS[metric]} vs claims · ${outside(1.96)} outside 95%, ${outside(3.09)} outside 99.8% (≈ ${Math.round(pts.length * 0.05)} expected outside 95% by chance)`}
      info="Each dot is a dealer. Lines are binomial control limits around the network rate: small dealers naturally scatter more, so only points outside the 99.8% funnel are statistically unusual. Rejection % uses claims as the volume here (an approximation; the index uses decided claims)."
      actions={<Segmented size="xs" value={metric} onChange={local.setFunnelMetric} options={Object.entries(FUNNEL_METRICS).map(([value, label]) => ({ value, label }))} />}>
      <DataState state={state}>
        {() => (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="n" name="Claims" domain={[0, maxN]} tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis type="number" dataKey="rate" name={FUNNEL_METRICS[metric]} domain={[0, 'auto']} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: '#64748b' }} />
                <ReferenceLine y={p} stroke="#0284c7" strokeDasharray="4 4" />
                {['hi95', 'lo95'].map((k) => <Scatter key={k} data={series(k)} line={{ stroke: '#f59e0b', strokeWidth: 1 }} shape={() => null} isAnimationActive={false} legendType="none" />)}
                {['hi998', 'lo998'].map((k) => <Scatter key={k} data={series(k)} line={{ stroke: '#e11d48', strokeWidth: 1 }} shape={() => null} isAnimationActive={false} legendType="none" />)}
                <Tooltip {...tooltipStyle} content={({ payload }) => {
                  const d = payload?.[0]?.payload;
                  if (!d?.dealer_name) return null;
                  return <div className="bg-white border border-slate-200 rounded-lg shadow p-2 text-xs"><p className="font-semibold">{d.dealer_name}</p><p>{formatPct(d.rate)} of {d.n} claims</p></div>;
                }} />
                <Scatter data={pts} fill="#0284c7" fillOpacity={0.65} onClick={(d) => actions.openDealer(d.dealer_id)} cursor="pointer" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </DataState>
    </Card>
  );
}

// D4
function RegionFactors({ state, rows, actions }) {
  const regions = [...new Set(rows.map((r) => r.dealer_region))].sort();
  const mean = (list, key) => {
    const v = list.map((r) => r[key]).filter((x) => x !== null && x !== undefined).map(Number);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const tiers = ['Platinum', 'Gold', 'Silver'];
  const ci = rows.map((r) => Number(r.cost_index));
  const lo = Math.min(0.8, ...ci);
  const hi = Math.max(1.2, ...ci);
  return (
    <Card title="Regions and tiers" subtitle="Mean factor z by dealer region (shaded when above peers) · cost index by tier"
      info="Cells are the average signed z of the region's dealers vs their peer group. Only positive (worse than peers) cells are shaded. Click a region to filter it.">
      <DataState state={state}>
        {() => (
          <div className="space-y-4">
            <Heatmap rows={regions} cols={FACTORS.map((f) => f.label)} rowLabel="Region"
              getValue={(r, c) => mean(rows.filter((x) => x.dealer_region === r), FACTORS.find((f) => f.label === c).key)}
              format={(v) => signed(v, 2)} onCellClick={(r) => actions.setRegion(r)} />
            <div className="space-y-2">
              {tiers.map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs">
                  <button type="button" onClick={() => actions.addChip('dealer_tier', t)} className="w-16 text-left font-medium text-slate-600 hover:text-sky-700">{t}</button>
                  <div className="relative flex-1 h-5 bg-slate-50 rounded">
                    <span className="absolute top-0 bottom-0 border-l border-dashed border-slate-400" style={{ left: `${(100 * (1 - lo)) / (hi - lo)}%` }} />
                    {rows.filter((r) => r.dealer_tier === t).map((r) => (
                      <button key={r.dealer_id} type="button" title={`${r.dealer_name}: cost index ${Number(r.cost_index).toFixed(2)}`} onClick={() => actions.openDealer(r.dealer_id)}
                        className="absolute top-1 w-2.5 h-2.5 -ml-1 rounded-full bg-sky-600/60 hover:bg-sky-800"
                        style={{ left: `${(100 * (Number(r.cost_index) - lo)) / (hi - lo)}%` }} />
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-400 text-right">cost index {lo.toFixed(2)} … {hi.toFixed(2)} · dashed = 1.0</p>
            </div>
          </div>
        )}
      </DataState>
    </Card>
  );
}

// D5 (reuses the Claims & Repair matrix)
const MEASURES = { overrun_rate: 'Overrun %', nff_rate: 'NFF %', claims: 'Claims', cost_inr: 'Cost' };

function OverrunMatrix({ filters, local, rows, lookups, actions }) {
  const m = useAsync(() => fetchMatrix(filters, 'dealer', 'subsystem'), `mx|${JSON.stringify(filters)}`);
  const measure = local.heatMeasure;
  const top = [...rows].sort((a, b) => Number(b.claims) - Number(a.claims)).slice(0, 20).map((r) => r.dealer_name);
  const cells = Object.fromEntries((m.data || []).map((c) => [`${c.x_key}|${c.y_key}`, c]));
  const subsystems = [...new Set((m.data || []).map((c) => c.y_key))].sort();
  const fmt = measure === 'cost_inr' ? formatINR : measure === 'claims' ? (v) => String(v) : (v) => formatPct(v, 0);
  return (
    <Card title="Dealer × subsystem" subtitle="Top 20 dealers by claims"
      info="A whole column high means the SRT for that subsystem is probably unrealistic; a single row high points to the dealer. Click a cell to add both chips."
      actions={<Segmented size="xs" value={measure} onChange={local.setHeatMeasure} options={Object.entries(MEASURES).map(([value, label]) => ({ value, label }))} />}>
      <DataState state={m}>
        {() => (
          <div className="max-h-[420px] overflow-y-auto">
            <Heatmap rows={top} cols={subsystems} rowLabel="Dealer"
              getValue={(r, c) => { const v = cells[`${r}|${c}`]?.[measure]; return v === undefined || v === null ? null : Number(v); }}
              format={fmt}
              onCellClick={(r, c) => {
                const id = lookups?.dealerIdByName[r];
                if (id) actions.addChip('dealer_id', id, r);
                actions.addChip('subsystem', c);
              }} />
          </div>
        )}
      </DataState>
    </Card>
  );
}
