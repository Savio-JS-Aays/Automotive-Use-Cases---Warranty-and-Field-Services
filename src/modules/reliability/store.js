import { create } from 'zustand';

// Local (module-level) filters for Reliability & Early Warning. Global filters stay in useFilterStore.
// chips: { <filter key from the p_filters contract>: [{ value, label }] }

const INITIAL = {
  tab: 'signals',
  regionBasis: 'vehicle',
  chips: {},
  groupBy: 'variant',
  grain: 'month',
  basis: 'mis',
  compare: 'all',
  horizon: 12,
  minBand: 'Medium',
  beforeExpiryOnly: false,
};

export const CHIP_LABELS = {
  subsystem: 'Subsystem',
  part_id: 'Part',
  supplier_id: 'Supplier',
  cluster_id: 'Cluster',
  claim_source: 'Source',
  risk_band: 'Risk',
};

export const useReliabilityStore = create((set) => ({
  ...INITIAL,
  setTab: (tab) => set({ tab }),
  setRegionBasis: (regionBasis) => set({ regionBasis }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setGrain: (grain) => set({ grain }),
  setBasis: (basis) => set({ basis }),
  setCompare: (compare) => set({ compare }),
  setHorizon: (horizon) => set({ horizon }),
  setMinBand: (minBand) => set({ minBand }),
  setBeforeExpiryOnly: (beforeExpiryOnly) => set({ beforeExpiryOnly }),
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

// --- URL persistence: ?rel=<json> so a view can be shared (and /ews, /predictive-calibration can deep-link a tab)
// regionBasis is not persisted: its control was removed, so it always stays at the default (vehicle)
const URL_KEYS = ['tab', 'chips', 'groupBy', 'grain', 'basis', 'compare', 'horizon', 'minBand', 'beforeExpiryOnly'];

export function readStateFromUrl(search) {
  try {
    const raw = new URLSearchParams(search).get('rel');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStateToUrl(state) {
  const subset = Object.fromEntries(URL_KEYS.map((k) => [k, state[k]]));
  const params = new URLSearchParams(window.location.search);
  params.set('rel', JSON.stringify(subset));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// Link into Claims & Repair with the same chips (its store reads ?ca=<json>)
export function claimsAnalyticsHref(chips, tab = 'failure') {
  const caChips = Object.fromEntries(Object.entries(chips).filter(([, list]) => list.length));
  return `/claims-analytics?ca=${encodeURIComponent(JSON.stringify({ tab, chips: caChips }))}`;
}
