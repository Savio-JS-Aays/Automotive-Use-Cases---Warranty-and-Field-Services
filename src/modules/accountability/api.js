import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import { supabase } from '../../config/supabaseClient';
import { globalFilters, chipFilters, rpc } from '../../lib/rpc';
import { regionBasisFor } from './store';

export { BackendMissingError } from '../../lib/rpc';

// All aggregation happens in Postgres (wty_acc_* functions, docs/schema/migrations/016) and reuses the
// Claims & Repair p_filters contract. Design: docs/modules/dealer-supplier-accountability/design.md.

export const AS_OF = '2026-09-24';  // wty_config as_of_date; the global default range is anchored to it too

export function buildFilters(global, local, extra = {}) {
  return { ...globalFilters(global), region_basis: regionBasisFor(local), ...chipFilters(local.chips), ...extra };
}

// Scorecards rank dealers/suppliers over a longer period than the selected range by default: in a 6-month window
// most dealers have fewer than 10 claims (design §5). Only the dates change; every other filter is kept.
export function scorecardFilters(filters, period) {
  if (period === 'all') return { ...filters, date_from: null, date_to: null };
  if (period === '12m') return { ...filters, date_from: format(subDays(parseISO(AS_OF), 364), 'yyyy-MM-dd'), date_to: AS_OF };
  return filters;
}

export const PERIOD_LABELS = { range: 'Selected range', '12m': 'Last 12 months', all: 'All history' };

// Current and previous equal-length window, one after the other (keeps the page-load burst small; see Reliability)
export async function fetchKpis(f) {
  const current = await rpc('wty_acc_kpi_block', { p_filters: f });
  if (!f.date_from || !f.date_to) return { current, previous: null };
  const from = parseISO(f.date_from);
  const days = differenceInCalendarDays(parseISO(f.date_to), from) + 1;
  const previous = { ...f, date_from: format(subDays(from, days), 'yyyy-MM-dd'), date_to: format(subDays(from, 1), 'yyyy-MM-dd') };
  return { current, previous: await rpc('wty_acc_kpi_block', { p_filters: previous }) };
}

export const fetchLeakageSeries = (f) => rpc('wty_acc_leakage_series', { p_filters: f });
export const fetchDealerScorecard = (f, peer) => rpc('wty_acc_dealer_scorecard', { p_filters: f, p_peer: peer });
export const fetchAuditSummary = (f, top = 15) => rpc('wty_acc_audit_summary', { p_filters: f, p_top_dealers: top });
export const fetchAuditPage = (f, { rule = null, sort = 'at_stake', limit = 50, offset = 0 } = {}) =>
  rpc('wty_acc_audit_page', { p_filters: f, p_rule: rule, p_sort: sort, p_limit: limit, p_offset: offset });
export const fetchSupplierScorecard = (f) => rpc('wty_acc_supplier_scorecard', { p_filters: f });
export const fetchHeadToHead = (f) => rpc('wty_acc_supplier_head_to_head', { p_filters: f });
export const fetchRecoverySummary = (f) => rpc('wty_acc_recovery_summary', { p_filters: f });
export const fetchCandidatesPage = (f, { limit = 25, offset = 0 } = {}) =>
  rpc('wty_acc_recovery_candidates_page', { p_filters: f, p_limit: limit, p_offset: offset });
export const fetchCasesPage = (f, { stage = null, limit = 25, offset = 0 } = {}) =>
  rpc('wty_acc_recovery_cases_page', { p_filters: f, p_stage: stage, p_limit: limit, p_offset: offset });
export const fetchCaseDetail = (caseId) => rpc('wty_acc_case_detail', { p_case_id: caseId });
export async function fetchAgreement(supplierId) {
  const { data, error } = await supabase.from('wty_supplier_agreement').select('*').eq('supplier_id', supplierId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Claims & Repair / Reliability RPCs reused here (same contract)
export const fetchMatrix = (f, x, y) => rpc('wty_ca_matrix', { p_filters: f, p_x: x, p_y: y });
export const fetchTimeseries = (f) => rpc('wty_ca_timeseries', { p_filters: f, p_grain: 'month' });
export const fetchBreakdown = (f, dim, limit = 10) => rpc('wty_ca_breakdown', { p_filters: f, p_dim: dim, p_limit: limit });
export const fetchRoPoints = (f, limit = 1500) => rpc('wty_ca_ro_points', { p_filters: f, p_limit: limit });
export const fetchSignalDetail = (f) => rpc('wty_rel_signal_detail', { p_filters: f });

// Small tables: names <-> ids for chips (the claim drawer hands back names), and the thresholds from wty_config
export async function fetchLookups() {
  const [dealers, suppliers, parts, config] = await Promise.all([
    supabase.from('dim_dealer').select('dealer_id, dealer_name, dealer_tier, status').order('dealer_name'),
    supabase.from('dim_supplier').select('supplier_id, supplier_name, risk_tier').order('supplier_id'),
    supabase.from('dim_part').select('part_id, part_name, vehicle_subsystem').order('part_name'),
    supabase.from('wty_config').select('key, value').like('key', 'acc%'),
  ]);
  const cfg = Object.fromEntries((config.data || []).map((r) => [r.key, Number(r.value)]));
  return {
    dealers: dealers.data || [],
    suppliers: suppliers.data || [],
    parts: parts.data || [],
    dealerIdByName: Object.fromEntries((dealers.data || []).map((d) => [d.dealer_name, d.dealer_id])),
    partIdByName: Object.fromEntries((parts.data || []).map((p) => [p.part_name, p.part_id])),
    supplierIdByName: Object.fromEntries((suppliers.data || []).map((s) => [s.supplier_name, s.supplier_id])),
    partById: Object.fromEntries((parts.data || []).map((p) => [p.part_id, p])),
    subsystems: [...new Set((parts.data || []).map((p) => p.vehicle_subsystem))].sort(),
    config: {
      bandHigh: cfg.acc_band_high ?? 2,
      bandMedium: cfg.acc_band_medium ?? 1,
      minClaims: cfg.acc_min_claims_rank ?? 10,
      supIndexWatch: cfg.acc_sup_index_watch ?? 1.1,
      supIndexEscalate: cfg.acc_sup_index_escalate ?? 1.25,
      compTol: cfg.acc_compliance_tolerance ?? 0.05,
      weights: {
        cost: cfg.acc_w_cost ?? 0.25, labor: cfg.acc_w_labor ?? 0.25, nff: cfg.acc_w_nff ?? 0.2,
        reject: cfg.acc_w_reject ?? 0.15, risk: cfg.acc_w_risk ?? 0.15,
      },
      zCap: cfg.acc_z_cap ?? 4,
      shrinkK: cfg.acc_shrink_k ?? 30,
    },
  };
}

// Paged fetch of every row (CSV export of the current filter)
export async function fetchAllPages(fetchPage, total, pageSize = 500) {
  const pages = [];
  for (let offset = 0; offset < total; offset += pageSize) pages.push(await fetchPage({ limit: pageSize, offset }));
  return pages.flat();
}
