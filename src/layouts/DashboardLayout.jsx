import React, { useEffect, useState } from 'react';
import { useFilterStore } from "../store/useFilterStore";
import { Wrench } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { supabase } from '../config/supabaseClient';

const NAV_ITEMS = [
  { label: 'Overview', path: '/overview' },
  { label: 'Early Warning System', path: '/ews' },
  { label: 'Predictive Calibration', path: '/predictive-calibration' },
  { label: 'Dealer Intelligence', path: '/dealer-intelligence' },
  { label: 'Supplier Subrogation', path: '/supplier-subrogation' },
];

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="mb-4 animate-in fade-in slide-in-from-left-2 duration-300">
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-slate-300 rounded-md pl-3 pr-8 py-2 text-sm text-slate-700 shadow-sm cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z%22 clip-rule=%22evenodd%22/></svg>')] bg-no-repeat bg-[right_0.5rem_center] bg-[length:1rem]"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function TopNav() {
  const location = useLocation();

  return (
    <header className="h-14 bg-[#0f172a] flex items-center px-6 flex-shrink-0">
      <div className="flex items-center gap-2 mr-8">
        <Wrench className="w-5 h-5 text-white" strokeWidth={2.5} />
        <span className="text-white font-bold text-lg tracking-wide uppercase">WarrantyOps</span>
        <span className="text-slate-400 text-xs ml-2 border-l border-slate-600 pl-2">Field Services</span>
      </div>
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname.includes(item.path) || (location.pathname === '/' && item.path === '/overview');
          
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function SidebarFilters() {
  const filters = useFilterStore();
  const location = useLocation();
  const path = location.pathname;
  
  // State to hold dynamically fetched database options
  const [options, setOptions] = useState({
    regions: ['All Regions'],
    models: ['All Models'],
    variants: ['All Variants'],
    vehicleTypes: ['All Vehicle Types'],
    customerTypes: ['All Customer Types']
  });

  // Fetch unique filter values from Supabase dimension tables
  useEffect(() => {
    async function fetchFilterOptions() {
      const [
        { data: regions },
        { data: models },
        { data: customers }
      ] = await Promise.all([
        supabase.from('dim_region').select('region_name'),
        supabase.from('dim_v_model').select('model_name, variant, vehicle_type'),
        supabase.from('dim_customer').select('customer_type')
      ]);

      // Utility to extract unique sorted strings from array of objects
      const getUnique = (arr, key) => [...new Set((arr || []).map(item => item[key]).filter(Boolean))].sort();

      setOptions({
        regions: ['All Regions', ...getUnique(regions, 'region_name')],
        models: ['All Models', ...getUnique(models, 'model_name')],
        variants: ['All Variants', ...getUnique(models, 'variant')],
        vehicleTypes: ['All Vehicle Types', ...getUnique(models, 'vehicle_type')],
        customerTypes: ['All Customer Types', ...getUnique(customers, 'customer_type')]
      });
    }
    fetchFilterOptions();
  }, []);

  const showExtendedFilters = path === '/overview' || path === '/ews' || path === '/';

  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Filters</h2>
      </div>
      <div className="p-4">
        
        {/* Global Filters: Always visible */}
        <FilterSelect label="Region" value={filters.region} onChange={filters.setRegion} options={options.regions} />
        <FilterSelect label="Model" value={filters.model} onChange={filters.setModel} options={options.models} />
        
        {/* Extended Filters: Only visible on Overview and EWS */}
        {showExtendedFilters && (
          <>
            <FilterSelect label="Variant" value={filters.variant} onChange={filters.setVariant} options={options.variants} />
            <FilterSelect label="Vehicle Type" value={filters.vehicleType} onChange={filters.setVehicleType} options={options.vehicleTypes} />
            <FilterSelect label="Customer Type" value={filters.customerType} onChange={filters.setCustomerType} options={options.customerTypes} />
          </>
        )}
        
        {/* Global Date Range: Always visible */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
           <label className="block text-xs font-semibold text-slate-700 mb-2">Date Range</label>
           <div className="flex flex-col gap-2">
             <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-slate-400 w-8">FROM</span>
               <input 
                 type="date" 
                 value={filters.dateRange.from.toISOString().split('T')[0]}
                 onChange={(e) => filters.setDateRange({ ...filters.dateRange, from: new Date(e.target.value) })}
                 className="flex-1 text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-slate-600"
               />
             </div>
             <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-slate-400 w-8">TO</span>
               <input 
                 type="date" 
                 value={filters.dateRange.to.toISOString().split('T')[0]}
                 onChange={(e) => filters.setDateRange({ ...filters.dateRange, to: new Date(e.target.value) })}
                 className="flex-1 text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-slate-600"
               />
             </div>
           </div>
        </div>

      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-50">
      <TopNav />
      <div className="flex-1 flex overflow-hidden">
        <SidebarFilters />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}