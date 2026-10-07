import { create } from 'zustand';

// Local (module-level) filters for Claims & Repair Analytics. Global filters stay in useFilterStore.
// chips: { <filter key from the p_filters contract>: [{ value, label }] }

const INITIAL = {
  tab: 'summary',
  dateBasis: 'submission',
  regionBasis: 'vehicle',
  chips: {},
  nff: null,
  repeatOnly: false,
  overrunOnly: false,
  roScope: 'warranty',
};

export const CHIP_LABELS = {
  status_group: 'Status group',
  status: 'Status',
  liability_type: 'Liability',
  claim_source: 'Source',
  risk_band: 'Risk',
  subsystem: 'Subsystem',
  part_id: 'Part',
  supplier_id: 'Supplier',
  dealer_id: 'Dealer',
  dealer_tier: 'Dealer tier',
  mis_bucket: 'MIS',
  km_bucket: 'km',
  cluster_id: 'Cluster',
  visit_type: 'Visit type',
};

export const useClaimsAnalyticsStore = create((set) => ({
  ...INITIAL,
  setTab: (tab) => set({ tab }),
  setDateBasis: (dateBasis) => set({ dateBasis }),
  setRegionBasis: (regionBasis) => set({ regionBasis }),
  setNff: (nff) => set({ nff }),
  setRepeatOnly: (repeatOnly) => set({ repeatOnly }),
  setOverrunOnly: (overrunOnly) => set({ overrunOnly }),
  setRoScope: (roScope) => set({ roScope }),
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

// --- URL persistence: ?ca=<json> so a filtered view can be shared ---------------------------
// regionBasis and dateBasis are not persisted: their controls were removed, so they stay at the defaults (vehicle, submission)
const URL_KEYS = ['tab', 'chips', 'nff', 'repeatOnly', 'overrunOnly', 'roScope'];

export function readStateFromUrl(search) {
  try {
    const raw = new URLSearchParams(search).get('ca');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStateToUrl(state) {
  const subset = Object.fromEntries(URL_KEYS.map((k) => [k, state[k]]));
  const params = new URLSearchParams(window.location.search);
  params.set('ca', JSON.stringify(subset));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}
