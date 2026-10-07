import React, { useEffect, useState } from 'react';
import { useFilterStore } from "../store/useFilterStore";
import { useLocation, Link } from 'react-router-dom';
import { supabase } from '../config/supabaseClient';

const NAV_ITEMS = [
  { label: 'Overview', path: '/overview' },
  { label: 'Claims & Repair', path: '/claims-analytics' },
  { label: 'Reliability & Early Warning', path: '/reliability' },
  { label: 'Dealer & Supplier Accountability', path: '/accountability' },
];

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-slate-200 rounded-lg pl-3.5 pr-9 py-2.5 text-[15px] text-slate-800 shadow-sm cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z%22 clip-rule=%22evenodd%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]"
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
    <header className="h-16 bg-[#0f172a] flex items-center px-7 flex-shrink-0 overflow-x-auto">
      <div className="flex items-center gap-3 mr-10 flex-shrink-0">
        <span className="text-white font-bold text-xl tracking-wide">WTY</span>
        <span className="text-slate-400 text-sm border-l border-slate-600 pl-3">Warranty &amp; Field Services</span>
      </div>
      <nav className="flex items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname.includes(item.path) || (location.pathname === '/' && item.path === '/overview');

          return (
            <Link
              key={item.label}
              to={item.path}
              className={`px-4 py-2 text-base font-medium rounded-lg whitespace-nowrap transition-colors ${
                isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-200 hover:text-white hover:bg-white/10'
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

  const showExtendedFilters = path === '/overview' || path === '/reliability' || path === '/claims-analytics' || path === '/accountability' || path === '/';

  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
      <div className="px-5 pt-5">
        <h2 className="text-sm font-bold text-slate-900 tracking-wider uppercase pb-4 border-b border-slate-200">Filters</h2>
      </div>
      <div className="px-5 py-5">
        
        {/* Global Filters: Always visible */}
        <FilterSelect label="Region" value={filters.region} onChange={filters.setRegion} options={options.regions} />
        <FilterSelect label="Model" value={filters.model} onChange={filters.setModel} options={options.models} />
        
        {/* Extended Filters: Only visible on Overview, EWS and Claims & Repair */}
        {showExtendedFilters && (
          <>
            <FilterSelect label="Variant" value={filters.variant} onChange={filters.setVariant} options={options.variants} />
            <FilterSelect label="Vehicle Type" value={filters.vehicleType} onChange={filters.setVehicleType} options={options.vehicleTypes} />
            <FilterSelect label="Customer Type" value={filters.customerType} onChange={filters.setCustomerType} options={options.customerTypes} />
          </>
        )}
        
        {/* Global Date Range: Always visible */}
        <div className="mt-1">
           <label className="block text-sm font-semibold text-slate-700 mb-2">Date Range</label>
           <div className="flex flex-col gap-2.5">
             <div className="flex items-center gap-2">
               <span className="text-[11px] font-bold text-slate-400 w-9">FROM</span>
               <input 
                 type="date" 
                 value={filters.dateRange.from.toISOString().split('T')[0]}
                 onChange={(e) => filters.setDateRange({ ...filters.dateRange, from: new Date(e.target.value) })}
                 className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2.5 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-slate-700"
               />
             </div>
             <div className="flex items-center gap-2">
               <span className="text-[11px] font-bold text-slate-400 w-9">TO</span>
               <input 
                 type="date" 
                 value={filters.dateRange.to.toISOString().split('T')[0]}
                 onChange={(e) => filters.setDateRange({ ...filters.dateRange, to: new Date(e.target.value) })}
                 className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2.5 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-slate-700"
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