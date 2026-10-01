import { supabase } from '../../config/supabaseClient';
import { globalFilters, chipFilters, rpc } from '../../lib/rpc';

export { BackendMissingError } from '../../lib/rpc';

// All aggregation happens in Postgres (wty_ca_* functions, docs/schema/migrations/004).
// Every call takes the same p_filters contract (docs/modules/claims-repair-analytics/design.md §6.3).

export function buildFilters(global, local, extra = {}) {
  const filters = {
    ...globalFilters(global),
    date_basis: local.dateBasis,
    region_basis: local.regionBasis,
    nff: local.nff,
    repeat_only: local.repeatOnly || null,
    overrun_only: local.overrunOnly || null,
    ro_scope: local.roScope,
    ...chipFilters(local.chips),
  };
  return { ...filters, ...extra };
}

export const fetchKpis = (f) => rpc('wty_ca_kpis', { p_filters: f });
export const fetchTimeseries = (f, grain = 'month') => rpc('wty_ca_timeseries', { p_filters: f, p_grain: grain });
export const fetchBreakdown = (f, dim, limit = 50) => rpc('wty_ca_breakdown', { p_filters: f, p_dim: dim, p_limit: limit });
export const fetchMatrix = (f, x, y) => rpc('wty_ca_matrix', { p_filters: f, p_x: x, p_y: y });
export const fetchCohort = (f, step = 6) => rpc('wty_ca_cohort', { p_filters: f, p_mis_step: step });
export const fetchRoBreakdown = (f, dim, limit = 100) => rpc('wty_ca_ro_breakdown', { p_filters: f, p_dim: dim, p_limit: limit });
export const fetchRoPoints = (f, limit = 1500) => rpc('wty_ca_ro_points', { p_filters: f, p_limit: limit });
export const fetchClaimDetail = (claimId) => rpc('wty_ca_claim_detail', { p_claim_id: claimId });
export const fetchClaimsPage = (f, { sort = 'submission_date', desc = true, limit = 50, offset = 0 } = {}) =>
  rpc('wty_ca_claims_page', { p_filters: f, p_sort: sort, p_desc: desc, p_limit: limit, p_offset: offset });

// Small dimension tables (≤ 100 rows, well under the API row cap) used to turn chart labels
// (names) back into the ids the filter contract expects.
export async function fetchLookups() {
  const [parts, dealers, suppliers] = await Promise.all([
    supabase.from('dim_part').select('part_id, part_name, vehicle_subsystem, b10_design_life_miles'),
    supabase.from('dim_dealer').select('dealer_id, dealer_name, dealer_tier, status'),
    supabase.from('dim_supplier').select('supplier_id, supplier_name, risk_tier'),
  ]);
  const byName = (rows, nameKey) => Object.fromEntries((rows || []).map((r) => [r[nameKey], r]));
  return {
    partByName: byName(parts.data, 'part_name'),
    dealerByName: byName(dealers.data, 'dealer_name'),
    supplierByName: byName(suppliers.data, 'supplier_name'),
    subsystems: [...new Set((parts.data || []).map((p) => p.vehicle_subsystem))].sort(),
  };
}
