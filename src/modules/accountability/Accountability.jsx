import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DatabaseZap, SlidersHorizontal, X } from 'lucide-react';
import { useFilterStore } from '../../store/useFilterStore';
import { useAccountabilityStore, readStateFromUrl, writeStateToUrl, claimsAnalyticsHref, regionBasisFor, CHIP_LABELS } from './store';
import { buildFilters, scorecardFilters, fetchLookups, fetchCaseDetail, BackendMissingError, PERIOD_LABELS } from './api';
import { useAsync } from '../../lib/analytics';
import { PageHeader, Segmented } from '../../components/analytics/ui';
import { ClaimDrawer } from '../claims-analytics/components/Drawers';
import SummaryTab from './components/SummaryTab';
import DealerTab from './components/DealerTab';
import AuditTab from './components/AuditTab';
import SupplierTab from './components/SupplierTab';
import RecoveryTab from './components/RecoveryTab';
import { DealerDrawer, SupplierDrawer, CaseDrawer } from './components/Drawers';

// Design: docs/modules/dealer-supplier-accountability/design.md (merges the old Dealer Intelligence and
// Supplier Subrogation pages)

const TABS = [
  { key: 'summary', label: 'Summary', Component: SummaryTab },
  { key: 'dealers', label: 'Dealer Network', Component: DealerTab },
  { key: 'audit', label: 'Dealer Audit', Component: AuditTab },
  { key: 'suppliers', label: 'Supplier Quality', Component: SupplierTab },
  { key: 'recovery', label: 'Recovery', Component: RecoveryTab },
];

export default function Accountability() {
  const global = useFilterStore();
  // Hydrate from the URL before the first render (deep links from /dealer-intelligence and /supplier-subrogation)
  useState(() => {
    const fromUrl = readStateFromUrl(window.location.search);
    if (fromUrl) useAccountabilityStore.getState().hydrate(fromUrl);
    return true;
  });
  const local = useAccountabilityStore();
  const [drawer, setDrawer] = useState(null);
  const [claimId, setClaimId] = useState(null);

  const { tab, regionBasis, chips, period, peer, minClaims, funnelMetric, heatMeasure, auditRule, openOnly, auditSort, h2hPart, caseStage } = local;
  useEffect(() => {
    writeStateToUrl(useAccountabilityStore.getState());
  }, [tab, regionBasis, chips, period, peer, minClaims, funnelMetric, heatMeasure, auditRule, openOnly, auditSort, h2hPart, caseStage]);

  const filters = buildFilters(global, local);
  const fkey = JSON.stringify(filters);
  const scoreFilters = scorecardFilters(filters, period);
  const lookupsState = useAsync(fetchLookups, 'lookups');
  const lookups = lookupsState.data;
  const effectiveMin = minClaims ?? lookups?.config.minClaims ?? 10;

  const labelFor = (key, value) => {
    if (key === 'dealer_id') return lookups?.dealers.find((d) => d.dealer_id === value)?.dealer_name;
    if (key === 'supplier_id') return lookups?.suppliers.find((s) => s.supplier_id === value)?.supplier_name;
    if (key === 'part_id') return lookups?.partById[value]?.part_name;
    return value;
  };
  const actions = {
    setTab: local.setTab,
    addChip: (key, value, label) => local.addChip(key, value, label ?? labelFor(key, value)),
    setRegion: (region) => global.setRegion(region),
    openDealer: (dealerId) => setDrawer({ kind: 'dealer', id: dealerId }),
    openSupplier: (supplierId) => setDrawer({ kind: 'supplier', id: supplierId }),
    openCase: (caseId) => setDrawer({ kind: 'case', id: caseId }),
    openClaim: (id) => setClaimId(id),
    openAuditRule: (rule) => {
      local.setAuditRule(rule);
      local.setTab('audit');
    },
  };

  const ActiveTab = (TABS.find((t) => t.key === tab) || TABS[0]).Component;

  return (
    <div className="space-y-4">
      <Header chips={chips} />
      <FilterBar local={local} lookups={lookups} />

      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => local.setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <TabBoundary>
        <ActiveTab filters={filters} fkey={fkey} scoreFilters={scoreFilters} local={local} lookups={lookups} actions={actions}
          periodLabel={PERIOD_LABELS[period]} />
      </TabBoundary>

      {drawer?.kind === 'dealer' && (
        <DealerDrawer dealerId={drawer.id} filters={filters} scoreFilters={scorecardFilters({ ...filters, region_basis: 'dealer' }, period)} peer={peer}
          config={lookups?.config} minClaims={effectiveMin} onClose={() => setDrawer(null)} onOpenClaim={setClaimId} />
      )}
      {drawer?.kind === 'supplier' && (
        <SupplierDrawer supplierId={drawer.id} filters={{ ...filters, region_basis: 'vehicle' }} scoreFilters={scorecardFilters({ ...filters, region_basis: 'vehicle' }, period)}
          config={lookups?.config} minClaims={effectiveMin} partIdByName={lookups?.partIdByName}
          onClose={() => setDrawer(null)} onOpenCase={actions.openCase} onOpenClaim={setClaimId} />
      )}
      {drawer?.kind === 'case' && <CaseDrawer caseId={drawer.id} onClose={() => setDrawer(null)} onOpenClaim={setClaimId} />}
      {claimId && (
        <ClaimDrawer claimId={claimId} onClose={() => setClaimId(null)}
          onOpenEntity={(type, name) => {
            setClaimId(null);
            if (type === 'dealer' && lookups?.dealerIdByName[name]) actions.openDealer(lookups.dealerIdByName[name]);
            if (type === 'part' && lookups?.partIdByName[name]) actions.addChip('part_id', lookups.partIdByName[name], name);
          }} />
      )}
    </div>
  );
}

// Shows the "apply the migrations" message instead of a page of errors when wty_acc_* is missing
function TabBoundary({ children }) {
  const probe = useAsync(() => fetchCaseDetail('probe'), 'probe');  // cheap: one primary-key lookup
  if (probe.error instanceof BackendMissingError) return <BackendMissing />;
  return children;
}

function BackendMissing() {
  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-8 text-center max-w-2xl mx-auto">
      <DatabaseZap className="w-10 h-10 text-amber-500 mx-auto" />
      <h2 className="text-lg font-bold text-slate-900 mt-3">Accountability database objects are not installed</h2>
      <p className="text-sm text-slate-600 mt-2">
        This page reads from the <code className="text-xs bg-slate-100 px-1 rounded">wty_acc_*</code> database functions. Apply migrations
        013 → 017 from <code className="text-xs bg-slate-100 px-1 rounded">docs/schema/migrations/</code>, then reload.
      </p>
    </div>
  );
}

function Header({ chips }) {
  return (
    <PageHeader title="Dealer & Supplier Accountability" page={4}
      description="Which dealers and suppliers drive avoidable or recoverable warranty cost, and how much comes back.">
      <p>Amounts in ₹ (INR) · data as of 2026-09-24 · recovery lifecycle is a labelled demo seed</p>
      <Link to={claimsAnalyticsHref(chips)} className="inline-block font-semibold text-blue-700 hover:underline">Open in Claims &amp; Repair ↗</Link>
    </PageHeader>
  );
}

const STATIC_GROUPS = [
  { key: 'dealer_tier', label: 'Dealer tier', options: ['Platinum', 'Gold', 'Silver'] },
  { key: 'liability_type', label: 'Liability', options: ['OEM', 'Supplier'] },
  { key: 'status_group', label: 'Status group', options: ['Open', 'Approved', 'Rejected'] },
  { key: 'risk_band', label: 'AI risk band', options: ['Low', 'Medium', 'High'] },
];

function FilterBar({ local, lookups }) {
  const [open, setOpen] = useState(false);
  const chipEntries = Object.entries(local.chips).flatMap(([key, list]) => list.map((c) => ({ key, ...c })));
  const toggle = (key, value, label) => {
    if ((local.chips[key] || []).some((c) => c.value === value)) local.removeChip(key, value);
    else local.addChip(key, value, label);
  };
  const groups = [
    ...STATIC_GROUPS.map((g) => ({ ...g, options: g.options.map((v) => ({ value: v, label: v })) })),
    { key: 'claim_source', label: 'Claim source', options: [{ value: 'seed', label: 'Seed' }, { value: 'telematics_sim', label: 'Telematics' }] },
    { key: 'subsystem', label: 'Subsystem', options: (lookups?.subsystems || []).map((v) => ({ value: v, label: v })) },
    { key: 'supplier_id', label: 'Supplier', options: (lookups?.suppliers || []).map((s) => ({ value: s.supplier_id, label: s.supplier_name })) },
  ];
  const effectiveBasis = regionBasisFor(local);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Region basis</span>
          <Segmented value={local.regionBasis} onChange={local.setRegionBasis}
            options={[{ value: 'auto', label: `Auto (${effectiveBasis})` }, { value: 'dealer', label: 'Dealer' }, { value: 'vehicle', label: 'Vehicle' }]} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Scorecard period</span>
          <Segmented value={local.period} onChange={local.setPeriod} options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }))} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Dealer</span>
          <select value={local.chips.dealer_id?.[0]?.value || ''}
            onChange={(e) => local.setChips('dealer_id', e.target.value ? [{ value: e.target.value, label: lookups?.dealers.find((d) => d.dealer_id === e.target.value)?.dealer_name }] : [])}
            className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white max-w-[12rem]">
            <option value="">All dealers</option>
            {(lookups?.dealers || []).map((d) => <option key={d.dealer_id} value={d.dealer_id}>{d.dealer_name}{d.status === 'Suspended' ? ' (suspended)' : ''}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Part</span>
          <select value={local.chips.part_id?.[0]?.value || ''}
            onChange={(e) => local.setChips('part_id', e.target.value ? [{ value: e.target.value, label: lookups?.partById[e.target.value]?.part_name }] : [])}
            className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white max-w-[12rem]">
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
