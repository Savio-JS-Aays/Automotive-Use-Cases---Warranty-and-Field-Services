import React from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from 'recharts';
import {
  fetchWeibull, fetchCalibration, fetchBreakdown, fetchSignalDetail, fetchPrecursors,
} from '../api';
import { useAsync, tooltipStyle, num, CHART_COLORS } from '../../../lib/analytics';
import { Card, DataState, InfoTooltip, KpiCard, Segmented } from '../../../components/analytics/ui';
import { formatINR, formatKm, formatNumber, formatPct } from '../../../lib/format';
import { weibullY } from '../lib';
import { ChevronRight } from 'lucide-react';
import { ConnectedTag } from './common';

// Design: docs/modules/reliability-early-warning/design.md §7

const F_TICKS = [0.001, 0.01, 0.05, 0.1, 0.2, 0.5, 0.9, 0.99];
const lifeFmt = (basis) => (v) => (basis === 'km' ? formatKm(v) : `${formatNumber(v, v < 10 ? 1 : 0)} mo`);

export default function ReliabilityTab({ filters, local, lookups, partId: chosenPartId, actions }) {
  const basis = local.basis;
  const fmt = lifeFmt(basis);

  // Catalogue view (all parts) ignores the part / subsystem chips
  const { part_id: _part, subsystem: _sub, ...catalogueFilters } = filters;
  const calibration = useAsync(() => fetchCalibration(catalogueFilters, local.horizon), `${JSON.stringify(catalogueFilters)}|${local.horizon}`);

  // No part chip: start on the part furthest below its design life
  const partId = chosenPartId || defaultPart(calibration.data);
  const partName = lookups?.partById?.[partId]?.part_name || partId;
  const whenPart = (fetcher) => () => (partId ? fetcher() : new Promise(() => {}));
  const all = useAsync(whenPart(() => fetchWeibull(partId, basis, 'all')), `${partId}|${basis}|all`);

  // Lifetime views for the part (no date window)
  const { date_from: _f, date_to: _t, ...lifetime } = filters;
  const partLifetime = { ...lifetime, part_id: [partId] };
  const lkey = JSON.stringify(partLifetime);
  const suppliers = useAsync(whenPart(() => fetchBreakdown(partLifetime, 'supplier', 20)), lkey);
  const containment = useAsync(whenPart(() => fetchSignalDetail(partLifetime)), lkey);
  const precursors = useAsync(whenPart(() => fetchPrecursors(partId)), `${partId}`);

  const fit = all.data?.fits?.[0];
  const calRow = (calibration.data || []).find((r) => r.part_id === partId);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Showing</span>
          <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5">{partName || '—'}</span>
          <span className="text-slate-400">· click a part in “Does each part last as long as designed?” to change it</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium flex items-center">Life basis
            <InfoTooltip text="How a part's age is measured when fitting its life curve. Months in service = time since the vehicle entered service; it covers the whole fleet (about 10,000 vehicles). km (connected fleet) = odometer reading at failure; only the 200 connected vehicles report mileage, so there are fewer failures but it is the only basis that can be compared with the design life, which is specified in km." />
          </span>
          <Segmented value={basis} onChange={local.setBasis} options={[{ value: 'mis', label: 'Months in service' }, { value: 'km', label: 'km (connected fleet)' }]} />
        </div>
        <span className="text-slate-400">Lifetime view: the date range does not apply on this tab.</span>
      </div>

      <PartKpis fit={fit} calRow={calRow} basis={basis} fmt={fmt} loading={all.loading} />

      {/* R3 */}
      <Card title="Does each part last as long as designed?"
        subtitle="Mileage by which 10% of units have failed (observed B10) compared with the design B10 · parts that wear out earliest first · click a part to drill into suppliers, production months and telemetry"
        info="Observed B10 comes from the Weibull fit on the connected fleet (km). Design B10 is dim_part.b10_design_life_miles (stored in km). A part more than 20% below its design life is flagged for design review (wty_config calib_gap_review). Hover a bar for a plain-language reading."
        actions={<ConnectedTag />}>
        <DataState state={calibration} empty="No parts with a usable km fit.">
          {(rows) => (
            <DesignLifeChart rows={rows} selected={partId} onSelect={(r) => actions.focusPart(r.part_id, r.part_name, 'reliability')}
              drill={<PartDrill partName={partName} suppliers={suppliers} containment={containment} precursors={precursors} />} />
          )}
        </DataState>
      </Card>

      {/* R4 suppliers, R5 production-month containment and R7 telemetry precursors are drill-downs of R3 */}
    </div>
  );
}

function defaultPart(rows) {
  const fitted = (rows || []).filter((r) => r.fit_ok_km && r.b10_gap !== null);
  if (!fitted.length) return rows?.[0]?.part_id || null;
  return fitted.reduce((a, b) => (num(b.b10_gap) < num(a.b10_gap) ? b : a)).part_id;
}

// ---------------------------------------------------------------------------
function PartKpis({ fit, calRow, basis, fmt, loading }) {
  if (loading) return <div className="h-[104px]" />;
  if (!fit) return <p className="text-xs text-slate-400">No failures recorded for this part on this basis.</p>;
  const ok = fit.fit_ok;
  // Design B10 is a distance, so it is always compared with the km-basis fit (connected fleet), whichever life
  // basis is selected. calRow comes from wty_rel_calibration, the same source as the "last as long as designed" chart.
  const design = num(calRow?.design_b10_km);
  const kmOk = Boolean(calRow?.fit_ok_km);
  const gap = kmOk ? num(calRow?.b10_gap) : null;
  const cards = [
    { label: `Observed B10 (${basis === 'km' ? 'km' : 'months'})`, value: ok ? fmt(fit.b10_life) : '—', sub: `10% of units failed · ${fit.n_fail} failures`, info: 'Life by which 10% of units are expected to have failed, from the Weibull fit with suspensions.' },
    { label: 'Design B10 (km)', value: design ? formatKm(design) : '—',
      sub: design ? 'fixed spec · same on both bases' : 'none on file',
      info: 'The design life comes from the part specification (dim_part.b10_design_life_miles; the values are km despite the column name). It is only defined as a distance, so it does not change with the life basis and is always compared with the km fit on the connected fleet.' },
    { label: 'Calibration gap (km)', value: gap === null ? '—' : `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${formatPct(Math.abs(gap), 0)}`,
      sub: gap === null
        ? (design ? 'too few km failures' : '')
        : `${gap <= -0.2 ? 'design review' : gap < 0 ? 'below design' : 'meets design'} · ${formatKm(calRow.b10_km)}`,
      info: 'Observed B10 on the km fit ÷ design B10 − 1. Below −20% triggers "Design review" (wty_config calib_gap_review). Needs at least 5 km-recorded failures.' },
    { label: 'P(fail in warranty)', value: formatPct(basis === 'km' ? calRow?.p_fail_in_warranty_km : calRow?.p_fail_in_warranty),
      sub: basis === 'km' ? 'within 300,000 km' : 'within 36 months', info: 'Share of units expected to fail before the base warranty limit, F(limit).' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((k) => <KpiCard key={k.label} {...k} />)}
    </div>
  );
}


// ---------------------------------------------------------------------------
function logSpace(a, b, n = 40) {
  const la = Math.log(a);
  const lb = Math.log(b);
  return Array.from({ length: n }, (_, i) => Math.exp(la + ((lb - la) * i) / (n - 1)));
}

function WeibullPlot({ base, variant, basis, fmt, limit }) {
  const groups = variant ? variant : base;
  const fits = (groups.fits || []).filter((f) => f.fit_ok);
  const names = [...new Set((groups.points || []).map((p) => p.grp))];
  const color = (g) => (g === 'All' ? '#0284c7' : CHART_COLORS[names.indexOf(g) % CHART_COLORS.length]);
  const allT = (groups.points || []).map((p) => Number(p.t));
  const fit = base.fits?.[0];
  const tMin = Math.max(Math.min(...allT, limit) / 2, basis === 'km' ? 1000 : 0.5);
  const tMax = Math.max(...allT, limit, Number(fit?.design_b10_km || 0)) * 1.3;
  const pointsByGroup = names.map((g) => ({
    g, data: groups.points.filter((p) => p.grp === g).map((p) => ({ t: Number(p.t), y: weibullY(Number(p.f)), f: Number(p.f) })),
  }));
  const lines = fits.map((f) => ({
    g: f.grp, data: logSpace(tMin, tMax).map((t) => ({ t, y: num(f.beta) * (Math.log(t) - Math.log(num(f.eta))) })),
  }));
  const yTicks = F_TICKS.map(weibullY);
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" dataKey="t" scale="log" domain={[tMin, tMax]} allowDataOverflow tickFormatter={fmt} tick={{ fontSize: 11, fill: '#64748b' }} name="Life" />
          <YAxis type="number" dataKey="y" domain={[weibullY(0.0005), weibullY(0.995)]} ticks={yTicks} allowDataOverflow
            tickFormatter={(y) => formatPct(1 - Math.exp(-Math.exp(y)), y < weibullY(0.01) ? 1 : 0)} tick={{ fontSize: 11, fill: '#64748b' }} width={44} name="Unreliability" />
          <ReferenceLine x={limit} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'warranty', fontSize: 10, fill: '#64748b', position: 'insideTopLeft' }} />
          {fit?.fit_ok && <ReferenceLine x={num(fit.b10_life)} stroke="#e11d48" strokeDasharray="2 3" label={{ value: 'B10 obs.', fontSize: 10, fill: '#e11d48', position: 'insideTopRight' }} />}
          {basis === 'km' && fit?.design_b10_km && <ReferenceLine x={num(fit.design_b10_km)} stroke="#10b981" strokeDasharray="2 3" label={{ value: 'B10 design', fontSize: 10, fill: '#10b981', position: 'insideBottomRight' }} />}
          <ReferenceLine y={weibullY(0.1)} stroke="#cbd5e1" />
          <Tooltip {...tooltipStyle} formatter={(v, n) => (n === 'Life' ? fmt(v) : formatPct(1 - Math.exp(-Math.exp(v)), 2))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {lines.map((l) => (
            <Scatter key={`fit-${l.g}`} name={`${l.g} fit`} data={l.data} line={{ stroke: color(l.g), strokeWidth: 1.5 }} shape={() => null} legendType="none" isAnimationActive={false} />
          ))}
          {pointsByGroup.map((p) => (
            <Scatter key={p.g} name={p.g === 'All' ? 'Failures' : p.g} data={p.data} fill={color(p.g)} fillOpacity={0.7} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}


// ---------------------------------------------------------------------------
// R3: does each part last as long as it was designed to? One bar per part, centred on "= design life".
// Bars left of centre wear out early, bars right of centre outlast the design. The shaded band is ±20%
// (wty_config calib_gap_review = −0.2): inside it a part counts as "close to design".
const DESIGN_BAND = 0.2;
const GAP_CAP = 0.6;  // bars stop at +60% so the rest stay readable; longer gaps get an arrow and keep their exact label
const LIFE_TONES = { early: '#e34948', close: '#a3a29d', outlasts: '#2a78d6' };  // validated diverging poles + neutral
const LIFE_GROUPS = [
  { key: 'early', label: 'Wears out early', hint: `more than ${DESIGN_BAND * 100}% before design life` },
  { key: 'close', label: 'Close to design', hint: `within ±${DESIGN_BAND * 100}%` },
  { key: 'outlasts', label: 'Outlasts design', hint: `more than ${DESIGN_BAND * 100}% beyond design life` },
];
const lifeGroup = (gap) => (gap <= -DESIGN_BAND ? 'early' : gap >= DESIGN_BAND ? 'outlasts' : 'close');

function DesignLifeChart({ rows, selected, onSelect, drill }) {
  const [filter, setFilter] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [showAll, setShowAll] = React.useState(false);
  const data = rows.filter((r) => r.fit_ok_km && r.design_b10_km && r.b10_gap !== null)
    .map((r) => ({ ...r, obs: num(r.b10_km), design: num(r.design_b10_km), gap: num(r.b10_gap), group: lifeGroup(num(r.b10_gap)) }))
    .sort((a, b) => a.gap - b.gap);
  const counts = Object.fromEntries(LIFE_GROUPS.map((g) => [g.key, data.filter((r) => r.group === g.key).length]));
  const visible = data.filter((r) => !filter || r.group === filter);
  const shown = showAll || filter ? visible : visible.slice(0, 12);
  const minGap = Math.min(-0.4, ...data.map((r) => r.gap));
  const span = GAP_CAP - minGap;
  const x = (g) => ((Math.min(Math.max(g, minGap), GAP_CAP) - minGap) / span) * 100;  // % across the track
  const zero = x(0);
  const k = (v) => `${Math.round(v / 1000)}k`;
  const pct = (g) => { const v = Math.round(g * 100); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`; };

  return (
    <div className="space-y-4">
      {/* headline: three counts, also the filter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {LIFE_GROUPS.map((g) => (
          <button key={g.key} type="button" onClick={() => setFilter(filter === g.key ? null : g.key)}
            className={`text-left rounded-lg border px-3 py-2 transition-colors ${filter === g.key ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}>
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: LIFE_TONES[g.key] }} />{g.label}
            </span>
            <span className="block text-2xl font-bold text-slate-900 tabular-nums">{counts[g.key]}<span className="text-sm font-medium text-slate-400"> parts</span></span>
            <span className="block text-[11px] text-slate-500">{g.hint}</span>
          </button>
        ))}
      </div>

      {/* axis captions */}
      <div className="grid grid-cols-[15rem_1fr_10rem] gap-3 text-[11px] text-slate-500">
        <span />
        <span className="relative h-4">
          <span className="absolute left-0">← fails sooner</span>
          <span className="absolute -translate-x-1/2 font-semibold text-slate-700" style={{ left: `${zero}%` }}>= design life</span>
          <span className="absolute right-0">lasts longer →</span>
        </span>
        <span className="text-right">observed vs design B10</span>
      </div>

      <div className="space-y-1">
        {shown.map((r) => {
          const left = Math.min(x(r.gap), zero);
          const width = Math.abs(x(r.gap) - zero);
          const capped = r.gap > GAP_CAP;
          const sooner = r.gap < 0;
          const sentence = `10% of ${r.part_name} units fail by ${formatKm(r.obs)}. The design expects ${formatKm(r.design)}, so it ${sooner ? 'wears out' : 'lasts'} ${formatPct(Math.abs(r.gap), 0)} ${sooner ? 'sooner' : 'longer'}.`;
          const open = openId === r.part_id && selected === r.part_id;
          return (
            <React.Fragment key={r.part_id}>
            <button type="button" title={sentence} aria-expanded={open}
              onClick={() => { setOpenId(open ? null : r.part_id); if (!open) onSelect(r); }}
              className={`group w-full grid grid-cols-[15rem_1fr_10rem] items-center gap-3 py-1 rounded text-left ${r.part_id === selected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}>
              <span className="pl-1 min-w-0">
                <span className="flex items-center gap-1 text-xs text-slate-700">
                  <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90 text-blue-600' : ''}`} />
                  <span className="truncate">{r.part_name}</span>
                </span>
                {num(r.beta_km) < 1 && <span className="block text-[10px] leading-3 text-slate-400" title="Weibull β below 1: failures cluster early in life">early-life failures</span>}
              </span>
              <span className="relative h-5">
                <span className="absolute inset-y-0 bg-slate-100 rounded" style={{ left: `${x(-DESIGN_BAND)}%`, width: `${x(DESIGN_BAND) - x(-DESIGN_BAND)}%` }} />
                <span className="absolute inset-y-0 w-px bg-slate-500" style={{ left: `${zero}%` }} />
                <span className="absolute top-1 bottom-1" style={{
                  left: `${left}%`, width: `${Math.max(width, 0.6)}%`, background: LIFE_TONES[r.group],
                  borderRadius: sooner ? '4px 0 0 4px' : '0 4px 4px 0',
                }} />
                {capped && <span className="absolute top-0 text-sm leading-5 font-bold" title="Bar cut at +60%" style={{ left: `calc(${x(GAP_CAP)}% + 3px)`, color: LIFE_TONES.outlasts }}>›</span>}
              </span>
              <span className="text-right text-[11px] tabular-nums pr-1 whitespace-nowrap">
                <span className="font-semibold text-slate-800">{pct(r.gap)}</span>
                <span className="text-slate-400"> · {k(r.obs)} vs {k(r.design)} km</span>
              </span>
            </button>
            {open && drill}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Shaded band = within ±{DESIGN_BAND * 100}% of design. Bars stop at +{Math.round(GAP_CAP * 100)}% (›); the label shows the exact value. Connected fleet, km basis. Click a part to drill into it.</span>
        {!filter && visible.length > 12 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="font-semibold text-sky-700 hover:underline whitespace-nowrap">
            {showAll ? 'Show 12 most at risk' : `Show all ${visible.length} parts`}
          </button>
        )}
      </div>
    </div>
  );
}

function Containment({ rows }) {
  const data = rows.map((r) => ({ ...r, rate: num(r.per_1000_built) }));
  const claims = data.reduce((s, r) => s + Number(r.claims), 0);
  const built = data.reduce((s, r) => s + Number(r.built || 0), 0);
  const mean = built ? (claims * 1000) / built : 0;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={10} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <ReferenceLine y={mean} stroke="#64748b" strokeDasharray="4 4" label={{ value: `avg ${formatNumber(mean, 1)}`, fontSize: 10, fill: '#64748b', position: 'insideTopRight' }} />
          <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${formatNumber(v, 1)} per 1,000 (${p.payload.claims} claims / ${p.payload.built} built)`, 'Rate']} />
          <Bar dataKey="rate" fill="#0284c7" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DutyChart({ rows }) {
  const data = rows.map((r) => ({ ...r, label: ['', 'Q1 light', 'Q2', 'Q3', 'Q4 severe'][r.severity_quartile], rate: num(r.failures_per_100k_km) }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} content={({ payload }) => {
            const p = payload?.[0]?.payload;
            if (!p) return null;
            return (
              <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow space-y-0.5">
                <p className="font-semibold">{p.label}: {formatNumber(p.rate, 2)} failures / 100k km</p>
                <p className="text-slate-600">{p.vehicles} vehicles · {p.failures} failures · {formatKm(p.odometer_km)}</p>
                <p className="text-slate-500">GCW {formatNumber(p.avg_gcw_kg)} kg · idle {formatPct(p.idle_share)} · PTO {formatPct(p.pto_share)}</p>
                <p className="text-slate-500">{formatNumber(p.harsh_per_100km, 2)} harsh / 100 km · {formatNumber(p.brakes_per_100km, 0)} brakes / 100 km</p>
              </div>
            );
          }} />
          <Bar dataKey="rate" fill="#f97316" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PrecursorChart({ rows }) {
  const data = rows.map((r) => ({ ...r, name: r.signal_name || r.signal_code, early: num(r.early_z), late: num(r.late_z) }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10, fill: '#334155' }} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => [formatNumber(v, 2), n]}
            labelFormatter={(l, p) => (p?.[0] ? `${l} · uplift ${formatNumber(p[0].payload.uplift, 2)} · ${formatPct(p[0].payload.share_anomalous, 0)} with an anomalous day · ${p[0].payload.replacements} replacements` : l)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="early" name="Early (30–21 days before)" fill="#cbd5e1" />
          <Bar dataKey="late" name="Late (7–1 days before)" fill="#e11d48" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drill-down for one part of R3: suppliers (R4), production-month containment (R5), telemetry precursors (R7)
// ---------------------------------------------------------------------------
const DRILL_VIEWS = [
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'production', label: 'Production month' },
  { value: 'telemetry', label: 'Telemetry signals' },
];

const DRILL_TEXT = {
  suppliers: {
    title: 'Suppliers for this part',
    sub: 'All claims for the part (lifetime), by liable supplier',
    info: "Per-supplier life curves are not possible: we don't know which supplier's part is on the vehicles that have not failed. These failures-only metrics compare suppliers instead.",
  },
  production: {
    title: 'Production-month containment',
    sub: 'Claims per 1,000 vehicles built, by production month (lifetime)',
    info: 'Production month stands in for a batch: the schema has no batch id. A few months far above the dashed average suggest a batch problem; an even spread suggests design or usage.',
  },
  telemetry: {
    title: 'Leading telemetry signals',
    sub: 'Mean |z-score| 30–21 days vs 7–1 days before a failure of this part',
    info: 'From v_failure_precursor_summary. A large rise from early to late means the signal drifts before the part fails, so it can be used for early warning.',
  },
};

function PartDrill({ partName, suppliers, containment, precursors }) {
  const [view, setView] = React.useState('suppliers');
  const t = DRILL_TEXT[view];
  return (
    <div className="ml-5 mr-1 mt-1 mb-3 border border-blue-100 bg-blue-50/30 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
            {t.title}: <span className="font-semibold text-blue-700">{partName}</span>
            {view === 'telemetry' && <ConnectedTag />}
          </p>
          <p className="text-xs text-slate-500 mt-0.5" title={t.info}>{t.sub}</p>
        </div>
        <Segmented value={view} onChange={setView} options={DRILL_VIEWS} />
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        {view === 'suppliers' && (
          <DataState state={suppliers} height="h-40" empty="No claims for this part.">
            {(rows) => <SupplierTable rows={rows} />}
          </DataState>
        )}
        {view === 'production' && (
          <DataState state={containment} height="h-56" empty="No claims for this part.">
            {(d) => <Containment rows={d.by_production_month || []} />}
          </DataState>
        )}
        {view === 'telemetry' && (
          <DataState state={precursors} height="h-56" empty="No telemetry precursors recorded for this part.">
            {(rows) => <PrecursorChart rows={rows} />}
          </DataState>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">{t.info}</p>
    </div>
  );
}

function SupplierTable({ rows }) {
  const total = rows.reduce((s, r) => s + Number(r.claims), 0);
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-[11px] text-slate-500 border-b border-slate-100">
        <th className="text-left font-semibold py-1.5">Supplier</th><th className="text-right font-semibold">Claims</th><th className="text-right font-semibold">Share</th>
        <th className="text-right font-semibold">Cost</th><th className="text-right font-semibold">NFF</th><th className="text-right font-semibold">Recovered</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-slate-50">
            <td className="py-1.5 text-slate-700">{r.key}</td>
            <td className="text-right tabular-nums">{r.claims}</td>
            <td className="text-right tabular-nums">
              <span className="inline-flex items-center gap-1.5 justify-end">
                <span className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden inline-block">
                  <span className="block h-full bg-blue-500" style={{ width: `${total ? (Number(r.claims) / total) * 100 : 0}%` }} />
                </span>
                {formatPct(total ? Number(r.claims) / total : null, 0)}
              </span>
            </td>
            <td className="text-right tabular-nums">{formatINR(r.cost_inr)}</td>
            <td className="text-right tabular-nums">{formatPct(r.nff_rate, 0)}</td>
            <td className="text-right tabular-nums text-emerald-700">{formatINR(r.recovered_inr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
