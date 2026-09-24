import React, { useEffect, useState } from 'react';
import { useFilterStore } from '../../store/useFilterStore';
import { fetchPredictiveCalibrationData, fetchPartsList } from './api';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis,
  BarChart, Bar,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Info } from 'lucide-react';

const LINE_COLORS = ['#0ea5e9', '#f43f5e', '#8b5cf6', '#f59e0b'];

export default function PredictiveCalibration() {
  const filters = useFilterStore();
  
  // --- STATE DECLARATIONS (Must be inside the component) ---
  const [activeTab, setActiveTab] = useState('durability');
  const [partsList, setPartsList] = useState([]);
  const [selectedPartId, setSelectedPartId] = useState('All');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hiddenLines, setHiddenLines] = useState({});
  const [simulationExtension, setSimulationExtension] = useState(0); 

  // --- EFFECTS ---
  useEffect(() => {
    async function loadParts() {
      const parts = await fetchPartsList();
      setPartsList(parts);
    }
    loadParts();
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await fetchPredictiveCalibrationData(filters, selectedPartId);
      setData(res);
      setHiddenLines({}); 
      setLoading(false);
    }
    loadData();
  }, [filters.region, filters.model, filters.dateRange.from, filters.dateRange.to, selectedPartId]);

  const toggleLine = (dataKey) => {
    setHiddenLines(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  if (loading || !data) {
    return <div className="p-6 text-slate-400 animate-pulse">Loading Predictive Calibration Engine...</div>;
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      
      {/* HEADER & FILTERS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Predictive Warranty Calibration</h2>
            <p className="text-sm text-slate-400">B1/B10 Life analytics, Weibull survival probability, and actuarial modeling.</p>
          </div>
          
          <div className="border-l border-slate-200 pl-6 hidden md:block">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Target Component</span>
              <select
                value={selectedPartId}
                onChange={(e) => setSelectedPartId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-md pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="All">All Components (Aggregated)</option>
                {partsList.map(part => (
                  <option key={part.part_id} value={part.part_id}>{part.part_name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'durability', label: '1. Durability & Weibull' },
            { id: 'dutyCycle', label: '2. Duty Cycle & Terrain' },
            { id: 'actuarial', label: '3. Financial Reserves' }
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

      {/* VIEW 1: DURABILITY & WEIBULL */}
      {activeTab === 'durability' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Calculated B1 Life</span>
              <p className="text-2xl font-bold text-slate-800 mt-1">{data.view1.kpis.b1Life}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">B10 Design Life</span>
              <p className="text-2xl font-bold text-slate-800 mt-1">{data.view1.kpis.b10Life}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Weibull Shape (Beta)</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{data.view1.kpis.betaParam}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Durability Score</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{data.view1.kpis.durabilityScore}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Weibull Probability Plot</h3>
                  <p className="text-xs text-slate-400">Click a supplier in the legend to toggle visibility.</p>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.view1.weibullPlotData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mileage" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend onClick={(e) => toggleLine(e.dataKey)} wrapperStyle={{ cursor: 'pointer' }} />
                    {data.view1.supplierKeys.map((supplierName, idx) => (
                      <Line 
                        key={supplierName}
                        type="monotone" 
                        dataKey={supplierName} 
                        name={supplierName} 
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]} 
                        strokeWidth={2} 
                        hide={hiddenLines[supplierName]} 
                      />
                    ))}
                    <Line type="monotone" dataKey="fleetBaseline" name="Fleet Baseline" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={2} hide={hiddenLines['fleetBaseline']} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[410px]">
              <div className="p-5 border-b border-slate-100 bg-white z-20 shrink-0">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Supplier Batch Durability Tracker</h3>
                <p className="text-xs text-slate-400">Scroll to view all 36-month active batches.</p>
              </div>
              
              <div className="overflow-auto flex-1 relative">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3">Supplier</th>
                      <th className="p-3">Batch ID</th>
                      <th className="p-3">Prod Date</th>
                      <th className="p-3">VIO</th>
                      <th className="p-3">MTBF</th>
                      <th className="p-3">Returns</th>
                      <th className="p-3">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.view1.batchTableData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-semibold text-slate-800">{row.supplierName}</td>
                        <td className="p-3 font-mono text-slate-500">{row.batchNumber}</td>
                        <td className="p-3 text-slate-500">{row.productionDate}</td>
                        <td className="p-3 font-medium text-slate-700">{row.installedVio}</td>
                        <td className="p-3 text-slate-600">{row.mtbf}</td>
                        <td className="p-3 font-medium text-slate-700">{row.fieldReturns}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded font-bold text-[10px] uppercase ${
                            row.riskLevel === 'High' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>{row.riskLevel}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: DUTY CYCLE & TERRAIN */}
      {activeTab === 'dutyCycle' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Duty Cycle Severity Correlation</h3>
                <p className="text-xs text-slate-400">Driver behavior severity vs. premature failure rate (R² = 0.84)</p>
              </div>
              <div className="group relative cursor-help">
                <Info className="w-5 h-5 text-slate-400 hover:text-blue-500 transition-colors" />
                <div className="hidden group-hover:block absolute right-0 top-6 w-64 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl z-50">
                  <p className="font-bold mb-1">Chart Explanation:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li><strong className="text-white">X-Axis:</strong> Severity Index (0-100) based on max RPM & Engine Temp.</li>
                    <li><strong className="text-white">Y-Axis:</strong> Failure Rate % (Probability of premature breakdown).</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="severityIndex" type="number" name="Severity Index" tickFormatter={(val) => Math.round(val)} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="failureRate" type="number" name="Failure Rate %" tickFormatter={(val) => val.toFixed(1)} tick={{ fontSize: 11 }} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Vehicle Duty Cycle" data={data.view2.dutyCycleScatter} fill="#3b82f6" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-rows-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
              <div className="w-full">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Terrain Failure Profile</h3>
                <p className="text-xs text-slate-400">Failure distribution across environmental domains</p>
              </div>
              <div className="h-48 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data.view2.terrainProfile}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                    <Radar name="Actual Failures" dataKey="actual" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
                    <Radar name="Fleet Baseline" dataKey="fleetBaseline" stroke="#94a3b8" fill="none" strokeDasharray="3 3" strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Top Failing Usage Signals</h3>
              <p className="text-xs text-slate-400 mb-2">Correlation to component failures</p>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.view2.usageClustering} layout="vertical" margin={{ top: 0, right: 15, bottom: 0, left: 30 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="signal" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="correlation" fill="#f97316" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: FINANCIAL RESERVES */}
      {activeTab === 'actuarial' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Projected Reserve / VIN</span>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                ${(data.view3.baseKpis.projectedReservePerVin + (simulationExtension * 0.05)).toLocaleString()}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total OEM Reserve</span>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                ${(data.view3.baseKpis.totalOemReserve + (simulationExtension * 0.001)).toFixed(2)}M
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Actuarial Horizon</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {(data.view3.baseKpis.breakevenHorizon + (simulationExtension / 1000)).toFixed(1)} Mos
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net Cost Impact</span>
              <p className="text-2xl font-bold text-rose-600 mt-1">
                -${(Math.abs(data.view3.baseKpis.netCostImpact) + (simulationExtension * 12)).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-1 space-y-6">
              
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Warranty Extension Simulator</h3>
                <p className="text-xs text-slate-400 mb-6">Drag slider to simulate financial impact of extending warranty limits.</p>
                
                <div className="mb-8">
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-2">
                    <span>Base Policy (+0 mi)</span>
                    <span className="text-blue-600">Simulating: +{simulationExtension.toLocaleString()} mi</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="24000" 
                    step="1000"
                    value={simulationExtension}
                    onChange={(e) => setSimulationExtension(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="relative pt-6 pb-2 border-t border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Observed Milestones (Mileage)</h4>
                  
                  <div className="absolute top-14 left-0 w-full h-1 bg-slate-200 rounded-full"></div>
                  
                  <div className="absolute top-12" style={{ left: '30%' }}>
                    <div className="w-4 h-4 bg-slate-400 rounded-full border-4 border-white shadow-sm -ml-2"></div>
                    <div className="mt-2 text-[10px] font-bold text-slate-600 -ml-4 whitespace-nowrap">Current: {(data.view3.timeline.currentLimit / 1000)}k</div>
                  </div>

                  {simulationExtension > 0 && (
                    <div className="absolute top-12" style={{ left: `${30 + (simulationExtension/1000)}%` }}>
                      <div className="w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow-sm -ml-2"></div>
                      <div className="mt-2 text-[10px] font-bold text-blue-600 -ml-4 whitespace-nowrap">Sim: {((data.view3.timeline.currentLimit + simulationExtension) / 1000)}k</div>
                    </div>
                  )}

                  <div className="absolute top-12" style={{ left: '55%' }}>
                    <div className="w-4 h-4 bg-rose-500 rounded-full border-4 border-white shadow-sm -ml-2"></div>
                    <div className="mt-2 text-[10px] font-bold text-rose-600 -ml-2 whitespace-nowrap">B10: {(data.view3.timeline.b10Life / 1000)}k</div>
                  </div>

                  <div className="absolute top-12" style={{ left: '85%' }}>
                    <div className="w-4 h-4 bg-emerald-500 rounded-full border-4 border-white shadow-sm -ml-2"></div>
                    <div className="mt-2 text-[10px] font-bold text-emerald-600 -ml-4 whitespace-nowrap">Median: {(data.view3.timeline.observedMedian / 1000)}k</div>
                  </div>
                  <div className="h-10"></div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Current vs Recommended Policy</h3>
                <p className="text-xs text-slate-400 mb-4">Static limits vs data-backed recommendations.</p>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.view3.policyComparison} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="part" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="currentLimit" name="Current (k mi)" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="recommendedLimit" name="Recommended (k mi)" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[730px]">
              <div className="p-5 border-b border-slate-100 bg-white z-20 shrink-0">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Part-Level Calibration Table</h3>
                <p className="text-xs text-slate-400">Line-by-line review of observed life vs prescribed warranty.</p>
              </div>
              
              <div className="overflow-auto flex-1 relative">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3 pl-5">Part Name</th>
                      <th className="p-3">Observed Median</th>
                      <th className="p-3">B10 Life</th>
                      <th className="p-3">Current Wty</th>
                      <th className="p-3">Rec. Wty</th>
                      <th className="p-3">Claims</th>
                      <th className="p-3">Cost Impact</th>
                      <th className="p-3 pr-5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.view3.partCalibrationTable.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 pl-5 font-semibold text-slate-800">{row.partName}</td>
                        <td className="p-3 font-medium text-slate-600">{row.observedMedian}</td>
                        <td className="p-3 font-medium text-rose-600">{row.b10Life}</td>
                        <td className="p-3 text-slate-500">{row.currentWarranty}</td>
                        <td className="p-3 font-bold text-blue-600">{row.recommendedWarranty}</td>
                        <td className="p-3 text-slate-500">{row.claimsMined}</td>
                        <td className="p-3 font-mono text-slate-600">{row.costImpact}</td>
                        <td className="p-3 pr-5">
                          <span className={`px-2 py-1 rounded font-bold text-[10px] uppercase ${
                            row.status === 'Review Required' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>{row.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}