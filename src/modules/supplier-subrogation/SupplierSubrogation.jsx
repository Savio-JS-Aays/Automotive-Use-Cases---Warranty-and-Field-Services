import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  AlertTriangle,
  FileCheck2,
  Percent,
  Gauge,
  ShieldAlert,
  Route,
  Loader2,
  TrendingUp,
  Search
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useFilterStore } from '../../store/useFilterStore';
import { fetchSupplierSubrogationData } from './api';

function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

const TABS = [
  { key: 'quality', label: 'Quality & Reliability' },
  { key: 'financial', label: 'Financial Exposure' },
  { key: 'batch', label: 'Batch Root Cause' },
  { key: 'geo', label: 'Geographic Impact' },
];

const STATUS_BADGE_STYLES = {
  Invoiced: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-600 border-amber-200',
  Disputed: 'bg-rose-50 text-rose-600 border-rose-200',
  'In Review': 'bg-sky-50 text-sky-600 border-sky-200',
};

const CHART_COLORS = ['#0ea5e9', '#6366f1', '#f97316', '#10b981', '#f43f5e', '#a855f7'];

// ---------------------------------------------------------------------------
// Shared building blocks (Dealer Intelligence Style)
// ---------------------------------------------------------------------------

function MasterKpiCard({ label, value, subtext, icon: Icon, iconColor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`p-1.5 rounded-md bg-slate-50 border border-slate-100 ${iconColor}`}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{subtext}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mb-6">{subtitle}</p>}
      {!subtitle && <div className="mb-6" />}
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES['In Review'];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Quality & Reliability
// ---------------------------------------------------------------------------
function QualityTab({ tab }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MasterKpiCard label="Defect PPM" value={tab?.ppm ?? 0} subtext="Parts Per Million" icon={Gauge} iconColor="text-slate-600" />
        <MasterKpiCard label="NFF Rate" value={`${tab?.nffRate ?? 0}%`} subtext="No Fault Found" icon={AlertTriangle} iconColor="text-amber-600" />
        <MasterKpiCard label="Avg Mileage" value={(tab?.avgMileage || 0).toLocaleString()} subtext="At failure" icon={Route} iconColor="text-sky-600" />
        <MasterKpiCard label="Risk Score" value={tab?.riskScore ?? 0} subtext="Supplier Composite" icon={ShieldAlert} iconColor="text-rose-600" />
      </div>

      <ChartCard title="Top Failure Modes" subtitle="Reported repair count by failure mode">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tab?.failureModes || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mode" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={48}>
                {(tab?.failureModes || []).map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Financial Exposure
// ---------------------------------------------------------------------------
function FinancialTab({ tab }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="Recovery Pipeline" subtitle="Exposure by stage, $ USD">
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tab?.funnelData || []} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Subrogation Cases</h3>
            <p className="text-xs text-slate-400">Supplier chargeback status</p>
          </div>
          <Search className="w-4 h-4 text-slate-400" />
        </div>
        <div className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 bg-white border-b border-slate-200">
                <th className="py-3 px-5">ID</th>
                <th className="py-3 px-5">Supplier</th>
                <th className="py-3 px-5 text-right">Exposure</th>
                <th className="py-3 px-5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(tab?.subrogationTable || []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-5 font-mono text-xs text-slate-500">{row.id}</td>
                  <td className="py-3 px-5 font-medium text-slate-900">{row.supplierName}</td>
                  <td className="py-3 px-5 text-right text-slate-600 font-medium">{formatCurrency(row.exposure)}</td>
                  <td className="py-3 px-5 text-center"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Batch Root Cause (Fixes missing Heatmap)
// ---------------------------------------------------------------------------
function BatchTab({ tab }) {
  // Helper to determine cell color based on failure intensity
  const getHeatmapColor = (val) => {
    if (val === 0) return 'bg-slate-50 text-slate-300';
    if (val < 5) return 'bg-rose-50 text-rose-600';
    if (val < 20) return 'bg-rose-100 text-rose-700 font-medium';
    if (val < 80) return 'bg-rose-300 text-rose-900 font-semibold';
    return 'bg-rose-500 text-white font-bold';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MasterKpiCard label="Worst Batch" value={tab?.worstBatch || '—'} subtext="Highest failure volume" icon={AlertTriangle} iconColor="text-rose-600" />
        <MasterKpiCard label="Quarantine Status" value={tab?.quarantineStatus || '—'} subtext="Inventory block applied" icon={ShieldAlert} iconColor="text-rose-600" />
      </div>

      <ChartCard title="Batch Survival Heatmap" subtitle="Failure density by production batch over months in service">
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 w-40">Production Batch</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500">Month 1</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500">Month 2</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500">Month 3</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500">Month 4</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500">Month 5</th>
              </tr>
            </thead>
            <tbody>
              {(tab?.batchHeatmap || []).map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 px-4 text-left font-mono text-xs font-medium text-slate-700 bg-white border-r border-slate-100">
                    {row.batch}
                  </td>
                  {row.data.map((val, idx) => (
                    <td key={idx} className="p-1 border-r border-slate-100 last:border-0">
                      <div className={`w-full h-10 rounded-md flex items-center justify-center text-sm transition-colors ${getHeatmapColor(val)}`}>
                        {val}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Geographic Impact
// ---------------------------------------------------------------------------
function GeoTab({ tab }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1">
        <MasterKpiCard label="Primary Context Trigger" value={tab?.primaryTrigger || '—'} subtext="Highest correlated telemetry condition" icon={TrendingUp} iconColor="text-sky-600" />
      </div>

      <ChartCard title="Failures by Region" subtitle="Reported failures distributed geographically">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tab?.geoDistribution || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="region" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="failures" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------
export default function SupplierSubrogation() {
  const filters = useFilterStore();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('quality');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchSupplierSubrogationData(filters);
        if (!isCancelled) setData(result);
      } catch (err) {
        if (!isCancelled) setError(err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => { isCancelled = true; };
  }, [filters]);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full text-slate-400">
        <Loader2 className="w-6 h-6 mr-3 animate-spin text-sky-500" />
        <span className="text-sm font-medium">Loading Supplier Intelligence...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 flex items-center justify-center h-full text-rose-500 bg-rose-50 rounded-xl m-6">
        <AlertTriangle className="w-5 h-5 mr-2" />
        <span className="text-sm font-medium">Failed to load supplier subrogation data.</span>
      </div>
    );
  }

  const { pipelineKpis, tab1_quality, tab2_financial, tab3_batch, tab4_geo } = data;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header & Tabs (Dealer Intelligence Layout) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Supplier Subrogation Analytics</h2>
          <p className="text-sm text-slate-500 mt-1">Financial recovery pipeline and root cause performance tracking.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg self-start xl:self-auto overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                  isActive
                    ? 'bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Master Pipeline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MasterKpiCard label="Total Exposure" value={formatCurrency(pipelineKpis?.exposure)} subtext="Pending liable defects" icon={DollarSign} iconColor="text-rose-500" />
        <MasterKpiCard label="Verified Failures" value={(pipelineKpis?.failures || 0).toLocaleString()} subtext="Confirmed supplier fault" icon={AlertTriangle} iconColor="text-amber-500" />
        <MasterKpiCard label="Ready to Invoice" value={formatCurrency(pipelineKpis?.readyToInvoice)} subtext="Pending chargebacks" icon={FileCheck2} iconColor="text-sky-500" />
        <MasterKpiCard label="Recovery Rate" value={`${pipelineKpis?.recoveryRate ?? 0}%`} subtext="Yield vs Exposure" icon={Percent} iconColor="text-emerald-500" />
      </div>

      {/* Dynamic Tab Content */}
      <div className="pb-8">
        {activeTab === 'quality' && <QualityTab tab={tab1_quality} />}
        {activeTab === 'financial' && <FinancialTab tab={tab2_financial} />}
        {activeTab === 'batch' && <BatchTab tab={tab3_batch} />}
        {activeTab === 'geo' && <GeoTab tab={tab4_geo} />}
      </div>
    </div>
  );
}