import React, { useEffect, useState } from 'react';
import { useFilterStore } from '../../store/useFilterStore';
import { fetchOverviewData } from './api';
import { KpiCard, PageHeader } from '../../components/analytics/ui';
import {
  HelpCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

// ---------------------------------------------------------------------------
// Helpers & Components
// ---------------------------------------------------------------------------
const formatCurrency = (val) => {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
};

function InfoTooltip({ text }) {
  return (
    <div className="group relative flex items-center ml-2">
      <HelpCircle className="w-4 h-4 text-slate-300 hover:text-sky-500 cursor-help transition-colors" />
      <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 bg-slate-800 text-slate-50 text-xs rounded-lg p-3 z-10 shadow-xl leading-relaxed border border-slate-700">
        {text}
        {/* Subtle arrow pointer */}
        <div className="absolute top-full right-1.5 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart Cards
// ---------------------------------------------------------------------------
function SpendVsRecoveryChart({ data }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Liability vs Recovery</h3>
          <p className="text-xs text-sky-600 font-medium mt-0.5">Financial Impact</p>
        </div>
        <InfoTooltip text="Compares OEM paid claims vs Supplier liable claims. The Recovered bar indicates subrogated funds successfully reclaimed from suppliers." />
      </div>
      <div className="flex-grow h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis 
              tick={{ fontSize: 12, fill: '#64748b' }} 
              axisLine={false} 
              tickLine={false} 
              tickFormatter={(val) => `$${val >= 1000 ? val/1000 + 'k' : val}`}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value) => formatCurrency(value)}
              cursor={{ fill: '#f8fafc' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} iconType="circle" />
            <Bar name="OEM Liability" dataKey="oemSpend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar name="Supplier Liability" dataKey="supplierLiability" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar name="Recovered" dataKey="recovered" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ClaimsBySystemChart({ data }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Claims by Subsystem</h3>
          <p className="text-xs text-sky-600 font-medium mt-0.5">Volume Mix</p>
        </div>
        <InfoTooltip text="Total volume of claims dynamically filtered and categorized by major vehicle subsystems (e.g., Powertrain, Chassis)." />
      </div>
      <div className="flex-grow h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              cursor={{ fill: '#f8fafc' }}
            />
            <Bar dataKey="claims" name="Total Claims" radius={[4, 4, 0, 0]}>
              {(data || []).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4'][index % 6]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------
export default function WarrantyOverview() {
  const filters = useFilterStore();
  const [data, setData] = useState({ 
    kpis: { openClaims: 0, monthlySpend: 0, avgAdjudication: 0, recoveryRate: 0, nffRate: 0, aiFlagged: 0 }, 
    chart1Data: [], 
    chart2Data: [] 
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const result = await fetchOverviewData(filters);
      if (result) setData(result);
      setLoading(false);
    }
    loadData();
  }, [filters]);

  const dynamicKpis = [
    {
      title: 'Open Claims',
      value: data.kpis.openClaims.toLocaleString(),
      subtext: 'Total unresolved field cases',
      accent: 'blue',
      tooltipText: 'Count of all warranty claims that have not yet been marked as Closed or Paid within the selected filters.'
    },
    {
      title: 'Monthly Spend',
      value: formatCurrency(data.kpis.monthlySpend),
      subtext: 'Adjudicated financial payout',
      accent: 'emerald',
      tooltipText: 'Total monetary value of claims that have been formally paid out within the selected timeframe.'
    },
    {
      title: 'Avg Adjudication Time',
      value: `${data.kpis.avgAdjudication} Days`,
      subtext: 'Claim submission to resolution',
      accent: 'violet',
      tooltipText: 'The average number of days elapsed between a dealer submitting a claim and the warranty team rendering a final decision.'
    },
    {
      title: 'Recovery Rate',
      value: `${data.kpis.recoveryRate}%`,
      subtext: 'Subrogation success vs supplier liability',
      accent: 'blue',
      tooltipText: 'The percentage of dollars successfully clawed back from suppliers relative to the total financial exposure caused by supplier defects.'
    },
    {
      title: 'NFF Rate',
      value: `${data.kpis.nffRate}%`,
      subtext: 'No Fault Found diagnostic waste',
      accent: 'amber',
      tooltipText: 'Percentage of returned parts that were tested and found to have no defects, indicating dealer misdiagnosis.'
    },
    {
      title: 'AI Flagged Anomalies',
      value: data.kpis.aiFlagged.toLocaleString(),
      subtext: 'Claims exceeding risk threshold',
      accent: 'rose',
      tooltipText: 'Number of claims flagged by the NLP engine for displaying patterns of fraud, inflation, or emerging catastrophic failure.'
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Warranty Overview" page={1}
        description="High-level executive summary of warranty financial exposure and recovery metrics." />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {dynamicKpis.map((kpi) => (
          <KpiCard key={kpi.title} label={kpi.title} value={kpi.value} sub={kpi.subtext} info={kpi.tooltipText} accent={kpi.accent} />
        ))}
      </div>

      {/* Chart Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpendVsRecoveryChart data={data.chart1Data} />
        <ClaimsBySystemChart data={data.chart2Data} />
      </div>
    </div>
  );
}