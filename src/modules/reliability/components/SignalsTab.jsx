import React, { useState } from 'react';
import { Loader2, PanelRightOpen } from 'lucide-react';
import {
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, Cell,
} from 'recharts';
import { format, startOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { fetchKpis, fetchSignals, fetchSignalSeries, fetchClusterMatrix, signalScope } from '../api';
import { useAsync, tooltipStyle, num } from '../../../lib/analytics';
import { Card, DataState, KpiCard, Segmented, Heatmap } from '../../../components/analytics/ui';
import { formatINR, formatINRAxis, formatNumber, formatPct } from '../../../lib/format';
import { STATUS_STYLES, ACTION_STYLES, SUBSYSTEM_COLORS, GROUP_LABELS } from '../lib';
import { Pill } from './common';

// Design: docs/modules/reliability-early-warning/design.md §6

const BOARD_PAGE = 25;

export default function SignalsTab({ filters, fkey, local, actions, lookups }) {
  const kpis = useAsync(() => fetchKpis(filters), fkey);
  const signals = useAsync(() => fetchSignals(filters, local.groupBy), `${fkey}|${local.groupBy}`);

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} />

      {/* E1 */}
      <SignalBoardCard signals={signals} local={local} onOpen={actions.openSignal} />

      {/* E2 Emerging-issue map and E3 control chart are hidden */}

      {/* E4 */}
      <ClusterTimeline filters={filters} lookups={lookups} onOpen={actions.openCluster} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function KpiStrip({ kpis }) {
  if (kpis.loading && !kpis.data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 border-t-[3px] h-[124px] flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
        ))}
      </div>
    );
  }
  if (kpis.error) return <p className="text-xs text-rose-600">KPIs failed to load: {kpis.error.message}</p>;
  const cur = kpis.data?.current || {};
  const prev = kpis.data?.previous || {};
  const cards = [
    { label: 'Active signals', value: formatNumber(cur.active_signals), current: cur.active_signals, previous: prev.active_signals, betterWhen: 'down', deltaMode: 'abs',
      sub: `${formatNumber(cur.new_signals)} new · ${formatNumber(cur.escalating_signals)} escalating`,
      info: 'Part × variant combinations whose claim rate is significantly above baseline (z ≥ 3, ≥ 5 claims).' },
    { label: 'Claims in signals', value: formatNumber(cur.claims_in_signals), current: cur.claims_in_signals, previous: prev.claims_in_signals, betterWhen: 'down',
      sub: `+${formatNumber(cur.excess_claims, 0)} above expected`, info: 'Claims inside flagged combinations, and how many of them exceed the baseline expectation.' },
    { label: 'Cost in signals', value: formatINR(cur.cost_in_signals_inr), current: cur.cost_in_signals_inr, previous: prev.cost_in_signals_inr, betterWhen: 'down',
      sub: 'actual ₹ in window', info: 'Actual claim cost of the flagged combinations in the window. Not extrapolated.' },
    { label: 'Vehicles affected', value: formatNumber(cur.vehicles_in_signals), current: cur.vehicles_in_signals, previous: prev.vehicles_in_signals, betterWhen: 'down',
      sub: 'distinct vehicles', info: 'Distinct vehicles with a claim inside a flagged combination.' },
    { label: 'Projected 90-day excess', value: formatINR(cur.projected_90d_excess_cost_inr), current: cur.projected_90d_excess_cost_inr, previous: prev.projected_90d_excess_cost_inr, betterWhen: 'down',
      sub: 'projection', info: 'Projection: excess claims per day in the window × 90 days × average claim cost of each signal, if nothing changes.' },
    { label: 'DTC → claim lead', value: cur.median_dtc_lead_days === null || cur.median_dtc_lead_days === undefined ? '—' : `${formatNumber(cur.median_dtc_lead_days, 1)} d`,
      sub: `${formatNumber(cur.dtc_linked_claims)} DTC-linked claims`, info: 'Connected fleet: median days from the first occurrence of the linked fault code to claim submission. This is how much warning diagnostics give.' },
    { label: 'Predicted share', value: formatPct(cur.predicted_share), current: cur.predicted_share, previous: prev.predicted_share, betterWhen: 'up', deltaMode: 'pp',
      sub: `of ${formatNumber(cur.telematics_claims)} telematics claims`, info: 'Share of telematics claims whose failure had been predicted by the health model before it happened.' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((k) => <KpiCard key={k.label} {...k} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// E1: signal board — plain-language alert levels, as a ranked list or a part × group matrix
// ---------------------------------------------------------------------------
// Alert = the statistical signal (z ≥ 3 and ≥ 5 claims). Watch = clearly above normal but not yet conclusive.
function levelOf(r) {
  if (r.is_signal) return 'alert';
  if ((num(r.z) || 0) >= 2 && Number(r.claims) >= 3) return 'watch';
  return 'normal';
}

const LEVELS = {
  alert: { label: 'Alert', badge: 'bg-rose-50 text-rose-700 border-rose-200', bar: '#e11d48', cell: 'bg-rose-500 text-white', dot: 'bg-rose-500' },
  watch: { label: 'Watch', badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: '#f59e0b', cell: 'bg-amber-300 text-amber-950', dot: 'bg-amber-400' },
  normal: { label: 'Normal', badge: 'bg-slate-50 text-slate-500 border-slate-200', bar: '#94a3b8', cell: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};

const LEVEL_ORDER = { alert: 0, watch: 1, normal: 2 };

function LevelBadge({ level }) {
  const l = LEVELS[level];
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5 ${l.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${l.dot}`} />{l.label}</span>;
}

const timesNormal = (r) => {
  const e = num(r.expected) || 0;
  return e > 0 ? Number(r.claims) / e : null;
};

function SignalBoardCard({ signals, local, onOpen }) {
  const [view, setView] = useState('list');
  const [show, setShow] = useState('attention');
  const [limit, setLimit] = useState(BOARD_PAGE);
  const groupLabel = GROUP_LABELS[local.groupBy];

  const rows = (signals.data || [])
    .map((r) => ({ ...r, dim: local.groupBy, key: `${r.part_id}|${r.grp}`, level: levelOf(r), ratio: timesNormal(r) }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (num(b.z) || 0) - (num(a.z) || 0));
  const counts = { alert: 0, watch: 0, normal: 0 };
  rows.forEach((r) => { counts[r.level] += 1; });
  const visible = show === 'all' ? rows : show === 'alert' ? rows.filter((r) => r.level === 'alert') : rows.filter((r) => r.level !== 'normal');

  return (
    <Card
      title="Signal board"
      subtitle={`Which parts are failing more than normal? Each ${groupLabel === 'All' ? 'part' : `part × ${groupLabel.toLowerCase()}`} is compared with its own claim rate in the 3 previous periods.`}
      info="Normal = the claims we would expect from the previous 3 periods, adjusted for period length and for how many vehicles are on the road. Alert = at least 5 claims and far above normal (statistically significant, z ≥ 3). Watch = noticeably above normal (z ≥ 2) but not yet conclusive. Click a row or cell to open the evidence."
      actions={(
        <div className="flex flex-col items-end gap-1.5">
          <Segmented value={local.groupBy} onChange={local.setGroupBy}
            options={Object.entries(GROUP_LABELS).map(([value, label]) => ({ value, label: value === 'all' ? 'Part only' : `By ${label.toLowerCase()}` }))} />
          <Segmented size="xs" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'matrix', label: 'Matrix' }]} />
        </div>
      )}
    >
      <DataState state={signals} empty="No claims in this window.">
        {() => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {[['attention', `Needs attention (${counts.alert + counts.watch})`], ['alert', `Alerts only (${counts.alert})`], ['all', `Everything (${rows.length})`]].map(([v, label]) => (
                <button key={v} type="button" onClick={() => { setShow(v); setLimit(BOARD_PAGE); }}
                  className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${show === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                  {label}
                </button>
              ))}
              <span className="flex-1" />
              <span className="flex items-center gap-3 text-[11px] text-slate-500">
                {Object.entries(LEVELS).map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${l.dot}`} />{l.label} {counts[k]}</span>)}
              </span>
            </div>

            {visible.length === 0 ? (
              <p className="h-32 flex items-center justify-center text-sm text-slate-400 text-center px-6">
                Nothing is running above normal in this period. Choose “Everything” to see all parts, or widen the date range.
              </p>
            ) : view === 'list' ? (
              <SignalList rows={visible.slice(0, limit)} groupLabel={groupLabel} onOpen={onOpen}
                total={visible.length} onMore={visible.length > limit ? () => setLimit((l) => l + BOARD_PAGE) : null} />
            ) : (
              <SignalMatrix rows={visible} groupLabel={groupLabel} onOpen={onOpen} />
            )}
          </div>
        )}
      </DataState>
    </Card>
  );
}

function SignalList({ rows, groupLabel, onOpen, total, onMore }) {
  const maxScale = Math.max(...rows.map((r) => Math.max(Number(r.claims), num(r.expected) || 0)), 1);
  const showGroup = groupLabel !== 'All';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-200 text-left">
            <th className="font-semibold py-2 pr-3">Level</th>
            <th className="font-semibold pr-3">Part</th>
            {showGroup && <th className="font-semibold pr-3">{groupLabel}</th>}
            <th className="font-semibold pr-3 min-w-[16rem]">Claims vs normal</th>
            <th className="font-semibold pr-3 text-right">Cost</th>
            <th className="font-semibold pr-3 text-right">Vehicles</th>
            <th className="font-semibold pr-3">Trend</th>
            <th className="font-semibold pr-3">Next step</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expected = num(r.expected) || 0;
            return (
              <tr key={r.key} onClick={() => onOpen(r)} className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                title={`z = ${formatNumber(r.z, 1)} · supplier-liable ${formatPct(r.supplier_share, 0)} · NFF ${formatPct(r.nff_rate, 0)}`}>
                <td className="py-2.5 pr-3"><LevelBadge level={r.level} /></td>
                <td className="pr-3">
                  <span className="font-semibold text-slate-800">{r.part_name}</span>
                  <span className="block text-[11px] text-slate-400">{r.subsystem}</span>
                </td>
                {showGroup && <td className="pr-3 text-slate-700 whitespace-nowrap">{r.grp}</td>}
                <td className="pr-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-3 flex-1 bg-slate-100 rounded-full">
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Number(r.claims) / maxScale) * 100}%`, backgroundColor: LEVELS[r.level].bar }} />
                      <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-800 rounded" style={{ left: `${(expected / maxScale) * 100}%` }} title={`Normal ≈ ${formatNumber(expected, 1)}`} />
                    </div>
                    <span className="text-xs text-slate-600 whitespace-nowrap tabular-nums w-36">
                      <strong className="text-slate-900">{r.claims}</strong> vs {formatNumber(expected, 1)} normal
                      {r.ratio === null && Number(r.claims) > 0 && <span className="block font-semibold text-amber-600">none before</span>}
                      {r.ratio !== null && r.ratio >= 1.05 && <span className={`block font-semibold ${r.level === 'normal' ? 'text-slate-500' : r.level === 'alert' ? 'text-rose-600' : 'text-amber-600'}`}>{formatNumber(r.ratio, 1)}× normal</span>}
                    </span>
                  </div>
                </td>
                <td className="pr-3 text-right tabular-nums text-slate-700">{formatINR(r.cost_inr)}</td>
                <td className="pr-3 text-right tabular-nums text-slate-700">{r.vehicles}</td>
                <td className="pr-3">{r.status ? <Pill text={r.status} styles={STATUS_STYLES} /> : <span className="text-slate-300">—</span>}</td>
                <td className={`pr-3 whitespace-nowrap text-xs font-semibold ${ACTION_STYLES[r.suggested_action] || 'text-slate-500'}`}>{r.level === 'normal' ? '—' : r.suggested_action || 'Monitor'}</td>
                <td><PanelRightOpen className="w-4 h-4 text-slate-300" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-2"><span className="inline-block w-0.5 h-3 bg-slate-800" /> black tick = normal level · bar = claims this period</span>
        <span className="flex items-center gap-3">
          <span>{rows.length} of {total}</span>
          {onMore && <button type="button" onClick={onMore} className="text-blue-700 font-semibold hover:underline">Show more</button>}
        </span>
      </div>
    </div>
  );
}

function SignalMatrix({ rows, groupLabel, onOpen }) {
  const groups = [...new Set(rows.map((r) => r.grp))].sort();
  const parts = [];
  const seen = new Set();
  rows.forEach((r) => { if (!seen.has(r.part_name)) { seen.add(r.part_name); parts.push(r); } });
  const cell = Object.fromEntries(rows.map((r) => [`${r.part_name}|${r.grp}`, r]));
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="text-left font-semibold text-slate-500 px-2 py-1">Part</th>
              {groups.map((g) => <th key={g} className="font-semibold text-slate-600 px-2 py-1 whitespace-nowrap">{groupLabel === 'All' ? 'All vehicles' : g}</th>)}
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.part_name}>
                <td className="px-2 py-1 whitespace-nowrap"><span className="font-semibold text-slate-800">{p.part_name}</span><span className="block text-[10px] text-slate-400">{p.subsystem}</span></td>
                {groups.map((g) => {
                  const r = cell[`${p.part_name}|${g}`];
                  if (!r) return <td key={g} className="rounded-md bg-slate-50 text-center text-slate-300 h-12">·</td>;
                  return (
                    <td key={g} onClick={() => onOpen(r)}
                      title={`${r.part_name} × ${g}: ${r.claims} claims vs ${formatNumber(r.expected, 1)} normal · ${formatINR(r.cost_inr)}`}
                      className={`rounded-md text-center cursor-pointer h-12 px-2 hover:ring-2 hover:ring-blue-400 ${LEVELS[r.level].cell}`}>
                      <span className="block text-sm font-bold tabular-nums">{r.claims}</span>
                      <span className="block text-[10px] opacity-80 tabular-nums">{r.ratio !== null ? `${formatNumber(r.ratio, 1)}× normal` : 'none before'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Each cell: claims this period and how many times the normal level that is. Red = alert, amber = watch, grey = normal.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function IssueMap({ rows, onOpen }) {
  const data = rows.map((r) => ({ ...r, x: num(r.rate_ratio), y: num(r.cost_inr), size: num(r.vehicles) }));
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" dataKey="x" scale="log" domain={[(min) => min * 0.8, (max) => max * 1.3]} allowDataOverflow tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(v) => `${formatNumber(v, v < 1 ? 1 : 0)}×`} name="Claims ÷ expected" />
          <YAxis type="number" dataKey="y" tickFormatter={formatINRAxis} tick={{ fontSize: 11, fill: '#64748b' }} width={44} name="Cost" />
          <ZAxis type="number" dataKey="size" range={[30, 400]} />
          <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'baseline', fontSize: 10, fill: '#94a3b8', position: 'insideTopRight' }} />
          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload;
              if (!p) return null;
              return (
                <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow">
                  <p className="font-semibold text-slate-900">{p.part_name} × {p.grp}</p>
                  <p className="text-slate-600">{p.claims} claims vs {formatNumber(p.expected, 1)} expected · z {formatNumber(p.z, 1)}</p>
                  <p className="text-slate-600">{formatINR(p.cost_inr)} · {p.vehicles} vehicles</p>
                </div>
              );
            }} />
          <Scatter data={data} cursor="pointer" onClick={(d) => onOpen(d.payload || d)}>
            {data.map((d) => (
              <Cell key={d.key} fill={SUBSYSTEM_COLORS[d.subsystem] || '#64748b'} fillOpacity={d.is_signal ? 0.85 : 0.3}
                stroke={d.is_signal ? '#0f172a' : 'none'} strokeWidth={1.5} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 justify-center text-[11px] text-slate-500 -mt-1">
        {Object.entries(SUBSYSTEM_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{k}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ControlChart({ signal, filters, grain, setGrain, onOpen }) {
  const scoped = { ...filters, ...signalScope(signal) };
  const series = useAsync(() => fetchSignalSeries(scoped, grain), `${JSON.stringify(scoped)}|${grain}`);
  const rows = (series.data || []).map((r) => ({
    ...r,
    label: grain === 'week' ? format(new Date(`${r.period}T00:00:00`), 'dd MMM yy') : format(new Date(`${r.period}T00:00:00`), 'MMM yy'),
    rate: num(r.rate_per_1000), centre: num(r.centre), ucl: num(r.ucl),
  }));
  const windowRows = rows.filter((r) => r.in_window);
  const ControlDot = ({ cx, cy, payload }) => (cx === undefined || cy === undefined ? null : (
    <circle cx={cx} cy={cy} r={payload.out_of_control ? 4.5 : 2.5} fill={payload.out_of_control ? '#e11d48' : '#0284c7'} stroke="#fff" strokeWidth={1} />
  ));
  return (
    <Card
      title={`Control chart · ${signal.part_name} × ${signal.grp}`}
      subtitle="Claims per 1,000 vehicles in service per period · centre line and 3σ limit from the baseline periods (u-chart)"
      info="Centre line ū = baseline claims ÷ baseline vehicle-periods. UCL = ū + 3√(ū ÷ n) where n = vehicles in service / 1,000 for that period. Red points are above the limit: statistically unusual, not chance. The shaded band is the selected window."
      actions={(
        <>
          <Segmented value={grain} onChange={setGrain} options={[{ value: 'month', label: 'Mo' }, { value: 'week', label: 'Wk' }]} />
          <button type="button" onClick={() => onOpen(signal)} className="text-xs font-semibold text-sky-700 border border-sky-200 rounded-md px-2.5 py-1 hover:bg-sky-50">Evidence →</button>
        </>
      )}
    >
      <DataState state={series} height="h-64">
        {() => (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
                {windowRows.length > 0 && (
                  <ReferenceArea x1={windowRows[0].label} x2={windowRows[windowRows.length - 1].label} fill="#e0f2fe" fillOpacity={0.5} />
                )}
                <Tooltip {...tooltipStyle} formatter={(v, n) => [formatNumber(v, 3), n]}
                  labelFormatter={(l, p) => (p?.[0] ? `${l} · ${p[0].payload.claims} claims · ${formatNumber(p[0].payload.vis)} vehicles` : l)} />
                <Line dataKey="ucl" name="UCL (3σ)" stroke="#e11d48" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
                <Line dataKey="centre" name="Centre ū" stroke="#94a3b8" dot={false} strokeWidth={1.5} />
                <Line dataKey="rate" name="Claims / 1,000 VIS" stroke="#0284c7" strokeWidth={2} dot={<ControlDot />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DataState>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// E4: failure-cluster timeline with local filters
// ---------------------------------------------------------------------------
const CLUSTER_SOURCES = { seed_ml_label: 'ML label', telematics_label: 'Telematics' };
const tlSelect = 'border border-slate-200 rounded-md px-2 py-1 text-xs bg-white text-slate-700';

function ClusterTimeline({ filters, lookups, onOpen }) {
  const [months, setMonths] = useState(18);
  const [measure, setMeasure] = useState('claims');
  const [source, setSource] = useState('');
  const [subsystem, setSubsystem] = useState('');
  const [hideQuiet, setHideQuiet] = useState(false);

  const to = filters.date_to ? new Date(`${filters.date_to}T00:00:00`) : new Date('2026-09-24T00:00:00');
  const from = startOfMonth(subMonths(to, months - 1));
  const scoped = { ...filters, date_from: format(from, 'yyyy-MM-dd'), date_to: format(to, 'yyyy-MM-dd') };
  const matrix = useAsync(() => fetchClusterMatrix(scoped), JSON.stringify(scoped));
  const monthKeys = eachMonthOfInterval({ start: from, end: to }).map((d) => format(d, 'yyyy-MM'));
  const lastQuarter = monthKeys.slice(-3);
  const clusterInfo = lookups?.clusterById || {};

  return (
    <Card
      title="Failure-cluster timeline"
      subtitle={`${measure === 'claims' ? 'Claims' : 'Claim cost'} per month for each failure cluster (${months} months) · a full row = chronic issue, cells only on the right = new issue`}
      info="A cluster is a label already stored on each claim (cluster_id); the app does not calculate it. CLS-001…003 are pattern labels on the seed claims, standing in for an ML model that groups claims with similar failure descriptions. CLS-<subsystem> (e.g. CLS-ELEC) are labels the telematics simulation puts on its claims, one per vehicle subsystem. The cluster name = its most common subsystem / most common part. About 78% of claims have no cluster and are not shown. Click a row to open the cluster's evidence."
      actions={(
        <div className="flex items-center gap-2">
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={tlSelect} aria-label="Period">
            {[6, 12, 18, 24].map((m) => <option key={m} value={m}>Last {m} months</option>)}
          </select>
          <Segmented size="xs" value={measure} onChange={setMeasure} options={[{ value: 'claims', label: 'Claims' }, { value: 'cost_inr', label: 'Cost ₹' }]} />
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <select value={source} onChange={(e) => setSource(e.target.value)} className={tlSelect} aria-label="Cluster source">
          <option value="">All sources</option>
          {Object.entries(CLUSTER_SOURCES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={subsystem} onChange={(e) => setSubsystem(e.target.value)} className={tlSelect} aria-label="Subsystem">
          <option value="">All subsystems</option>
          {(lookups?.subsystems || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer ml-1">
          <input type="checkbox" className="accent-blue-600" checked={hideQuiet} onChange={(e) => setHideQuiet(e.target.checked)} />
          Active in the last 3 months only
        </label>
        {(source || subsystem || hideQuiet) && (
          <button type="button" onClick={() => { setSource(''); setSubsystem(''); setHideQuiet(false); }} className="text-slate-500 hover:text-rose-600">Clear</button>
        )}
      </div>
      <DataState state={matrix} height="h-40" empty={`No clustered claims in these ${months} months.`}>
        {(data) => {
          const cells = Object.fromEntries(data.map((r) => [`${r.y_key}|${r.x_key}`, num(r[measure])]));
          const recent = (c) => lastQuarter.some((m) => (cells[`${c}|${m}`] || 0) > 0);
          const clusters = [...new Set(data.map((r) => r.y_key))]
            .filter((c) => c && c !== 'Unclustered')
            .filter((c) => !source || clusterInfo[c]?.source === source)
            .filter((c) => !subsystem || clusterInfo[c]?.subsystem === subsystem)
            .filter((c) => !hideQuiet || recent(c))
            .sort();
          if (clusters.length === 0) return <p className="h-32 flex items-center justify-center text-sm text-slate-400">No cluster matches these filters.</p>;
          const name = (id) => `${id} · ${clusterInfo[id]?.cluster_name || ''}${clusterInfo[id]?.source ? ` (${CLUSTER_SOURCES[clusterInfo[id].source] || clusterInfo[id].source})` : ''}`;
          const byName = Object.fromEntries(clusters.map((c) => [name(c), c]));
          return (
            <Heatmap rows={clusters.map(name)} cols={monthKeys} rowLabel="Cluster" showTotals
              getValue={(r, c) => cells[`${byName[r]}|${c}`] ?? null}
              format={(v) => (measure === 'claims' ? formatNumber(v) : formatINRAxis(v))}
              onCellClick={(r) => onOpen(byName[r])} />
          );
        }}
      </DataState>
    </Card>
  );
}
