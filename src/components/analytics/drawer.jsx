import React from 'react';
import { X } from 'lucide-react';

// Slide-over drawer primitives shared by the analytics modules.

export function DrawerShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-5">{children}</div>
      </aside>
    </div>
  );
}

export function Section({ title, tag, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        {title}
        {tag && <span className="normal-case tracking-normal font-semibold bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5">{tag}</span>}
      </h3>
      {children}
    </section>
  );
}

export function Facts({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-slate-800 font-medium text-right">{v ?? '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
