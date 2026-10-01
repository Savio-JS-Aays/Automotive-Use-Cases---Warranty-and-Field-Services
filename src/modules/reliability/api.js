import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import { supabase } from '../../config/supabaseClient';
import { globalFilters, chipFilters, rpc } from '../../lib/rpc';

export { BackendMissingError } from '../../lib/rpc';

// All aggregation happens in Postgres (wty_rel_* functions, docs/schema/migrations/010) and reuses the
// Claims & Repair p_filters contract. Design: docs/modules/reliability-early-warning/design.md.

export function buildFilters(global, local, extra = {}) {
  return { ...globalFilters(global), region_basis: local.regionBasis, ...chipFilters(local.chips), ...extra };
}

// Filters that scope a signal row: its part plus the group it was detected in (variant / region / customer type)
export function signalScope(signal) {
  const scope = { part_id: [signal.part_id] };
  if (signal.dim === 'variant') scope.variant = signal.grp;
  if (signal.dim === 'vehicle_region') {
    scope.region = signal.grp;
    scope.region_basis = 'vehicle';
  }
  if (signal.dim === 'customer_type') scope.customer_type = signal.grp;
  return scope;
}

// Current and previous equal-length window as two separate statements: wty_rel_kpis runs both inside one
// statement (~1.7 s), which can hit the 3 s API statement timeout while the rest of the page is loading.
// Sequential rather than parallel to keep the page-load burst on the database small.
export async function fetchKpis(f) {
  if (!f.date_from || !f.date_to) return rpc('wty_rel_kpis', { p_filters: f });
  const from = parseISO(f.date_from);
  const days = differenceInCalendarDays(parseISO(f.date_to), from) + 1;
  const previous = { ...f, date_from: format(subDays(from, days), 'yyyy-MM-dd'), date_to: format(subDays(from, 1), 'yyyy-MM-dd') };
  const current = await rpc('wty_rel_kpi_block', { p_filters: f });
  return { current, previous: await rpc('wty_rel_kpi_block', { p_filters: previous }) };
}
export const fetchSignals = (f, dim) => rpc('wty_rel_signals', { p_filters: f, p_dim: dim });
export const fetchSignalSeries = (f, grain) => rpc('wty_rel_signal_series', { p_filters: f, p_grain: grain });
export const fetchSignalDetail = (f) => rpc('wty_rel_signal_detail', { p_filters: f });
export const fetchWeibull = (partId, basis, grpType) => rpc('wty_rel_weibull', { p_part_id: partId, p_basis: basis, p_grp_type: grpType });
export const fetchCalibration = (f, horizon) => rpc('wty_rel_calibration', { p_filters: f, p_horizon_months: horizon });
export const fetchForecast = (f, horizon) => rpc('wty_rel_forecast', { p_filters: f, p_horizon_months: horizon });
export const fetchModelPerformance = (f, days = 30) => rpc('wty_rel_model_performance', { p_filters: f, p_horizon_days: days });
export const fetchAtRiskPage = (f, { minBand = 'Medium', beforeExpiryOnly = false, limit = 25, offset = 0 } = {}) =>
  rpc('wty_rel_at_risk_page', { p_filters: f, p_min_band: minBand, p_before_expiry_only: beforeExpiryOnly, p_limit: limit, p_offset: offset });
export const fetchPrecursors = (partId) => rpc('wty_rel_precursors', { p_part_id: partId });
export const fetchDutyCycle = (f, partId) => rpc('wty_rel_duty_cycle', { p_filters: f, p_part_id: partId });

// Claims & Repair RPCs reused here (same contract)
export const fetchClusterMatrix = (f) => rpc('wty_ca_matrix', { p_filters: f, p_x: 'month', p_y: 'cluster' });
export const fetchBreakdown = (f, dim, limit = 50) => rpc('wty_ca_breakdown', { p_filters: f, p_dim: dim, p_limit: limit });
export const fetchClaimsPage = (f, limit = 20) =>
  rpc('wty_ca_claims_page', { p_filters: f, p_sort: 'submission_date', p_desc: true, p_limit: limit, p_offset: 0 });

// Small tables (≤ 50 rows): part names for the selector, cluster names for the timeline
export async function fetchLookups() {
  const [parts, clusters] = await Promise.all([
    supabase.from('dim_part').select('part_id, part_name, vehicle_subsystem, b10_design_life_miles').order('part_name'),
    supabase.from('wty_dim_failure_cluster').select('cluster_id, cluster_name, source, status, first_seen, last_seen'),
  ]);
  return {
    parts: parts.data || [],
    partById: Object.fromEntries((parts.data || []).map((p) => [p.part_id, p])),
    clusterById: Object.fromEntries((clusters.data || []).map((c) => [c.cluster_id, c])),
    subsystems: [...new Set((parts.data || []).map((p) => p.vehicle_subsystem))].sort(),
  };
}
