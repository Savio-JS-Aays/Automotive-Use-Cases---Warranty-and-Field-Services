import { create } from 'zustand';

// Local (module-level) filters for Dealer & Supplier Accountability. Global filters stay in useFilterStore.
// chips: { <filter key from the p_filters contract>: [{ value, label }] }

const INITIAL = {
  tab: 'summary',
  regionBasis: 'auto',      // auto = dealer region on dealer tabs, vehicle region on supplier tabs (design §5)
  chips: {},
  period: '12m',            // scorecard period: range | 12m | all
  peer: 'network',
  minClaims: null,          // null = wty_config acc_min_claims_rank
  funnelMetric: 'nff_rate',
  heatMeasure: 'overrun_rate',
  auditRule: null,
  openOnly: true,
  auditSort: 'at_stake',
  h2hPart: null,
  caseStage: null,
};

export const CHIP_LABELS = {
  dealer_id: 'Dealer',
  dealer_tier: 'Dealer tier',
  supplier_id: 'Supplier',
  subsystem: 'Subsystem',
  part_id: 'Part',
  liability_type: 'Liability',
  status_group: 'Status group',
  claim_source: 'Source',
  risk_band: 'Risk',
};

export const DEALER_TABS = ['summary', 'dealers', 'audit'];

export const useAccountabilityStore = create((set) => ({
  ...INITIAL,
  setTab: (tab) => set({ tab }),
  setRegionBasis: (regionBasis) => set({ regionBasis }),
  setPeriod: (period) => set({ period }),
  setPeer: (peer) => set({ peer }),
  setMinClaims: (minClaims) => set({ minClaims }),
  setFunnelMetric: (funnelMetric) => set({ funnelMetric }),
  setHeatMeasure: (heatMeasure) => set({ heatMeasure }),
  setAuditRule: (auditRule) => set({ auditRule }),
  setOpenOnly: (openOnly) => set({ openOnly }),
  setAuditSort: (auditSort) => set({ auditSort }),
  setH2hPart: (h2hPart) => set({ h2hPart }),
  setCaseStage: (caseStage) => set({ caseStage }),
  addChip: (key, value, label) =>
    set((s) => {
      const current = s.chips[key] || [];
      if (current.some((c) => c.value === value)) return s;
      return { chips: { ...s.chips, [key]: [...current, { value, label: label ?? value }] } };
    }),
  setChips: (key, chips) => set((s) => ({ chips: { ...s.chips, [key]: chips } })),
  removeChip: (key, value) =>
    set((s) => ({ chips: { ...s.chips, [key]: (s.chips[key] || []).filter((c) => c.value !== value) } })),
  clearLocal: () => set((s) => ({ ...INITIAL, tab: s.tab })),
  hydrate: (state) => set({ ...INITIAL, ...state }),
}));

// Effective region basis for the active tab
export function regionBasisFor(state) {
  if (state.regionBasis !== 'auto') return state.regionBasis;
  return DEALER_TABS.includes(state.tab) ? 'dealer' : 'vehicle';
}

// --- URL persistence: ?acc=<json> so a view can be shared (and the old routes can deep-link a tab)
const URL_KEYS = ['tab', 'regionBasis', 'chips', 'period', 'peer', 'minClaims', 'funnelMetric', 'heatMeasure',
  'auditRule', 'openOnly', 'auditSort', 'h2hPart', 'caseStage'];

export function readStateFromUrl(search) {
  try {
    const raw = new URLSearchParams(search).get('acc');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStateToUrl(state) {
  const subset = Object.fromEntries(URL_KEYS.map((k) => [k, state[k]]));
  const params = new URLSearchParams(window.location.search);
  params.set('acc', JSON.stringify(subset));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// Links into the other analytics modules with the same chips (their stores read ?ca= / ?rel=)
export function claimsAnalyticsHref(chips, tab = 'failure') {
  const caChips = Object.fromEntries(Object.entries(chips).filter(([, list]) => list.length));
  return `/claims-analytics?ca=${encodeURIComponent(JSON.stringify({ tab, chips: caChips }))}`;
}

export function reliabilityHref(partId, partName) {
  const chips = partId ? { part_id: [{ value: partId, label: partName || partId }] } : {};
  return `/reliability?rel=${encodeURIComponent(JSON.stringify({ tab: 'reliability', chips }))}`;
}
