import React, { useEffect, useState } from 'react';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { endOfMonth, endOfQuarter, endOfWeek } from 'date-fns';
import { useFilterStore } from '../../store/useFilterStore';
import { useClaimsAnalyticsStore, readStateFromUrl, writeStateToUrl } from './store';
import { buildFilters, fetchKpis, fetchLookups, BackendMissingError } from './api';
import { useAsync } from './lib';
import { KpiCard } from '../../components/analytics/ui';
import FilterBar from './components/FilterBar';
import SummaryTab from './components/SummaryTab';
import FailureTab from './components/FailureTab';
import LaborTab from './components/LaborTab';
import LifecycleTab from './components/LifecycleTab';
import ExplorerTab from './components/ExplorerTab';
import { ClaimDrawer, EntityDrawer } from './components/Drawers';
import { formatINR, formatNumber, formatPct } from '../../lib/format';

// Design: docs/modules/claims-repair-analytics/design.md

const TABS = [
  { key: 'summary', label: 'Summary', Component: SummaryTab },
  { key: 'failure', label: 'Failure Analysis', Component: FailureTab },
  { key: 'labor', label: 'Repair Orders & Labor', Component: LaborTab },
  { key: 'lifecycle', label: 'Claim Lifecycle', Component: LifecycleTab },
  { key: 'explorer', label: 'Claim Explorer', Component: ExplorerTab },
];

function BackendMissing() {
  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-8 text-center max-w-2xl mx-auto">
      <DatabaseZap className="w-10 h-10 text-amber-500 mx-auto" />
      <h2 className="text-lg font-bold text-slate-900 mt-3">Analytics database objects are not installed</h2>
      <p className="text-sm text-slate-600 mt-2">
        This page reads from the <code className="text-xs bg-slate-100 px-1 rounded">wty_ca_*</code> database functions. Apply migrations
        001 → 005 from <code className="text-xs bg-slate-100 px-1 rounded">docs/schema/migrations/</code> (see its README for the approval
        and verification steps), then reload.
      </p>
    </div>
  );
}

export default function ClaimsAnalytics() {
  const global = useFilterStore();
  // Hydrate from the URL before the first render, so a deep link (?ca=…) never renders, and fetches for,
  // the default tab. Idempotent, so StrictMode's double call is harmless. Every later change is mirrored to the URL.
  useState(() => {
    const fromUrl = readStateFromUrl(window.location.search);
    if (fromUrl) useClaimsAnalyticsStore.getState().hydrate(fromUrl);
    return true;
  });
  const local = useClaimsAnalyticsStore();
  const [claimId, setClaimId] = useState(null);
  const [entity, setEntity] = useState(null);

  const { tab, dateBasis, regionBasis, chips, nff, repeatOnly, overrunOnly, roScope } = local;
  useEffect(() => {
    writeStateToUrl(useClaimsAnalyticsStore.getState());
  }, [tab, dateBasis, regionBasis, chips, nff, repeatOnly, overrunOnly, roScope]);

  // cheap to rebuild; fkey (serialised filters) is what triggers re-fetching
  const filters = buildFilters(global, local);
  const fkey = JSON.stringify(filters);

  const lookupsState = useAsync(fetchLookups, 'lookups');
  const lookups = lookupsState.data;
  const kpis = useAsync(() => fetchKpis(filters), fkey);

  const actions = {
    ...local,
    addChip: local.addChip,
    addNamedChip: (kind, name) => {
      const row = kind === 'part' ? lookups?.partByName[name] : kind === 'dealer' ? lookups?.dealerByName[name] : lookups?.supplierByName[name];
      if (row) local.addChip(`${kind}_id`, row[`${kind}_id`], name);
    },
    openEntity: (type, name) => {
      const row = type === 'dealer' ? lookups?.dealerByName[name] : lookups?.partByName[name];
      if (row) setEntity({ type, name, id: row[`${type}_id`] });
    },
    openClaim: (id) => setClaimId(id),
    setVariant: global.setVariant,
    setCustomerType: global.setCustomerType,
    narrowToPeriod: (periodStart, grain) => {
      const from = new Date(`${String(periodStart).slice(0, 10)}T00:00:00`);
      const to = grain === 'week' ? endOfWeek(from, { weekStartsOn: 1 }) : grain === 'quarter' ? endOfQuarter(from) : endOfMonth(from);
      global.setDateRange({ from, to });
    },
  };

  if (kpis.error instanceof BackendMissingError) {
    return (
      <div className="space-y-6">
        <Header />
        <BackendMissing />
      </div>
    );
  }

  const cur = kpis.data?.current || {};
  const prev = kpis.data?.previous || {};
  const kpiCards = [
    { label: 'Claims', value: formatNumber(cur.claims), current: cur.claims, previous: prev.claims, betterWhen: 'down', sub: 'in period', tab: 'summary',
      info: 'Claims submitted in the selected period (or adjudicated, if date basis = adjudication) matching all filters.' },
    { label: 'Claim cost', value: formatINR(cur.cost_inr), current: cur.cost_inr, previous: prev.cost_inr, betterWhen: 'down', sub: `avg ${formatINR(cur.avg_cost_inr)}`, tab: 'failure',
      info: 'Sum of claim amounts in INR. Seed claims use a derived amount (part cost + billed hours × ₹1,500/h).' },
    { label: 'Per 1,000 VIS', value: formatNumber(cur.claims_per_1000_vis, 1), current: cur.claims_per_1000_vis, previous: prev.claims_per_1000_vis, betterWhen: 'down', sub: `${formatINR(cur.cost_per_vis_inr)} / vehicle`, tab: 'summary',
      info: 'Claims per 1,000 vehicles in service (average over the period). Normalises for fleet growth.' },
    { label: 'Approval rate', value: formatPct(cur.approval_rate), current: cur.approval_rate, previous: prev.approval_rate, deltaMode: 'pp', sub: `rejected ${formatPct(cur.rejection_rate)}`, tab: 'lifecycle',
      info: 'Paid ÷ (Paid + Rejected). Open claims are excluded.' },
    { label: 'Cycle time', value: cur.avg_cycle_days === undefined || cur.avg_cycle_days === null ? '—' : `${cur.avg_cycle_days} d`, current: cur.avg_cycle_days, previous: prev.avg_cycle_days, betterWhen: 'down', deltaMode: 'abs', sub: `P90 ${cur.p90_cycle_days ?? '—'} d`, tab: 'lifecycle',
      info: 'Average (and 90th percentile) days from submission to adjudication.' },
    { label: 'Open backlog', value: formatNumber(cur.open_claims), current: cur.open_claims, previous: prev.open_claims, betterWhen: 'down', sub: `${formatINR(cur.open_value_inr)} · ${formatNumber(cur.open_aged_over_30d)} > 30 d`, tab: 'lifecycle',
      info: 'Open + Submitted + In Review claims, their value, and how many are older than 30 days at the as-of date.' },
    { label: 'Recovery rate', value: formatPct(cur.recovery_rate), current: cur.recovery_rate, previous: prev.recovery_rate, betterWhen: 'up', deltaMode: 'pp', sub: `${formatINR(cur.unrecovered_supplier_inr)} unrecovered`, tab: 'failure',
      info: 'Recovered from suppliers ÷ supplier-liable paid claim cost.' },
    { label: 'Labor overrun', value: formatPct(cur.labor_overrun_rate), current: cur.labor_overrun_rate, previous: prev.labor_overrun_rate, betterWhen: 'down', deltaMode: 'pp', sub: `${formatINR(cur.excess_labor_cost_inr)} excess`, tab: 'labor',
      info: 'Share of claim repair orders billed above the SRT maximum allowable hours; excess = hours above max × ₹1,500/h.' },
  ];

  const ActiveTab = (TABS.find((t) => t.key === local.tab) || TABS[0]).Component;

  return (
    <div className="space-y-4">
      <Header asOf={kpis.data?.as_of} />
      <FilterBar local={local} actions={actions} subsystems={lookups?.subsystems} />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.loading && !kpis.data
          ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 h-[104px] flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
            </div>
          ))
          : kpiCards.map((k) => <KpiCard key={k.label} {...k} onClick={() => local.setTab(k.tab)} />)}
      </div>
      {kpis.error && <p className="text-xs text-rose-600">KPIs failed to load: {kpis.error.message}</p>}

      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => local.setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              local.tab === t.key ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <ActiveTab filters={filters} fkey={fkey} actions={actions} local={local} lookups={lookups} />

      {claimId && (
        <ClaimDrawer claimId={claimId} onClose={() => setClaimId(null)}
          onOpenEntity={(type, name) => { setClaimId(null); actions.openEntity(type, name); }} />
      )}
      {entity && (
        <EntityDrawer entity={entity} filters={filters} networkKpis={cur} onClose={() => setEntity(null)}
          onApplyFilter={() => { local.addChip(`${entity.type}_id`, entity.id, entity.name); local.setTab('explorer'); setEntity(null); }} />
      )}
    </div>
  );
}

function Header({ asOf }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Claims &amp; Repair Analytics</h1>
        <p className="text-slate-500 text-sm mt-0.5">Warranty claims and repair orders: cost, failures, labor billing and claim processing.</p>
      </div>
      <div className="text-xs text-slate-500 md:text-right">
        <p>Amounts in ₹ (INR) · distance in km</p>
        {asOf && <p>Data as of <strong>{asOf}</strong></p>}
      </div>
    </div>
  );
}
