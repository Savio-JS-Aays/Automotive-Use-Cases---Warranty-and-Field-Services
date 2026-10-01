// Helpers for Dealer & Supplier Accountability. Thresholds come from wty_config (migration 013) via fetchLookups.

export const DEALER_BAND_STYLES = {
  High: 'bg-rose-50 text-rose-700 border-rose-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-50 text-slate-600 border-slate-200',
  'Not ranked': 'bg-white text-slate-400 border-slate-200',
};

export const SUPPLIER_BAND_STYLES = {
  Escalate: 'bg-rose-50 text-rose-700 border-rose-200',
  Watch: 'bg-amber-50 text-amber-700 border-amber-200',
  OK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Not ranked': 'bg-white text-slate-400 border-slate-200',
};

export const STAGE_STYLES = {
  'Awaiting adjudication': 'bg-slate-50 text-slate-600 border-slate-200',
  Identified: 'bg-sky-50 text-sky-700 border-sky-200',
  Notified: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Disputed: 'bg-rose-50 text-rose-700 border-rose-200',
  Agreed: 'bg-violet-50 text-violet-700 border-violet-200',
  Invoiced: 'bg-amber-50 text-amber-700 border-amber-200',
  Recovered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Future-dated': 'bg-slate-50 text-slate-400 border-slate-200',
};

export const CASE_STAGES = ['Identified', 'Notified', 'Disputed', 'Agreed', 'Invoiced', 'Recovered'];

export const RULES = {
  out_of_coverage: { label: 'Out of coverage', short: 'ooc', info: 'Submitted after the vehicle’s base-warranty end date or above its km limit (wty_vehicle_coverage). Whole claim at stake.' },
  labor_over_max: { label: 'Labor over SRT max', short: 'labor', info: 'Billed hours above the SRT maximum allowable hours for the part. At stake: hours above the maximum × ₹1,500.' },
  high_ai_risk: { label: 'High AI risk', short: 'AI', info: 'AI risk score ≥ 80 (wty_config ai_risk_high). Review only: adds no ₹ at stake of its own.' },
  nff: { label: 'NFF', short: 'NFF', info: 'No fault found on the returned part. Whole claim at stake.' },
  repeat_repair: { label: 'Repeat repair', short: 'repeat', info: 'Same vehicle and part claimed again within 90 days. Whole claim at stake.' },
};

export const RULE_STYLES = {
  out_of_coverage: 'bg-slate-100 text-slate-700',
  labor_over_max: 'bg-amber-100 text-amber-800',
  high_ai_risk: 'bg-violet-100 text-violet-800',
  nff: 'bg-rose-100 text-rose-800',
  repeat_repair: 'bg-sky-100 text-sky-800',
};

// Dealer Risk Index factors: z column, weight key in config, label, colour of its slice in the contribution bar
export const FACTORS = [
  { key: 'z_cost', weight: 'cost', label: 'Cost index', color: '#0284c7' },
  { key: 'z_labor', weight: 'labor', label: 'Labor index', color: '#f97316' },
  { key: 'z_nff', weight: 'nff', label: 'NFF rate', color: '#f43f5e' },
  { key: 'z_reject', weight: 'reject', label: 'Rejection rate', color: '#a855f7' },
  { key: 'z_risk', weight: 'risk', label: 'AI-high share', color: '#64748b' },
];

// Weighted, clamped, shrunk contribution of each factor (sums to risk_index, as in wty_acc_dealer_scorecard)
export function factorContributions(row, config) {
  const shrink = Number(row.claims) / (Number(row.claims) + config.shrinkK);
  return FACTORS.map((f) => {
    const z = Number(row[f.key] ?? 0);
    return { ...f, z: row[f.key] === null ? null : z, value: shrink * config.weights[f.weight] * Math.min(Math.max(z, 0), config.zCap) };
  });
}

// Band with a user-chosen minimum claim count (the RPC bands with wty_config's minimum)
export function dealerBand(row, config, minClaims) {
  if (Number(row.claims) < minClaims) return 'Not ranked';
  const idx = Number(row.risk_index);
  if (idx >= config.bandHigh) return 'High';
  if (idx >= config.bandMedium) return 'Medium';
  return 'Low';
}

// Same rule as wty_acc_supplier_scorecard, re-applied so the minimum-claims control can change who is ranked
export function supplierBand(row, config, minClaims) {
  if (Number(row.claims) < minClaims) return 'Not ranked';
  const q = Math.max(Number(row.cost_index ?? 0), Number(row.early_failure_score ?? 0));
  if (q >= config.supIndexEscalate) return 'Escalate';
  if (q >= config.supIndexWatch || (row.compliance_gap !== null && Number(row.compliance_gap) < -config.compTol)) return 'Watch';
  return 'OK';
}

// 95% / 99.8% binomial control limits around rate p for volume n (funnel plot)
export function funnelLimits(p, maxN, steps = 40) {
  const out = [];
  for (let i = 1; i <= steps; i += 1) {
    const n = Math.max(1, Math.round((maxN * i) / steps));
    const se = Math.sqrt((p * (1 - p)) / n);
    out.push({ n, lo95: Math.max(0, p - 1.96 * se), hi95: Math.min(1, p + 1.96 * se), lo998: Math.max(0, p - 3.09 * se), hi998: Math.min(1, p + 3.09 * se) });
  }
  return out;
}

export function toCsv(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => c.label).join(','), ...rows.map((r) => cols.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(','))].join('\n');
}

export function downloadCsv(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const signed = (v, digits = 1) => (v === null || v === undefined ? '—' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(digits)}`);
