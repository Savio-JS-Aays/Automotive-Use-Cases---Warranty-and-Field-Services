import React, { useEffect, useState, useMemo } from 'react';
import { useFilterStore } from '../../store/useFilterStore';
import { fetchEwsData } from './api';
import {
  AlertTriangle, TrendingUp, Cpu, ShieldAlert, X, HelpCircle, Activity, 
  Search, PenTool, Database, CheckCircle2, Clock, 
  Sparkles, Info, FileText, Car, DollarSign, CalendarClock, History, Layers
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

const formatCurrency = (val) => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
};

// ---------------------------------------------------------------------------
// High-Z Tooltip Component
// ---------------------------------------------------------------------------
function InfoTooltip({ text }) {
  return (
    <div className="group relative flex items-center ml-1.5 z-50">
      <HelpCircle className="w-4 h-4 text-slate-300 hover:text-sky-500 cursor-help transition-colors" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 bg-slate-800 text-slate-50 text-xs rounded-lg p-3 shadow-xl leading-relaxed border border-slate-700">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual Claim Modal
// ---------------------------------------------------------------------------
function ClaimDrillDownModal({ isOpen, onClose, claim, allClaims = [], nlpKeywords = [] }) {
  const [activeTab, setActiveTab] = useState('overview');
  
  useEffect(() => { 
    if (isOpen) setActiveTab('overview'); 
  }, [isOpen, claim]);

  if (!isOpen || !claim) return null;

  // Highlight NLP keywords in text
  const highlightedText = (text) => {
    if (!text) return null;
    let result = text;
    nlpKeywords.forEach(kw => {
      const regex = new RegExp(`(${kw.text})`, 'gi');
      result = result.replace(regex, `<span class="text-rose-600 font-bold bg-rose-50 px-1 rounded">$1</span>`);
    });
    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  };

  // Tab 2: Similar Claims (Same part, different claim)
  const similarClaims = allClaims
    .filter(c => c.part_id === claim.part_id && c.claim_id !== claim.claim_id)
    .slice(0, 10);
  
  // Tab 3: History (Same vehicle, different claim)
  const vehicleHistory = allClaims
    .filter(c => c.vehicle_id === claim.vehicle_id && c.claim_id !== claim.claim_id)
    .sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl h-[85vh] bg-slate-50 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-white flex flex-col px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Claim Record
                <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded font-mono border border-slate-200">{claim.claim_id}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${claim.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{claim.status}</span>
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Claim Amount</p><p className="text-xl font-bold text-slate-900">{formatCurrency(claim.claim_amount)}</p></div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">AI Risk Score</p><p className={`text-xl font-bold ${claim.ai_risk_score > 80 ? 'text-rose-600' : 'text-amber-500'}`}>{claim.ai_risk_score} / 100</p></div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Vehicle Details</p><p className="text-sm font-bold text-slate-800 font-mono truncate">{claim.vin}</p><p className="text-[11px] text-slate-500 mt-0.5">{claim.modelName}</p></div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Failed Component</p><p className="text-sm font-bold text-slate-800 truncate">{claim.partName || claim.part_id}</p></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white px-6 border-b border-slate-200 flex gap-6">
          {[{ id: 'overview', label: 'Overview & NLP', icon: FileText }, { id: 'similar', label: 'Pattern Recognition', icon: Layers }, { id: 'history', label: 'Vehicle History', icon: History }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-3 flex items-center gap-2 text-sm font-bold border-b-2 transition-colors ${activeTab === tab.id ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2"><PenTool className="w-4 h-4" /> Unstructured Technician Notes (3C)</h4>
                <div className="bg-slate-50 p-4 rounded-md border border-slate-100 text-slate-700 leading-relaxed text-sm">
                  {highlightedText(claim.nlpText)}
                </div>
              </div>
              <div className={`rounded-lg border p-5 ${claim.ai_risk_score > 75 ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
                <h4 className={`text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-2 ${claim.ai_risk_score > 75 ? 'text-rose-700' : 'text-amber-700'}`}>
                  <Cpu className="w-4 h-4" /> AI Risk Assessment
                </h4>
                <p className={`text-sm ${claim.ai_risk_score > 75 ? 'text-rose-900' : 'text-amber-900'}`}>
                  This claim generated an anomaly score of {claim.ai_risk_score} due to the presence of critical field terminology and a statistical deviation in repair frequency for {claim.partName || claim.part_id}. System recommends review for supplier chargeback.
                </p>
              </div>
            </div>
          )}
          
          {activeTab === 'similar' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
               <div className="p-4 border-b border-slate-100 bg-slate-50">
                 <p className="text-xs font-semibold text-slate-500 uppercase">Recent Similar Failures ({claim.partName || claim.part_id})</p>
               </div>
               <table className="w-full text-sm text-left">
                  <thead className="bg-white text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
                    <tr><th className="py-3 px-4">Claim ID</th><th className="py-3 px-4">Region</th><th className="py-3 px-4">Mileage</th><th className="py-3 px-4 text-center">AI Risk</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {similarClaims.length === 0 ? <tr><td colSpan="4" className="p-6 text-center text-slate-400">No recent similar claims found.</td></tr> : similarClaims.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-slate-900 font-bold">{c.claim_id}</td>
                        <td className="py-3 px-4 text-slate-600">{c.regionName || 'Unknown'}</td>
                        <td className="py-3 px-4 text-slate-600">{c.mileage_at_failure?.toLocaleString() || '—'} mi</td>
                        <td className="py-3 px-4 text-center font-bold text-rose-600">{c.ai_risk_score}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
               <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <p className="text-xs font-semibold text-slate-500 uppercase">Historical Claims for {claim.vin}</p>
                 <span className="text-xs font-bold text-slate-500">{vehicleHistory.length} Total Claims</span>
               </div>
               <table className="w-full text-sm text-left">
                  <thead className="bg-white text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
                    <tr><th className="py-3 px-4">Date</th><th className="py-3 px-4">Part Replaced</th><th className="py-3 px-4 text-right">Cost</th><th className="py-3 px-4 text-center">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {vehicleHistory.length === 0 ? <tr><td colSpan="4" className="p-6 text-center text-slate-400">No prior history for this vehicle.</td></tr> : vehicleHistory.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-600">{new Date(c.submission_date).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-slate-900 font-semibold">{c.partName || c.part_id}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">{formatCurrency(c.claim_amount)}</td>
                        <td className="py-3 px-4 text-center"><span className="text-[10px] font-bold uppercase text-slate-500 border border-slate-200 px-2 py-0.5 rounded bg-slate-50">{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cluster Modal Components
// ---------------------------------------------------------------------------
function ModalKpiCard({ icon: Icon, label, value }) {
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
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Detection Timeline</h4>
      <ol className="relative pl-5 mt-2">
        {timeline.map((item, idx) => {
          const isLast = idx === timeline.length - 1;
          return (
            <li key={idx} className="relative pb-6 last:pb-0">
              {!isLast && <span className="absolute left-[-15px] top-3 w-px bg-slate-200" style={{ height: 'calc(100% - 4px)' }} />}
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

function AffectedVinsTable({ affectedVins }) {
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('All');
  const uniqueModels = ['All', ...new Set(affectedVins.map(v => v.model))];

  const filtered = affectedVins.filter(v => 
    (modelFilter === 'All' || v.model === modelFilter) &&
    v.vin.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col h-full max-h-[400px]">
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 rounded-t-lg">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detailed Vehicle Population</h4>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" placeholder="Search VIN..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 w-48"
            />
          </div>
          <select 
            value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}
            className="py-1.5 px-3 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 text-slate-700 bg-white"
          >
            {uniqueModels.map(m => <option key={m} value={m}>{m === 'All' ? 'All Models' : m}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full text-sm text-left relative">
          <thead className="bg-white text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 sticky top-0 shadow-sm">
            <tr>
              <th className="py-3 px-4">VIN / ID</th>
              <th className="py-3 px-4">Model & Variant</th>
              <th className="py-3 px-4 text-center">Mileage</th>
              <th className="py-3 px-4">Claim Date</th>
              <th className="py-3 px-4 text-right">Claim Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan="5" className="p-6 text-center text-slate-400">No vehicles match filters.</td></tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <span className="font-mono text-slate-900 font-bold">{row.vin}</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">Claim: {row.claimId}</span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">{row.model} <span className="font-normal text-slate-500 block text-xs">{row.variant}</span></td>
                  <td className="py-3 px-4 text-center font-mono text-slate-600 text-xs">{row.mileage.toLocaleString()} mi</td>
                  <td className="py-3 px-4 text-slate-600 text-xs">{row.date}</td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600">{formatCurrency(row.claimAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClusterModal({ isOpen, onClose, cluster }) {
  const [activeTab, setActiveTab] = useState('overview');
  useEffect(() => { if (isOpen) setActiveTab('overview'); }, [isOpen, cluster]);

  if (!isOpen || !cluster) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-6xl h-[90vh] bg-slate-50 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Cluster Investigation
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">{cluster.id}</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">Component: <span className="font-semibold text-slate-700">{cluster.topPart}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        <div className="bg-white px-6 pt-5 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ModalKpiCard icon={FileText} label="Repair Orders" value={cluster.kpis.repairOrders} />
            <ModalKpiCard icon={Car} label="Vehicles Exposed" value={cluster.kpis.vehiclesExposed} />
            <ModalKpiCard icon={DollarSign} label="Financial Risk" value={formatCurrency(cluster.kpis.financialExposure)} />
            <ModalKpiCard icon={CalendarClock} label="First Report" value={`${cluster.kpis.daysSinceFirstReport} Days Ago`} />
          </div>
        </div>

        <div className="bg-white px-6 border-b border-slate-200 flex gap-6">
          {[{ id: 'overview', label: 'Overview & AI Insights' }, { id: 'impact', label: 'Fleet & Supplier Impact' }, { id: 'field', label: 'Field NLP Reports' }].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-5">
                  <div className="flex items-center gap-2 text-purple-700 mb-3">
                    <Sparkles className="w-5 h-5" strokeWidth={2.5} />
                    <span className="font-bold text-sm uppercase tracking-wide">Generative AI Summary</span>
                  </div>
                  <p className="text-[15px] text-purple-900 leading-relaxed font-medium">{cluster.aiSummary}</p>
                </div>
                <DetectionTimeline timeline={cluster.timeline} />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 h-full">
                <div className="flex items-center gap-2 text-blue-700 mb-3">
                  <Info className="w-5 h-5" strokeWidth={2.5} />
                  <span className="font-bold text-sm uppercase tracking-wide">Recommended Action</span>
                </div>
                <p className="text-[15px] text-blue-900 leading-relaxed font-medium">{cluster.aiRecommendation}</p>
              </div>
            </div>
          )}

          {activeTab === 'impact' && (
            <div className="flex flex-col gap-6">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Supplier Linkage Analysis</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">Supplier Name</th>
                        <th className="py-3 px-4">Risk Tier</th>
                        <th className="py-3 px-4 text-center">Failure Volume</th>
                        <th className="py-3 px-4 text-right">Financial Exposure</th>
                        <th className="py-3 px-4 text-center">Subrogation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {cluster.supplierLinkage.map((supplier, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-800">{supplier.name}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${supplier.riskTier === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {supplier.riskTier}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-900">{supplier.failures}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-600">{formatCurrency(supplier.exposure)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-1 text-[10px] font-bold uppercase bg-slate-100 text-slate-500 rounded border border-slate-200">Pending Review</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <AffectedVinsTable affectedVins={cluster.affectedVins} />
            </div>
          )}

          {activeTab === 'field' && (
            <div className="bg-white rounded-lg border border-slate-200 p-5 h-full flex flex-col">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Unstructured NLP Feed</h4>
              <div className="flex-1 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                {cluster.nlpFeed.map((entry, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm hover:border-blue-200">
                    <div className="flex justify-between mb-2"><span className="text-xs font-mono font-bold text-slate-500">{entry.vin}</span><span className="text-xs font-medium text-slate-400">{entry.date}</span></div>
                    <p className="text-sm text-slate-700"><span className="font-semibold text-slate-400 mr-2">3C Note:</span>{entry.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard View
// ---------------------------------------------------------------------------
export default function EarlyWarningSystem() {
  const filters = useFilterStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('explorer'); 
  
  const [searchVin, setSearchVin] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  
  // New States for dynamic chart and modal
  const [chartGroupBy, setChartGroupBy] = useState('Region');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedClaim, setSelectedClaim] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const result = await fetchEwsData(filters);
      setData(result);
      setLoading(false);
    }
    loadData();
  }, [filters]);

  // Dynamic Chart Aggregation Engine
  const dynamicChartData = useMemo(() => {
    if (!data || !data.rawClaims) return [];
    const counts = {};
    
    data.rawClaims.forEach(c => {
      let key = 'Unknown';
      if (chartGroupBy === 'Region') key = c.regionName;
      else if (chartGroupBy === 'Vehicle Model') key = c.modelName;
      else if (chartGroupBy === 'Customer Segment') key = c.customerType;
      else if (chartGroupBy === 'Liability Source') key = c.liability_type || 'OEM';
      else if (chartGroupBy === 'Claim Status') key = c.status;
      else if (chartGroupBy === 'AI Risk Tier') {
        if (c.ai_risk_score >= 80) key = 'Critical (80-100)';
        else if (c.ai_risk_score >= 40) key = 'High (40-79)';
        else key = 'Normal (0-39)';
      }
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.keys(counts)
      .map(k => ({ name: k, claims: counts[k] }))
      .sort((a, b) => b.claims - a.claims);
  }, [data, chartGroupBy]);


  if (loading || !data) {
    return <div className="p-6 text-slate-500 animate-pulse font-medium flex items-center gap-2"><Activity className="w-5 h-5 animate-spin" /> Analyzing Field Signals...</div>;
  }

  const KPIS = [
    { label: 'Total Claims', value: data.kpis.totalClaims.toLocaleString(), icon: AlertTriangle, color: 'text-slate-700', bg: 'bg-slate-100', tooltip: 'Absolute volume of claims filed within the selected date range and global filters.' },
    { label: 'Claim Growth (MoM)', value: `${data.kpis.claimGrowth}%`, icon: TrendingUp, color: data.kpis.claimGrowth > 0 ? 'text-rose-600' : 'text-emerald-600', bg: data.kpis.claimGrowth > 0 ? 'bg-rose-50' : 'bg-emerald-50', tooltip: 'Percentage growth vs the immediately preceding equivalent date range.' },
    { label: 'Severity', value: data.kpis.severity, icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50', tooltip: 'Calculated network threat level based on financial exposure and risk thresholds.' },
    { label: 'New Anomalies', value: data.kpis.newAnomalies, icon: Cpu, color: 'text-violet-600', bg: 'bg-violet-50', tooltip: 'Distinct failure clusters mathematically flagged by the ML engine.' },
    { label: 'Value at Risk', value: formatCurrency(data.kpis.valueAtRisk), icon: DollarSign, color: 'text-rose-600', bg: 'bg-rose-50', tooltip: 'Extrapolated financial exposure if active anomaly clusters are not mitigated.' }
  ];

  const filteredVehicles = data.vehicleTable.filter(v => {
    const matchesSearch = v.vin.toLowerCase().includes(searchVin.toLowerCase());
    const isExpired = v.daysRemaining <= 0;
    const isExpiring = v.daysRemaining > 0 && v.daysRemaining <= 90;
    
    if (riskFilter === 'High Risk (>75% Prob)' && v.failureProbability < 75) return false;
    if (riskFilter === 'Warranty Expiring (<90d)' && !isExpiring) return false;
    if (riskFilter === 'Warranty Expired' && !isExpired) return false;
    
    return matchesSearch;
  });

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      
      {/* Header Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Early Warning System (EWS)</h1>
            <span className="bg-sky-100 text-sky-700 text-xs font-bold px-2 py-0.5 rounded tracking-wide">PAGE 2</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Predictive anomaly detection and field signal tracking.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Dashboard</button>
          <button onClick={() => setActiveTab('explorer')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${activeTab === 'explorer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Claim Explorer</button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {KPIS.map((kpi, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between relative">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                    <InfoTooltip text={kpi.tooltip} />
                  </div>
                  <div className={`p-1.5 rounded-lg ${kpi.bg}`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${kpi.color === 'text-rose-600' ? 'text-rose-600' : 'text-slate-900'}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-1 space-y-6">
              
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[400px]">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-xl">
                  <div className="flex items-center">
                    <h3 className="text-sm font-bold text-slate-900">Emerging Issues Tracker</h3>
                    <InfoTooltip text="Active failure clusters identified by AI. Click any row to drill down." />
                  </div>
                </div>
                <div className="overflow-x-auto flex-1 overflow-y-auto p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-xs text-slate-400 font-semibold uppercase border-b border-slate-100 sticky top-0">
                      <tr><th className="py-2 px-4">Cluster ID</th><th className="py-2 px-4">Top Component</th><th className="py-2 px-4 text-center">Vol</th><th className="py-2 px-4 text-center">MoM %</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.clusters.length === 0 ? (
                        <tr><td colSpan="4" className="p-6 text-center text-slate-400">No anomalies detected.</td></tr>
                      ) : (
                        data.clusters.map(cluster => (
                          <tr key={cluster.id} onClick={() => setSelectedCluster(cluster)} className="hover:bg-sky-50 cursor-pointer transition-colors group">
                            <td className="py-3 px-4"><span className="font-mono text-xs text-sky-600 font-bold group-hover:underline">{cluster.id}</span></td>
                            <td className="py-3 px-4 font-medium text-slate-700 text-xs truncate max-w-[100px]">{cluster.topPart}</td>
                            <td className="py-3 px-4 text-center text-slate-700">{cluster.volume}</td>
                            <td className="py-3 px-4 text-center font-medium text-rose-600">+{cluster.growth}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 h-[280px] flex flex-col">
                <div className="flex items-center mb-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><PenTool className="w-4 h-4 text-indigo-500" /> NLP Word Cloud</h3>
                  <InfoTooltip text="Text-mining extraction from unstructured technician notes. Larger words indicate higher term frequency across claims." />
                </div>
                <div className="flex-1 flex flex-wrap content-center justify-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-100">
                  {data.nlpKeywords.map((kw, i) => (
                    <span key={i} className={`font-semibold ${i < 3 ? 'text-rose-500' : i < 6 ? 'text-indigo-500' : 'text-slate-400'}`} style={{ fontSize: `${Math.max(12, kw.weight * 0.6)}px`, opacity: Math.max(0.4, kw.weight / 50) }}>
                      {kw.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[704px]">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 rounded-t-xl z-10">
                <div className="flex items-center">
                  <h3 className="text-sm font-bold text-slate-900">Predictive Vehicle Risk</h3>
                  <InfoTooltip text="Ranks individual VINs by their ML-calculated probability of requiring a warranty repair before their coverage expires. Use filters to isolate high-risk or expiring vehicles." />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="Search VIN..." value={searchVin} onChange={(e) => setSearchVin(e.target.value)} className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 w-40" />
                  </div>
                  <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="py-1.5 px-3 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 text-slate-700 bg-white">
                    <option value="All">All Vehicles</option>
                    <option value="High Risk (>75% Prob)">High Risk (&gt;75% Prob)</option>
                    <option value="Warranty Expiring (<90d)">Warranty Expiring (&lt;90d)</option>
                    <option value="Warranty Expired">Warranty Expired</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto flex-1 overflow-y-auto">
                <table className="w-full text-sm text-left relative">
                  <thead className="bg-white text-xs text-slate-400 font-semibold uppercase border-b border-slate-100 sticky top-0 shadow-sm z-10">
                    <tr><th className="py-3 px-5">VIN / Model</th><th className="py-3 px-5 text-center">Warranty</th><th className="py-3 px-5 text-center">Fail Prob %</th><th className="py-3 px-5">Predicted Issue</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredVehicles.length === 0 ? (
                       <tr><td colSpan="4" className="p-8 text-center text-slate-400">No vehicles match current filters.</td></tr>
                    ) : (
                      filteredVehicles.map((v, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-5">
                            <p className="font-mono text-slate-900 font-medium">{v.vin}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{v.model} • {v.claimsTaken} Prior Claims</p>
                          </td>
                          <td className="py-3 px-5 text-center">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md border ${v.daysRemaining > 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : v.daysRemaining > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              {v.daysRemaining > 90 ? <CheckCircle2 className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                              {v.daysRemaining > 0 ? `${v.daysRemaining}d` : '0d'}
                            </span>
                          </td>
                          <td className="py-3 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-full bg-slate-100 rounded-full h-1.5 max-w-[80px]">
                                <div className={`h-1.5 rounded-full ${v.failureProbability > 75 ? 'bg-rose-500' : v.failureProbability > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${v.failureProbability}%` }}></div>
                              </div>
                              <span className="text-xs font-bold text-slate-700 w-8">{v.failureProbability}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-5 text-xs font-semibold text-slate-600">{v.predictedComponent}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Top Charts Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Global Trend Chart (2/3 Width) */}
            <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative flex flex-col h-[350px]">
               <div className="flex items-center mb-6">
                  <h3 className="text-sm font-bold text-slate-900">Global Claim Volume</h3>
                  <InfoTooltip text="Chronological volume of all claims matching your global sidebar filters." />
               </div>
               <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <Line type="monotone" dataKey="value" name="Claims Filed" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Dynamic Distribution Chart (1/3 Width) */}
            <div className="xl:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative flex flex-col h-[350px]">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <h3 className="text-sm font-bold text-slate-900">Claim Distribution</h3>
                    <InfoTooltip text="Dynamically group the filtered claims by various dimensions." />
                  </div>
                  <select 
                    value={chartGroupBy} 
                    onChange={(e) => setChartGroupBy(e.target.value)}
                    className="py-1 px-2 text-[11px] font-semibold border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 text-slate-700 bg-white shadow-sm"
                  >
                    {['Region', 'Vehicle Model', 'Customer Segment', 'Liability Source', 'AI Risk Tier', 'Claim Status'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
               </div>
               <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dynamicChartData} layout="vertical" margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#334155', fontWeight: 500 }} axisLine={false} tickLine={false} width={100} />
                      <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="claims" name="Total Claims" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
          </div>

          {/* Drill-down Data Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
             <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-xl z-10">
               <div className="flex items-center gap-2">
                 <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Database className="w-4 h-4 text-slate-400" /> Filtered Claim Records</h3>
                 <InfoTooltip text="Click any row to open the Individual Claim Investigation modal." />
               </div>
               <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">{data.rawClaims.length} Records</span>
             </div>
             <div className="overflow-x-auto h-[600px] overflow-y-auto">
                <table className="w-full text-sm text-left relative">
                  <thead className="bg-white text-xs text-slate-400 font-semibold uppercase border-b border-slate-100 sticky top-0 shadow-sm z-10">
                    <tr><th className="py-3 px-5">Claim ID</th><th className="py-3 px-5">Submission Date</th><th className="py-3 px-5">Vehicle & Model</th><th className="py-3 px-5 text-right">Amount</th><th className="py-3 px-5 text-center">AI Risk</th><th className="py-3 px-5 text-center">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.rawClaims.map((row, i) => (
                      <tr key={i} onClick={() => setSelectedClaim(row)} className="hover:bg-sky-50 cursor-pointer transition-colors group">
                        <td className="py-3 px-5 font-mono text-slate-900 font-bold group-hover:text-sky-700">{row.claim_id}</td>
                        <td className="py-3 px-5 text-slate-600">{new Date(row.submission_date).toLocaleDateString()}</td>
                        <td className="py-3 px-5">
                          <p className="font-mono text-slate-700 text-xs">{row.vin}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{row.modelName}</p>
                        </td>
                        <td className="py-3 px-5 text-slate-900 font-semibold text-right">{formatCurrency(row.claim_amount)}</td>
                        <td className="py-3 px-5 text-center"><span className={`font-bold ${row.ai_risk_score > 80 ? 'text-rose-600' : row.ai_risk_score > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>{row.ai_risk_score}</span></td>
                        <td className="py-3 px-5 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${row.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : row.status === 'Closed' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {/* Cluster and Individual Claim Modals */}
      <ClusterModal isOpen={selectedCluster !== null} onClose={() => setSelectedCluster(null)} cluster={selectedCluster} />
      
      <ClaimDrillDownModal 
        isOpen={selectedClaim !== null} 
        onClose={() => setSelectedClaim(null)} 
        claim={selectedClaim} 
        allClaims={data.rawClaims}
        nlpKeywords={data.nlpKeywords}
      />
    </div>
  );
}