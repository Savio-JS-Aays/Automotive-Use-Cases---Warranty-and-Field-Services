// src/modules/dealer-intelligence/DealerIntelligence.jsx
import React, { useEffect, useState } from 'react';
import { useFilterStore } from '../../store/useFilterStore';
import { fetchDealerIntelligenceData } from './api';
import { ShieldAlert, TrendingUp, CheckCircle, Search, MoreVertical } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';

// --- Small helper for the inline Sparkline ---
const Sparkline = ({ data, color }) => (
  <div className="h-8 w-20">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.map((val, i) => ({ val, i }))}>
        <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// --- KPI Card Component ---
const KPICard = ({ title, value, subtitle, icon: Icon, colorClass }) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass.bg}`}>
      <Icon className={`w-5 h-5 ${colorClass.text}`} />
    </div>
  </div>
);

export default function DealerIntelligence() {
  const filters = useFilterStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await fetchDealerIntelligenceData(filters);
      setData(res);
      setLoading(false);
    }
    loadData();
  }, [filters]);

  if (loading || !data) return <div className="p-6 text-slate-400 animate-pulse">Running Dealer Audits...</div>;

  return (
    <div className="space-y-6 max-w-[1400px]">
      
      {/* HEADER */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Dealer Intelligence & Service Integrity</h2>
          <p className="text-sm text-slate-400">Network performance, labor benchmark audits, and anomaly detection.</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'overview', label: 'Network Scorecard' },
            { id: 'stage1', label: 'Stage 1: Benchmarks' },
            { id: 'stage2', label: 'Stage 2: Line-Item Audit' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: NETWORK SCORECARD */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard title="Claims Spend Flagged" value={data.kpis.integrity.spendFlagged} subtitle="Outside benchmark" icon={ShieldAlert} colorClass={{bg: 'bg-rose-50', text: 'text-rose-600'}} />
            <KPICard title="Recovered / Avoided" value={data.kpis.integrity.recovered} subtitle="YTD Value" icon={TrendingUp} colorClass={{bg: 'bg-emerald-50', text: 'text-emerald-600'}} />
            <KPICard title="Dealer Outliers" value={data.kpis.integrity.outliers} subtitle="Require audit" icon={Search} colorClass={{bg: 'bg-amber-50', text: 'text-amber-600'}} />
            <KPICard title="Detection Precision" value={data.kpis.integrity.precision} subtitle="Confirmed anomalies" icon={CheckCircle} colorClass={{bg: 'bg-blue-50', text: 'text-blue-600'}} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Dealer Scorecard Table */}
            <div className="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[500px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 sticky top-0">
                <h3 className="text-sm font-bold text-slate-800">Dealer Scorecard (Z-Score & Trends)</h3>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-white text-slate-400 font-bold uppercase sticky top-0 shadow-sm">
                    <tr>
                      <th className="p-3 pl-4">#</th>
                      <th className="p-3">Dealer</th>
                      <th className="p-3">Volume</th>
                      <th className="p-3">Avg Cost</th>
                      <th className="p-3">NFF %</th>
                      <th className="p-3">Labor Z-Score</th>
                      <th className="p-3">90d Trend</th>
                      <th className="p-3 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.scorecard.map((row, i) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 pl-4 text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                        <td className="p-3 text-slate-600">{row.volume}</td>
                        <td className="p-3 font-medium text-slate-700">${Math.round(row.avgCost).toLocaleString()}</td>
                        <td className="p-3 font-medium text-slate-700">{row.nffRate.toFixed(1)}%</td>
                        <td className="p-3 font-mono">
                          <span className={row.laborZ > 2 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                            {row.laborZ > 0 ? '+' : ''}{row.laborZ.toFixed(2)}σ
                          </span>
                        </td>
                        <td className="p-3">
                          <Sparkline data={row.trend} color={row.laborZ > 2 ? '#e11d48' : '#10b981'} />
                        </td>
                        <td className="p-3 pr-4">
                          <span className={`px-2 py-1 rounded-full font-bold text-[10px] uppercase ${
                            row.flagBadge === 'Audit' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                          }`}>{row.flagBadge}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Regional Summary */}
            <div className="xl:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Regional Distribution</h3>
              <div className="space-y-4">
                {data.kpis.regional.map(reg => (
                  <div key={reg.region}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700">{reg.region}</span>
                      <span className="text-slate-500">{reg.anomalies} Flags</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 flex">
                      <div className="bg-blue-500 h-2 rounded-l-full" style={{ width: `${reg.compliance}%` }}></div>
                      <div className="bg-rose-500 h-2 rounded-r-full" style={{ width: `${100 - reg.compliance}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STAGE 1 BENCHMARKS */}
      {activeTab === 'stage1' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard title="Dealers Analysed" value={data.kpis.stage1.analyzed} colorClass={{bg: 'bg-slate-50', text: 'text-slate-600'}} icon={Search} />
            <KPICard title="Dealers Flagged" value={data.kpis.stage1.flagged} colorClass={{bg: 'bg-rose-50', text: 'text-rose-600'}} icon={ShieldAlert} />
            <KPICard title="Total Exposure" value={data.kpis.stage1.exposure} colorClass={{bg: 'bg-amber-50', text: 'text-amber-600'}} icon={TrendingUp} />
            <KPICard title="Benchmarks Clean" value={data.kpis.stage1.clean} colorClass={{bg: 'bg-emerald-50', text: 'text-emerald-600'}} icon={CheckCircle} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[600px]">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Dealer Benchmark Analysis & Risk Ranking</h3>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-white text-slate-400 font-bold uppercase sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="p-3 pl-4 w-10"><input type="checkbox" className="rounded border-slate-300" /></th>
                    <th className="p-3">Dealer</th>
                    <th className="p-3">Claims</th>
                    <th className="p-3">Labor Δ %</th>
                    <th className="p-3">Time Δ %</th>
                    <th className="p-3 w-48">Composite Risk</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.scorecard.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 pl-4"><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                      <td className="p-3 text-slate-600">{row.volume}</td>
                      <td className={`p-3 font-mono ${Number(row.laborDelta) > 15 ? 'text-rose-600' : 'text-slate-600'}`}>
                        {Number(row.laborDelta) > 0 ? '+' : ''}{row.laborDelta}%
                      </td>
                      <td className="p-3 font-mono text-slate-600">{Number(row.timeDelta) > 0 ? '+' : ''}{row.timeDelta}%</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full ${row.compositeRisk > 75 ? 'bg-rose-500' : row.compositeRisk > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${row.compositeRisk}%` }}></div>
                          </div>
                          <span className="w-8 text-right font-mono text-slate-500">{Math.round(row.compositeRisk)}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded font-bold text-[10px] uppercase ${
                          row.status === 'HIGH' ? 'bg-rose-50 text-rose-600' : row.status === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                        }`}>{row.status}</span>
                      </td>
                      <td className="p-3 pr-4 text-right">
                        <button className="px-3 py-1 bg-white border border-slate-200 rounded text-slate-600 font-medium hover:bg-slate-50 mr-2">Vehicles</button>
                        <button className="px-3 py-1 bg-blue-50 border border-blue-100 rounded text-blue-600 font-medium hover:bg-blue-100">Notice</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STAGE 2 LINE-ITEM AUDIT */}
      {activeTab === 'stage2' && (
        <div className="animate-in fade-in bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[700px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Vehicle-Level Repair Line-Item Audit</h3>
              <p className="text-xs text-slate-500">Granular audit exposing individual claims that breached benchmarks.</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search VIN or RO..." className="pl-9 pr-4 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            </div>
          </div>
          
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-white text-slate-400 font-bold uppercase sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-3 pl-4">VIN / RO ID</th>
                  <th className="p-3">Dealer</th>
                  <th className="p-3">Part Replaced</th>
                  <th className="p-3">Pattern Flag</th>
                  <th className="p-3">Labor (Act/Bench)</th>
                  <th className="p-3">Time (Act/Bench)</th>
                  <th className="p-3">Bench?</th>
                  <th className="p-3 pr-4 text-right">Adjudicate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.audits.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 pl-4">
                      <p className="font-mono font-medium text-slate-800">{row.vin}</p>
                      <p className="text-[10px] text-slate-400">{row.id}</p>
                    </td>
                    <td className="p-3 font-semibold text-slate-700">{row.dealer}</td>
                    <td className="p-3 text-slate-600">{row.partReplaced}</td>
                    <td className="p-3 text-rose-600 font-medium">{row.pattern}</td>
                    <td className="p-3 font-mono">
                      <span className="text-slate-800">{row.laborActual}h</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500">{row.laborBench}h</span>
                    </td>
                    <td className="p-3 font-mono">
                      <span className="text-slate-800">{row.timeActual}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500">{row.timeBench}</span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded font-bold text-[10px] uppercase ${
                        row.isWithinBench ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>{row.isWithinBench ? 'PASS' : 'FAIL'}</span>
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <select className="border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-500 text-slate-600">
                        <option>Action...</option>
                        <option>Approve</option>
                        <option>Reject</option>
                        <option>Partial Pay</option>
                        <option>Clarify</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}