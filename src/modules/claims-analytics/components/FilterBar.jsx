import React, { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { CHIP_LABELS } from '../store';
import { MIS_BUCKETS, KM_BUCKETS, STATUS_GROUPS } from '../lib';
import { Segmented } from '../../../components/analytics/ui';

const OPTION_GROUPS = [
  { key: 'status_group', label: 'Status group', options: STATUS_GROUPS },
  { key: 'status', label: 'Status', options: ['Open', 'Submitted', 'In Review', 'Paid', 'Rejected'] },
  { key: 'liability_type', label: 'Liability', options: ['OEM', 'Supplier'] },
  { key: 'claim_source', label: 'Claim source', options: [{ value: 'seed', label: 'Seed' }, { value: 'telematics_sim', label: 'Telematics' }] },
  { key: 'risk_band', label: 'AI risk band', options: ['Low', 'Medium', 'High'] },
  { key: 'dealer_tier', label: 'Dealer tier', options: ['Platinum', 'Gold', 'Silver'] },
  { key: 'mis_bucket', label: 'Months in service', options: MIS_BUCKETS },
  { key: 'km_bucket', label: 'km at failure', options: KM_BUCKETS },
];

const norm = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

export default function FilterBar({ local, actions, subsystems }) {
  const [open, setOpen] = useState(false);
  const chipEntries = Object.entries(local.chips).flatMap(([key, chips]) => chips.map((c) => ({ key, ...c })));
  const flags = [
    local.nff !== null && { id: 'nff', label: `NFF: ${local.nff ? 'Yes' : 'No'}`, clear: () => actions.setNff(null) },
    local.repeatOnly && { id: 'repeat', label: 'Repeat repairs only', clear: () => actions.setRepeatOnly(false) },
    local.overrunOnly && { id: 'overrun', label: 'Labor overrun only', clear: () => actions.setOverrunOnly(false) },
  ].filter(Boolean);
  const active = chipEntries.length + flags.length;

  const groups = [...OPTION_GROUPS.slice(0, 5), { key: 'subsystem', label: 'Subsystem', options: subsystems || [] }, ...OPTION_GROUPS.slice(5)];

  const toggle = (key, opt) => {
    const selected = (local.chips[key] || []).some((c) => c.value === opt.value);
    if (selected) actions.removeChip(key, opt.value);
    else actions.addChip(key, opt.value, opt.label);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Date basis</span>
          <Segmented value={local.dateBasis} onChange={actions.setDateBasis} options={[{ value: 'submission', label: 'Submission' }, { value: 'adjudication', label: 'Adjudication' }]} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Region basis</span>
          <Segmented value={local.regionBasis} onChange={actions.setRegionBasis} options={[{ value: 'vehicle', label: 'Vehicle' }, { value: 'dealer', label: 'Dealer' }]} />
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => setOpen((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium border rounded-md px-2.5 py-1.5 ${open ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> More filters {active > 0 && <span className="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">{active}</span>}
        </button>
        {active > 0 && (
          <button type="button" onClick={actions.clearLocal} className="text-xs text-slate-500 hover:text-rose-600">Clear all</button>
        )}
      </div>

      {active > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {chipEntries.map((c) => (
            <span key={`${c.key}-${c.value}`} className="inline-flex items-center gap-1 text-[11px] bg-sky-50 text-sky-800 border border-sky-200 rounded-full pl-2 pr-1 py-0.5">
              <span className="text-sky-500">{CHIP_LABELS[c.key] || c.key}:</span> {c.label}
              <button type="button" onClick={() => actions.removeChip(c.key, c.value)} className="hover:bg-sky-100 rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {flags.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 text-[11px] bg-violet-50 text-violet-800 border border-violet-200 rounded-full pl-2 pr-1 py-0.5">
              {f.label}
              <button type="button" onClick={f.clear} className="hover:bg-violet-100 rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map(norm).map((opt) => {
                  const selected = (local.chips[g.key] || []).some((c) => c.value === opt.value);
                  return (
                    <button key={opt.value} type="button" onClick={() => toggle(g.key, opt)}
                      className={`text-[11px] px-2 py-0.5 rounded border ${selected ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1.5">No fault found</p>
            <Segmented size="xs" value={local.nff === null ? 'any' : local.nff ? 'yes' : 'no'}
              onChange={(v) => actions.setNff(v === 'any' ? null : v === 'yes')}
              options={[{ value: 'any', label: 'Any' }, { value: 'yes', label: 'NFF' }, { value: 'no', label: 'Fault found' }]} />
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-slate-600">
            <p className="text-[11px] font-semibold text-slate-500">Flags</p>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-sky-600" checked={local.repeatOnly} onChange={(e) => actions.setRepeatOnly(e.target.checked)} /> Repeat repairs only (same vehicle + part ≤ 90 days)</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-sky-600" checked={local.overrunOnly} onChange={(e) => actions.setOverrunOnly(e.target.checked)} /> Labor overrun only (billed &gt; SRT max)</label>
          </div>
        </div>
      )}
    </div>
  );
}
