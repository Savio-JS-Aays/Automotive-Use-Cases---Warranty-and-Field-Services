import React from 'react';
import { HelpCircle, Loader2, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
export function InfoTooltip({ text, align = 'center', className = 'ml-1.5' }) {
  if (!text) return null;
  const pos = align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className={`group relative inline-flex items-center align-middle ${className}`}>
      <HelpCircle className="w-4 h-4 text-slate-400 hover:text-blue-600 cursor-help" strokeWidth={1.75} />
      <span className={`absolute bottom-full ${pos} mb-2 hidden group-hover:block w-64 bg-slate-800 text-slate-50 text-xs font-normal normal-case tracking-normal text-left rounded-lg p-3 z-30 shadow-xl leading-relaxed`}>
        {text}
      </span>
    </span>
  );
}

// Page title banner: title, optional "Page N" badge, description, optional right-hand meta
export function PageHeader({ title, page, description, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-7 py-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {page && <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-2.5 py-0.5 rounded-full">Page {page}</span>}
        </div>
        {description && <p className="text-slate-600 text-sm mt-1.5">{description}</p>}
      </div>
      {children && <div className="text-xs text-slate-500 md:text-right space-y-1">{children}</div>}
    </div>
  );
}

export function Card({ title, subtitle, info, actions, tag, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center">
              {title}
              <InfoTooltip text={info} />
              {tag && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5">
                  {tag}
                </span>
              )}
            </h3>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export function Segmented({ value, onChange, options, size = 'sm' }) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`${size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-[13px]'} font-medium rounded-md transition-colors ${
            value === o.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Wraps a data state: shows spinner / error / empty, else renders children(data)
export function DataState({ state, height = 'h-72', empty = 'No claims match the current filters.', children }) {
  if (state.loading) {
    return (
      <div className={`${height} flex items-center justify-center text-slate-400`}>
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className={`${height} flex items-center justify-center text-rose-500 text-xs gap-2 px-4 text-center`}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {state.error.message}
      </div>
    );
  }
  const data = state.data;
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return <div className={`${height} flex items-center justify-center text-slate-400 text-xs`}>{empty}</div>;
  }
  return children(data);
}

// ---------------------------------------------------------------------------
// KPI card with delta vs previous period
// ---------------------------------------------------------------------------
// Top-border accent colours, matching the suite's KPI card style
const KPI_ACCENTS = {
  blue: 'border-t-blue-600',
  emerald: 'border-t-emerald-500',
  violet: 'border-t-violet-600',
  amber: 'border-t-amber-500',
  rose: 'border-t-rose-500',
  sky: 'border-t-sky-500',
};

// betterWhen: 'up' | 'down' | null (neutral). deltaMode: 'pct' (relative) | 'pp' (percentage points) | 'abs'
// accent: a KPI_ACCENTS key; defaults to emerald (higher is better), amber (lower is better) or blue (neutral)
export function KpiCard({ label, value, current, previous, betterWhen = null, deltaMode = 'pct', sub, info, onClick, accent }) {
  let delta = null;
  if (current !== null && current !== undefined && previous !== null && previous !== undefined) {
    const c = Number(current);
    const p = Number(previous);
    if (deltaMode === 'pp') delta = { v: (c - p) * 100, text: `${c - p >= 0 ? '+' : ''}${((c - p) * 100).toFixed(1)} pp` };
    else if (deltaMode === 'abs') delta = { v: c - p, text: `${c - p >= 0 ? '+' : ''}${(c - p).toFixed(1)}` };
    else if (p !== 0) delta = { v: (c - p) / Math.abs(p), text: `${c - p >= 0 ? '+' : ''}${(((c - p) / Math.abs(p)) * 100).toFixed(1)}%` };
  }
  let tone = 'text-slate-400';
  let Icon = Minus;
  if (delta && Math.abs(delta.v) > 1e-9) {
    Icon = delta.v > 0 ? ArrowUpRight : ArrowDownRight;
    if (betterWhen) tone = (delta.v > 0) === (betterWhen === 'up') ? 'text-emerald-600' : 'text-rose-600';
  }
  const accentClass = KPI_ACCENTS[accent || (betterWhen === 'up' ? 'emerald' : betterWhen === 'down' ? 'amber' : 'blue')];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white rounded-2xl shadow-sm border border-slate-200 border-t-[3px] ${accentClass} px-5 pt-5 pb-4 min-h-[124px] flex flex-col hover:shadow-md transition-shadow disabled:cursor-default`}
      disabled={!onClick}
    >
      <span className="w-full flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 leading-snug">{label}</span>
        <InfoTooltip text={info} align="right" className="flex-shrink-0 mt-px" />
      </span>
      <span className="block text-[28px] leading-tight font-bold text-slate-900 mt-3 tabular-nums tracking-tight">{value}</span>
      <span className="w-full flex items-center justify-between mt-auto pt-1 gap-2">
        <span className="text-xs text-slate-500 truncate">{sub}</span>
        {delta && (
          <span className={`text-xs font-semibold flex items-center flex-shrink-0 ${tone}`} title="vs previous equal-length period">
            <Icon className="w-3.5 h-3.5" />
            {delta.text}
          </span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Heatmap / matrix (CSS grid). rows/cols: string[]; getValue(row, col) -> number|null
// ---------------------------------------------------------------------------
export function Heatmap({ rows, cols, getValue, format, onCellClick, rowLabel = '', showTotals = false, isMuted }) {
  const values = rows.flatMap((r) => cols.map((c) => getValue(r, c))).filter((v) => v !== null && v !== undefined);
  const max = Math.max(1e-9, ...values.map(Number));
  const colTotal = (c) => rows.reduce((s, r) => s + Number(getValue(r, c) || 0), 0);
  const rowTotal = (r) => cols.reduce((s, c) => s + Number(getValue(r, c) || 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr>
            <th className="text-left font-semibold text-slate-500 px-2 py-1 sticky left-0 bg-white">{rowLabel}</th>
            {cols.map((c) => (
              <th key={c} className="font-semibold text-slate-500 px-1 py-1 whitespace-nowrap">{c}</th>
            ))}
            {showTotals && <th className="font-semibold text-slate-700 px-2 py-1">Σ</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="font-medium text-slate-700 px-2 py-1 whitespace-nowrap sticky left-0 bg-white">{r}</td>
              {cols.map((c) => {
                const v = getValue(r, c);
                const muted = isMuted?.(r, c);
                const has = v !== null && v !== undefined && !muted;
                const alpha = has ? 0.06 + 0.9 * (Number(v) / max) : 0;
                return (
                  <td
                    key={c}
                    onClick={has && onCellClick ? () => onCellClick(r, c) : undefined}
                    title={has ? `${r} × ${c}: ${format(v)}` : muted ? 'Not yet observable' : ''}
                    className={`text-center px-1 py-1.5 rounded tabular-nums ${has && onCellClick ? 'cursor-pointer hover:ring-2 hover:ring-sky-400' : ''} ${
                      muted ? 'bg-slate-100 text-slate-300' : ''
                    }`}
                    style={has ? { backgroundColor: `rgba(2,132,199,${alpha})`, color: alpha > 0.55 ? '#fff' : '#0f172a' } : undefined}
                  >
                    {has ? format(v) : muted ? '' : '·'}
                  </td>
                );
              })}
              {showTotals && <td className="text-center font-semibold text-slate-700 px-2 tabular-nums">{format(rowTotal(r))}</td>}
            </tr>
          ))}
          {showTotals && (
            <tr>
              <td className="font-semibold text-slate-700 px-2 py-1 sticky left-0 bg-white">Σ</td>
              {cols.map((c) => (
                <td key={c} className="text-center font-semibold text-slate-700 tabular-nums">{format(colTotal(c))}</td>
              ))}
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
