import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DatabaseZap, SlidersHorizontal, X } from 'lucide-react';
import { useFilterStore } from '../../store/useFilterStore';
import { useReliabilityStore, readStateFromUrl, writeStateToUrl, claimsAnalyticsHref, CHIP_LABELS } from './store';
import { buildFilters, fetchLookups, fetchWeibull, BackendMissingError } from './api';
import { useAsync } from '../../lib/analytics';
import { Segmented } from '../../components/analytics/ui';
import { ClaimDrawer } from '../claims-analytics/components/Drawers';
import SignalsTab from './components/SignalsTab';
import ReliabilityTab from './components/ReliabilityTab';
import ForecastTab from './components/ForecastTab';
import SignalDrawer from './components/SignalDrawer';

// Design: docs/modules/reliability-early-warning/design.md (merges the old EWS and Predictive Calibration pages)

const TABS = [
  { key: 'signals', label: 'Signals', Component: SignalsTab },
  { key: 'reliability', label: 'Reliability', Component: ReliabilityTab },
  { key: 'forecast', label: 'Forecast & Coverage', Component: ForecastTab },
];

export default function Reliability() {
  const global = useFilterStore();
  // Hydrate from the URL before the first render: otherwise a deep link (?rel=…) first renders and fetches
  // the default tab. Idempotent, so StrictMode's double call is harmless. Every later change is mirrored to the URL.
  useState(() => {
    const fromUrl = readStateFromUrl(window.location.search);
    if (fromUrl) useReliabilityStore.getState().hydrate(fromUrl);
    return true;
  });
  const local = useReliabilityStore();
  const [drawer, setDrawer] = useState(null);
  const [claimId, setClaimId] = useState(null);

  const { tab, regionBasis, chips, groupBy, grain, basis, compare, horizon, minBand, beforeExpiryOnly } = local;
  useEffect(() => {
    writeStateToUrl(useReliabilityStore.getState());
  }, [tab, regionBasis, chips, groupBy, grain, basis, compare, horizon, minBand, beforeExpiryOnly]);

  const filters = buildFilters(global, local);
  const fkey = JSON.stringify(filters);
  const lookupsState = useAsync(fetchLookups, 'lookups');
  const lookups = lookupsState.data;

  const actions = {
    openSignal: (signal) => setDrawer({ kind: 'signal', signal }),
    openCluster: (clusterId) => setDrawer({ kind: 'cluster', clusterId, cluster: lookups?.clusterById?.[clusterId] }),
    focusPart: (partId, partName, nextTab = 'reliability') => {
      local.setChips('part_id', [{ value: partId, label: partName || partId }]);
      local.setTab(nextTab);
      setDrawer(null);
    },
  };

  const partId = chips.part_id?.[0]?.value || null;
  const ActiveTab = (TABS.find((t) => t.key === tab) || TABS[0]).Component;

  return (
    <div className="space-y-4">
      <Header chips={chips} />
      <FilterBar local={local} lookups={lookups} />

      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => local.setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <TabBoundary>
        <ActiveTab filters={filters} fkey={fkey} local={local} lookups={lookups} actions={actions} partId={partId} />
      </TabBoundary>

      {drawer && (
        <SignalDrawer target={drawer} filters={filters} onClose={() => setDrawer(null)}
          onOpenClaim={(id) => setClaimId(id)}
          onFocusPart={(id, name) => actions.focusPart(id, name)}
          onOpenInClaims={() => {
            // carry the signal's group across as the matching global filter
            const s = drawer.signal;
            if (s?.dim === 'variant') global.setVariant(s.grp);
            if (s?.dim === 'customer_type') global.setCustomerType(s.grp);
            if (s?.dim === 'vehicle_region') global.setRegion(s.grp);
          }} />
      )}
      {claimId && <ClaimDrawer claimId={claimId} onClose={() => setClaimId(null)} onOpenEntity={() => setClaimId(null)} />}
    </div>
  );
}

// Shows the "apply the migrations" message instead of a page of errors when wty_rel_* is missing
function TabBoundary({ children }) {
  const probe = useAsync(() => fetchWeibull('', 'mis', 'all'), 'probe');  // cheap: one index read
  if (probe.error instanceof BackendMissingError) return <BackendMissing />;
  return children;
}

function BackendMissing() {
  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-8 text-center max-w-2xl mx-auto">
      <DatabaseZap className="w-10 h-10 text-amber-500 mx-auto" />
      <h2 className="text-lg font-bold text-slate-900 mt-3">Reliability database objects are not installed</h2>
      <p className="text-sm text-slate-600 mt-2">
        This page reads from the <code className="text-xs bg-slate-100 px-1 rounded">wty_rel_*</code> database functions. Apply migrations
        008 → 012 from <code className="text-xs bg-slate-100 px-1 rounded">docs/schema/migrations/</code>, then reload.
      </p>
    </div>
  );
}

function Header({ chips }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reliability &amp; Early Warning</h1>
        <p className="text-slate-500 text-sm mt-0.5">Detect emerging failures, check part durability against design, and forecast warranty exposure.</p>
      </div>
      <div className="text-xs text-slate-500 md:text-right space-y-1">
        <p>Amounts in ₹ (INR) · distance in km · data as of 2026-09-24</p>
        <Link to={claimsAnalyticsHref(chips)} className="inline-block font-semibold text-sky-700 hover:underline">Open in Claims &amp; Repair ↗</Link>
      </div>
    </div>
  );
}

const SOURCE_OPTIONS = [{ value: 'seed', label: 'Seed' }, { value: 'telematics_sim', label: 'Telematics' }];

function FilterBar({ local, lookups }) {
  const [open, setOpen] = useState(false);
  const chipEntries = Object.entries(local.chips).flatMap(([key, list]) => list.map((c) => ({ key, ...c })));
  const toggle = (key, value, label) => {
    if ((local.chips[key] || []).some((c) => c.value === value)) local.removeChip(key, value);
    else local.addChip(key, value, label);
  };
  const groups = [
    { key: 'subsystem', label: 'Subsystem', options: (lookups?.subsystems || []).map((v) => ({ value: v, label: v })) },
    { key: 'claim_source', label: 'Claim source', options: SOURCE_OPTIONS },
    { key: 'risk_band', label: 'AI risk band', options: ['Low', 'Medium', 'High'].map((v) => ({ value: v, label: v })) },
    { key: 'cluster_id', label: 'Failure cluster', options: Object.values(lookups?.clusterById || {}).map((c) => ({ value: c.cluster_id, label: c.cluster_id })) },
  ];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Region basis</span>
          <Segmented value={local.regionBasis} onChange={local.setRegionBasis} options={[{ value: 'vehicle', label: 'Vehicle' }, { value: 'dealer', label: 'Dealer' }]} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Part</span>
          <select value={local.chips.part_id?.[0]?.value || ''}
            onChange={(e) => local.setChips('part_id', e.target.value ? [{ value: e.target.value, label: lookups?.partById?.[e.target.value]?.part_name }] : [])}
            className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white max-w-xs">
            <option value="">All parts</option>
            {(lookups?.parts || []).map((p) => <option key={p.part_id} value={p.part_id}>{p.part_name}</option>)}
          </select>
        </label>
        <div className="flex-1" />
        <button type="button" onClick={() => setOpen((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium border rounded-md px-2.5 py-1.5 ${open ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> More filters {chipEntries.length > 0 && <span className="bg-sky-600 text-white rounded-full px-1.5 text-[10px]">{chipEntries.length}</span>}
        </button>
        {chipEntries.length > 0 && <button type="button" onClick={local.clearLocal} className="text-xs text-slate-500 hover:text-rose-600">Clear all</button>}
      </div>

      {chipEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {chipEntries.map((c) => (
            <span key={`${c.key}-${c.value}`} className="inline-flex items-center gap-1 text-[11px] bg-sky-50 text-sky-800 border border-sky-200 rounded-full pl-2 pr-1 py-0.5">
              <span className="text-sky-500">{CHIP_LABELS[c.key] || c.key}:</span> {c.label}
              <button type="button" onClick={() => local.removeChip(c.key, c.value)} className="hover:bg-sky-100 rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((opt) => {
                  const selected = (local.chips[g.key] || []).some((c) => c.value === opt.value);
                  return (
                    <button key={opt.value} type="button" onClick={() => toggle(g.key, opt.value, opt.label)}
                      className={`text-[11px] px-2 py-0.5 rounded border ${selected ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
