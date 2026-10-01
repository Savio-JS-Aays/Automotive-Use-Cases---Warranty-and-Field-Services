// Helpers for Reliability & Early Warning. Weibull parameters come from wty_mv_part_reliability (migration 009).

export const STATUS_STYLES = {
  New: 'bg-sky-50 text-sky-700 border-sky-200',
  Escalating: 'bg-rose-50 text-rose-700 border-rose-200',
  Persisting: 'bg-amber-50 text-amber-700 border-amber-200',
  Cooling: 'bg-slate-50 text-slate-500 border-slate-200',
};

export const SUBSYSTEM_COLORS = { Powertrain: '#0284c7', Chassis: '#f97316', Electrical: '#a855f7', Body: '#10b981' };

export const GROUP_LABELS = { variant: 'Variant', vehicle_region: 'Region', customer_type: 'Customer type', all: 'All' };

// Default base warranty (wty_config default_warranty_months / default_warranty_km; all recorded vehicles have it)
export const WARRANTY_MONTHS = 36;
export const WARRANTY_KM = 300000;

// Weibull CDF F(t) = 1 - exp(-(t/eta)^beta)
export function weibullF(t, beta, eta) {
  if (!beta || !eta || t <= 0) return 0;
  return 1 - Math.exp(-((t / eta) ** beta));
}

// Hazard h(t) = (beta/eta)(t/eta)^(beta-1)
export function weibullHazard(t, beta, eta) {
  if (!beta || !eta || t <= 0) return 0;
  return (beta / eta) * (t / eta) ** (beta - 1);
}

// Weibull-paper ordinate for an unreliability F
export const weibullY = (f) => Math.log(-Math.log(1 - f));

// Plain-language reading of the shape parameter
export function betaReading(beta) {
  if (beta === null || beta === undefined) return '—';
  if (beta < 0.95) return 'early-life (infant mortality)';
  if (beta <= 1.1) return 'random failures';
  return 'wear-out';
}

export const RECOMMENDATION_STYLES = {
  'Design review: B10 below design': 'bg-rose-50 text-rose-700 border-rose-200',
  'Early-life failures: check build quality': 'bg-amber-50 text-amber-700 border-amber-200',
  'Exceeds design life': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'On target': 'bg-slate-50 text-slate-600 border-slate-200',
  'Insufficient data': 'bg-slate-50 text-slate-400 border-slate-200',
};

export const ACTION_STYLES = {
  'Field campaign review': 'text-rose-700',
  'Supplier 8D / recovery': 'text-violet-700',
  'Diagnostic training': 'text-amber-700',
  Monitor: 'text-slate-600',
};
