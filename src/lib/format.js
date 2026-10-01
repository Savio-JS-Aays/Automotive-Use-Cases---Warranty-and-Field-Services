// Shared number formatting (docs/shared/conventions.md): INR, km, percentages.

const isBlank = (v) => v === null || v === undefined || v === '' || Number.isNaN(Number(v));

// ₹ with Indian magnitude suffixes: K (thousand), L (lakh = 1e5), Cr (crore = 1e7)
export function formatINR(value, { compact = true } = {}) {
  if (isBlank(value)) return '—';
  const v = Number(value);
  if (!compact) return `₹${Math.round(v).toLocaleString('en-IN')}`;
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

export function formatNumber(value, digits = 0) {
  if (isBlank(value)) return '—';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// value is a fraction (0.134 -> "13.4%")
export function formatPct(value, digits = 1) {
  if (isBlank(value)) return '—';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function formatKm(value) {
  if (isBlank(value)) return '—';
  const v = Number(value);
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 1e5 ? 0 : 1)}k km` : `${Math.round(v)} km`;
}

export function formatDays(value, digits = 1) {
  if (isBlank(value)) return '—';
  return `${Number(value).toFixed(digits)} d`;
}

// Axis tick formatter for INR (no decimals noise)
export function formatINRAxis(value) {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${(value / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(value / 1e5).toFixed(0)}L`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(value);
}
