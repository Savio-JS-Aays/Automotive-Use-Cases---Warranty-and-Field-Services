import React from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { formatINR } from '../../../lib/format';
import { RULES, RULE_STYLES, factorContributions } from '../lib';

// Status / band pill; `styles` maps text -> Tailwind classes (see ../lib.js)
export function Pill({ text, styles }) {
  if (!text) return null;
  return <span className={`inline-block text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${styles[text] || ''}`}>{text}</span>;
}

// Tag for numbers that come from the seeded recovery lifecycle (migration 014)
export function DemoTag() {
  return (
    <span title="Case dates and agreement terms are a deterministic demo seed (migration 014). Amounts are real claim sums."
      className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
      Demo lifecycle
    </span>
  );
}

export function RulePills({ flags }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {(flags || []).map((f) => (
        <span key={f} title={RULES[f]?.label} className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${RULE_STYLES[f] || 'bg-slate-100'}`}>{RULES[f]?.short || f}</span>
      ))}
    </span>
  );
}

// Horizontal "flow" bars (waterfall / funnel): rows [{ label, value, tone, indent, sub, onClick }]
export function FlowBars({ rows, max, format = formatINR }) {
  const top = max ?? Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <button key={r.label} type="button" onClick={r.onClick} disabled={!r.onClick}
          className={`w-full grid grid-cols-[11rem_1fr_6rem] items-center gap-2 text-xs text-left ${r.onClick ? 'hover:bg-slate-50 rounded' : 'cursor-default'}`}>
          <span className={`truncate ${r.indent ? 'pl-3 text-slate-500' : 'font-medium text-slate-700'}`}>{r.label}</span>
          <span className="h-4 bg-slate-50 rounded overflow-hidden">
            <span className="block h-full rounded" style={{ width: `${Math.max(0.5, (100 * Number(r.value || 0)) / top)}%`, backgroundColor: r.tone || '#0284c7' }} />
          </span>
          <span className="text-right tabular-nums text-slate-800 font-medium">
            {format(r.value)}{r.sub && <span className="block text-[10px] text-slate-400 font-normal">{r.sub}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

// Dealer Risk Index split into its weighted factor contributions
export function ContributionBar({ row, config, scale = 1 }) {
  const parts = factorContributions(row, config);
  const title = parts.map((p) => `${p.label}: z ${p.z === null ? '—' : p.z.toFixed(2)} → +${p.value.toFixed(2)}`).join('\n');
  return (
    <span className="flex items-center gap-2" title={title}>
      <span className="w-20 h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
        {parts.map((p) => <span key={p.key} style={{ width: `${(100 * p.value) / scale}%`, backgroundColor: p.color }} />)}
      </span>
      <span className="tabular-nums text-slate-700 w-9 text-right">{Number(row.risk_index).toFixed(2)}</span>
    </span>
  );
}

export function Sparkline({ points, color = '#0284c7' }) {
  if (!points?.length) return null;
  return (
    <div className="h-6 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line type="monotone" dataKey="claims" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  if (!total) return null;
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-slate-500 mt-3">
      <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total.toLocaleString('en-IN')}</span>
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="p-1 rounded border border-slate-200 disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /></button>
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)} className="p-1 rounded border border-slate-200 disabled:opacity-40"><ChevronRight className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export function CsvButton({ onClick, busy, disabled }) {
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick} className="flex items-center gap-1 text-xs border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
      <Download className="w-3.5 h-3.5" /> {busy ? 'Exporting…' : 'CSV'}
    </button>
  );
}

// Plain table: cols [{ key, label, align, render }]
export function Table({ rows, cols, onRow, rowKey, rowClass }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200">
            {cols.map((c) => <th key={c.key} className={`py-2 px-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={`${onRow ? 'cursor-pointer hover:bg-sky-50/50' : ''} ${rowClass?.(r) || ''}`}>
              {cols.map((c) => (
                <td key={c.key} className={`py-1.5 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
