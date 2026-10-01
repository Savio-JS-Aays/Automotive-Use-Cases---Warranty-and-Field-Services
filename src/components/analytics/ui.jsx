import React from 'react';
import { HelpCircle, Loader2, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
export function InfoTooltip({ text }) {
  if (!text) return null;
  return (
    <span className="group relative inline-flex items-center ml-1.5 align-middle">
      <HelpCircle className="w-3.5 h-3.5 text-slate-300 hover:text-sky-500 cursor-help" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-slate-800 text-slate-50 text-xs font-normal normal-case tracking-normal rounded-lg p-3 z-30 shadow-xl leading-relaxed">
        {text}
      </span>
    </span>
  );
}

export function Card({ title, subtitle, info, actions, tag, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              {title}
              <InfoTooltip text={info} />
              {tag && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5">
                  {tag}
                </span>
              )}
            </h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
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
    <div className="inline-flex bg-slate-100 rounded-md p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`${size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-medium rounded transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
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
// betterWhen: 'up' | 'down' | null (neutral). deltaMode: 'pct' (relative) | 'pp' (percentage points) | 'abs'
export function KpiCard({ label, value, current, previous, betterWhen = null, deltaMode = 'pct', sub, info, onClick }) {
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all disabled:cursor-default"
      disabled={!onClick}
    >
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center">
        {label}
        <InfoTooltip text={info} />
      </p>
      <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
      <div className="flex items-center justify-between mt-1 gap-2">
        <span className="text-[11px] text-slate-400 truncate">{sub}</span>
        {delta && (
          <span className={`text-[11px] font-semibold flex items-center ${tone}`} title="vs previous equal-length period">
            <Icon className="w-3 h-3" />
            {delta.text}
          </span>
        )}
      </div>
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
