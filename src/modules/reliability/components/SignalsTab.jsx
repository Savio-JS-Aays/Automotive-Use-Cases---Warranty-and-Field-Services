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
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(BOARD_PAGE);
  const [selectedKey, setSelectedKey] = useState(null);

  const rows = (signals.data || []).map((r) => ({ ...r, dim: local.groupBy, key: `${r.part_id}|${r.grp}` }));
  const boardRows = showAll ? rows : rows.filter((r) => r.is_signal || r.status === 'Cooling');
  const selected = rows.find((r) => r.key === selectedKey) || rows.find((r) => r.is_signal) || rows[0];

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} />

      {/* E1 */}
      <Card
        title="Signal board"
        subtitle={`Part × ${GROUP_LABELS[local.groupBy].toLowerCase()}: claims in the window vs the rate of the 3 preceding periods`}
        info="Expected = baseline claims scaled to the window length and to vehicles in service. z = (claims − expected) / √expected. A signal needs z ≥ 3 and at least 5 claims (wty_config). Status: New / Escalating / Persisting, or Cooling when last period's signal is gone. Suggested action is a rule, not a model. The panel icon opens the evidence drawer."
        actions={(
          <>
            <Segmented value={local.groupBy} onChange={(v) => { local.setGroupBy(v); setSelectedKey(null); }}
              options={Object.entries(GROUP_LABELS).map(([value, label]) => ({ value, label }))} />
            <Segmented size="xs" value={showAll ? 'all' : 'flagged'} onChange={(v) => setShowAll(v === 'all')}
              options={[{ value: 'flagged', label: 'Flagged' }, { value: 'all', label: 'All' }]} />
          </>
        )}
      >
        <DataState state={signals} empty="No claims in this window.">
          {() => (boardRows.length === 0 ? (
            <p className="h-40 flex items-center justify-center text-xs text-slate-400">
              No part × {GROUP_LABELS[local.groupBy].toLowerCase()} rate is significantly above its baseline. Switch to “All” to see every combination.
            </p>
          ) : (
            <SignalBoard rows={boardRows.slice(0, limit)} selectedKey={selected?.key} total={boardRows.length}
              onSelect={(r) => setSelectedKey(r.key)} onOpen={actions.openSignal}
              onMore={boardRows.length > limit ? () => setLimit((l) => l + BOARD_PAGE) : null} />
          ))}
        </DataState>
      </Card>

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
function SignalBoard({ rows, selectedKey, total, onSelect, onOpen, onMore }) {
  const maxZ = Math.max(6, ...rows.map((r) => num(r.z) || 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px] text-slate-500 border-b border-slate-100">
            <th className="text-left font-semibold py-2 pr-2">Part</th>
            <th className="text-left font-semibold pr-2">Group</th>
            <th className="text-right font-semibold pr-2">Claims</th>
            <th className="text-right font-semibold pr-2">Expected</th>
            <th className="text-left font-semibold pr-2 w-28">z</th>
            <th className="text-left font-semibold pr-2">Status</th>
            <th className="text-right font-semibold pr-2">Cost</th>
            <th className="text-right font-semibold pr-2">Vehicles</th>
            <th className="text-right font-semibold pr-2">Supplier</th>
            <th className="text-right font-semibold pr-2">NFF</th>
            <th className="text-left font-semibold pr-2">Suggested action</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const z = num(r.z);
            return (
              <tr key={r.key} onClick={() => onSelect(r)}
                className={`border-b border-slate-50 cursor-pointer ${r.key === selectedKey ? 'bg-sky-50' : 'hover:bg-slate-50'} ${r.status === 'Cooling' ? 'text-slate-400' : 'text-slate-700'}`}>
                <td className="py-1.5 pr-2 font-medium">{r.part_name}<span className="block text-[10px] text-slate-400 font-normal">{r.subsystem}</span></td>
                <td className="pr-2 whitespace-nowrap">{r.grp}</td>
                <td className="pr-2 text-right tabular-nums font-semibold">{r.claims}</td>
                <td className="pr-2 text-right tabular-nums">{formatNumber(r.expected, 1)}</td>
                <td className="pr-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 bg-slate-100 rounded-full w-16 overflow-hidden">
                      <div className={`h-full ${r.is_signal ? 'bg-rose-500' : 'bg-slate-300'}`} style={{ width: `${Math.max(0, Math.min(100, ((z || 0) / maxZ) * 100))}%` }} />
                    </div>
                    <span className="tabular-nums">{formatNumber(z, 1)}</span>
                  </div>
                </td>
                <td className="pr-2"><Pill text={r.status} styles={STATUS_STYLES} /></td>
                <td className="pr-2 text-right tabular-nums">{formatINR(r.cost_inr)}</td>
                <td className="pr-2 text-right tabular-nums">{r.vehicles}</td>
                <td className="pr-2 text-right tabular-nums">{formatPct(r.supplier_share, 0)}</td>
                <td className="pr-2 text-right tabular-nums">{formatPct(r.nff_rate, 0)}</td>
                <td className={`pr-2 whitespace-nowrap font-medium ${ACTION_STYLES[r.suggested_action] || ''}`}>{r.suggested_action || ''}</td>
                <td>
                  <button type="button" title="Open evidence" onClick={(e) => { e.stopPropagation(); onOpen(r); }} className="p-1 rounded hover:bg-sky-100 text-sky-600">
                    <PanelRightOpen className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
        <span>{rows.length} of {total} rows</span>
        {onMore && <button type="button" onClick={onMore} className="text-sky-700 font-semibold hover:underline">Show more</button>}
      </div>
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
function ClusterTimeline({ filters, lookups, onOpen }) {
  // Lifetime-style view: the 18 months up to the end of the selected window
  const to = filters.date_to ? new Date(`${filters.date_to}T00:00:00`) : new Date('2026-09-24T00:00:00');
  const from = startOfMonth(subMonths(to, 17));
  const scoped = { ...filters, date_from: format(from, 'yyyy-MM-dd'), date_to: format(to, 'yyyy-MM-dd') };
  const matrix = useAsync(() => fetchClusterMatrix(scoped), JSON.stringify(scoped));
  const months = eachMonthOfInterval({ start: from, end: to }).map((d) => format(d, 'yyyy-MM'));
  return (
    <Card
      title="Failure-cluster timeline"
      subtitle="Claims per month for each labelled failure cluster (18 months)"
      info="Clusters are the ML / telematics labels on claims (cluster_id), now described in wty_dim_failure_cluster. Chronic clusters fill the whole row; new ones appear on the right. Click a row label or cell to open the cluster's evidence."
    >
      <DataState state={matrix} height="h-40" empty="No clustered claims in these 18 months.">
        {(data) => {
          const cells = Object.fromEntries(data.map((r) => [`${r.y_key}|${r.x_key}`, num(r.claims)]));
          const clusters = [...new Set(data.map((r) => r.y_key))].filter((c) => c && c !== 'Unclustered').sort();
          const name = (id) => `${id} · ${lookups?.clusterById?.[id]?.cluster_name || ''}`;
          const byName = Object.fromEntries(clusters.map((c) => [name(c), c]));
          return (
            <Heatmap rows={clusters.map(name)} cols={months} rowLabel="Cluster"
              getValue={(r, c) => cells[`${byName[r]}|${c}`] ?? null}
              format={(v) => formatNumber(v)}
              onCellClick={(r) => onOpen(byName[r])} />
          );
        }}
      </DataState>
    </Card>
  );
}
