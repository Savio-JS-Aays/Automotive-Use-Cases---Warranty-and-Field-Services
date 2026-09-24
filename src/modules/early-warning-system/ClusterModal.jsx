import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Info,
  FileText,
  Car,
  DollarSign,
  CalendarClock,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function KpiCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="w-4 h-4" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function DetectionTimeline({ timeline }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
        Detection Timeline
      </h4>
      <ol className="relative pl-5 mt-2">
        {timeline.map((item, idx) => {
          const isLast = idx === timeline.length - 1;
          return (
            <li key={`${item.step}-${idx}`} className="relative pb-6 last:pb-0">
              {!isLast && (
                <span
                  className="absolute left-[-15px] top-3 w-px bg-slate-200"
                  style={{ height: 'calc(100% - 4px)' }}
                />
              )}
              <span className="absolute left-[-19px] top-1 w-2.5 h-2.5 rounded-full bg-purple-500 ring-4 ring-purple-50" />
              <p className="text-sm font-bold text-slate-800">{item.step}</p>
              <p className="text-xs text-slate-400 mt-0.5">{item.date}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SupplierLinkage({ suppliers }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 h-full">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
        Supplier Linkage Analysis
      </h4>
      <div className="space-y-4">
        {suppliers.map((supplier) => {
          const pct = Math.min(100, Math.max(0, supplier.failurePercentage));
          const barColor = pct >= 50 ? 'bg-rose-500' : 'bg-orange-400';
          return (
            <div key={supplier.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">{supplier.name}</span>
                <span className="text-xs font-bold text-slate-600">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AffectedVinsTable({ affectedVins }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 h-full">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
        Affected Vehicle Population
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-slate-400 border-b border-slate-200 uppercase tracking-wider">
              <th className="pb-3 pr-4">Model</th>
              <th className="pb-3 pr-4">Exposed Volume</th>
              <th className="pb-3">Sample VINs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {affectedVins.map((row, idx) => (
              <tr
                key={`${row.model}-${idx}`}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="py-3 pr-4 font-semibold text-slate-800 whitespace-nowrap">
                  {row.model}
                </td>
                <td className="py-3 pr-4 text-slate-600 font-medium">
                  {row.exposedVolume || row.count}
                </td>
                <td className="py-3 text-xs text-slate-500 font-mono">
                  {row.sampleVins.join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NlpFeed({ nlpFeed }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 h-full flex flex-col">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
        Unstructured NLP Extraction Feed
      </h4>
      <div className="flex-1 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
        {nlpFeed.length === 0 && (
          <p className="text-slate-400 text-sm text-center mt-10">No technician notes extracted.</p>
        )}
        {nlpFeed.map((entry, idx) => (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm hover:border-blue-200 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-slate-500">{entry.vin}</span>
              <span className="text-xs font-medium text-slate-400">Date: {entry.date}</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-400 mr-2">3C Note:</span>
              {entry.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export default function ClusterModal({ isOpen, onClose, clusterId, data }) {
  const [activeTab, setActiveTab] = useState('overview');

  // Reset tab to overview whenever modal opens for a new cluster
  useEffect(() => {
    if (isOpen) setActiveTab('overview');
  }, [isOpen, clusterId]);

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-6xl h-[90vh] bg-slate-50 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Cluster Investigation
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">
                {clusterId}
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Global KPIs (Always Visible) */}
        <div className="bg-white px-6 pt-5 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={FileText} label="Repair Orders" value={data.kpis.repairOrders} />
            <KpiCard icon={Car} label="Vehicles Exposed" value={data.kpis.vehiclesExposed} />
            <KpiCard icon={DollarSign} label="Financial Risk" value={formatCurrency(data.kpis.financialExposure)} />
            <KpiCard icon={CalendarClock} label="First Report" value={`${data.kpis.daysSinceFirstReport} Days Ago`} />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white px-6 border-b border-slate-200 flex gap-6">
          {[
            { id: 'overview', label: 'Overview & AI Insights' },
            { id: 'impact', label: 'Fleet & Supplier Impact' },
            { id: 'field', label: 'Field NLP Reports' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-5">
                  <div className="flex items-center gap-2 text-purple-700 mb-3">
                    <Sparkles className="w-5 h-5" strokeWidth={2.5} />
                    <span className="font-bold text-sm uppercase tracking-wide">Generative AI Summary</span>
                  </div>
                  <p className="text-[15px] text-purple-900 leading-relaxed font-medium">
                    {data.aiSummary}
                  </p>
                </div>
                <DetectionTimeline timeline={data.timeline} />
              </div>

              <div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 h-full">
                  <div className="flex items-center gap-2 text-blue-700 mb-3">
                    <Info className="w-5 h-5" strokeWidth={2.5} />
                    <span className="font-bold text-sm uppercase tracking-wide">Recommended Action</span>
                  </div>
                  <p className="text-[15px] text-blue-900 leading-relaxed font-medium">
                    {data.aiRecommendation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPACT & LINKAGE */}
          {activeTab === 'impact' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              <AffectedVinsTable affectedVins={data.affectedVins} />
              <SupplierLinkage suppliers={data.supplierLinkage} />
            </div>
          )}

          {/* TAB 3: FIELD REPORTS */}
          {activeTab === 'field' && (
            <div className="h-full">
              <NlpFeed nlpFeed={data.nlpFeed} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}