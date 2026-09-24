import { supabase } from '../../config/supabaseClient';
import { differenceInDays } from 'date-fns';

export async function fetchOverviewData(filters) {
  const { dateRange, region, model, variant, vehicleType, customerType } = filters;

  // 1. Fetch all required dimensions in parallel (Bypasses FK errors)
  const [
    { data: parts },
    { data: vehicles },
    { data: vModels },
    { data: customers },
    { data: locations },
    { data: regions }
  ] = await Promise.all([
    supabase.from('dim_part').select('part_id, vehicle_subsystem'),
    supabase.from('dim_vehicle').select('vehicle_id, model_id, customer_id, location_id'),
    supabase.from('dim_v_model').select('model_id, model_name, variant, vehicle_type'),
    supabase.from('dim_customer').select('customer_id, customer_type'),
    supabase.from('dim_location').select('location_id, region_id'),
    supabase.from('dim_region').select('region_id, region_name')
  ]);

  // 2. Build local lookup dictionaries for instant mapping
  const partMap = {}; (parts || []).forEach(p => partMap[p.part_id] = p.vehicle_subsystem);
  const modelMap = {}; (vModels || []).forEach(m => modelMap[m.model_id] = m);
  const customerMap = {}; (customers || []).forEach(c => customerMap[c.customer_id] = c);
  const regionMap = {}; (regions || []).forEach(r => regionMap[r.region_id] = r.region_name);
  const locationMap = {}; (locations || []).forEach(l => locationMap[l.location_id] = regionMap[l.region_id]);

  // Map every vehicle to its rich metadata
  const vehicleMap = {};
  (vehicles || []).forEach(v => {
    const mod = modelMap[v.model_id] || {};
    const cust = customerMap[v.customer_id] || {};
    const regName = locationMap[v.location_id] || 'Unknown';
    
    vehicleMap[v.vehicle_id] = {
      modelName: mod.model_name || 'Unknown',
      variant: mod.variant || 'Unknown',
      vehicleType: mod.vehicle_type || 'Unknown',
      customerType: cust.customer_type || 'Unknown',
      regionName: regName
    };
  });

  // 3. Fetch Claims within the Date Range
  const { data: claims, error } = await supabase
    .from('fact_warranty_claims')
    .select('*')
    .gte('submission_date', dateRange.from.toISOString())
    .lte('submission_date', dateRange.to.toISOString());

  if (error) {
    console.error("Error fetching claims:", error);
    return null;
  }

  // 4. FILTER CLAIMS based on Global State
  const filteredClaims = (claims || []).filter(claim => {
    const vInfo = vehicleMap[claim.vehicle_id] || {};

    if (region && region !== 'All Regions' && vInfo.regionName !== region) return false;
    if (model && model !== 'All Models' && vInfo.modelName !== model) return false;
    if (variant && variant !== 'All Variants' && vInfo.variant !== variant) return false;
    if (vehicleType && vehicleType !== 'All Vehicle Types' && vInfo.vehicleType !== vehicleType) return false;
    if (customerType && customerType !== 'All Customer Types' && vInfo.customerType !== customerType) return false;

    return true; // Keep claim if it passes all active filters
  });

  // 5. Calculate Metrics on the FILTERED data
  let openClaims = 0;
  let totalSpend = 0;
  let nffCount = 0;
  let aiFlagged = 0;
  let totalAdjudicationDays = 0;
  let adjudicatedCount = 0;
  let supplierLiabilitySpend = 0;
  let totalRecovered = 0;
  
  const subsystemCounts = {};
  const monthlyData = {};

  filteredClaims.forEach(claim => {
    if (claim.status !== 'Closed' && claim.status !== 'Paid') openClaims++;
    if (claim.status === 'Paid') totalSpend += (claim.claim_amount || 0);
    if (claim.nff_flag === 1) nffCount++;
    if (claim.ai_risk_score > 80) aiFlagged++;

    if (claim.adjudication_date && claim.submission_date) {
      const days = differenceInDays(new Date(claim.adjudication_date), new Date(claim.submission_date));
      if (days >= 0) {
        totalAdjudicationDays += days;
        adjudicatedCount++;
      }
    }

    if (claim.liability_type === 'Supplier') {
      supplierLiabilitySpend += (claim.claim_amount || 0);
      totalRecovered += (claim.recovered_amount || 0);
    }

    // Chart 2: Subsystem Bar Chart
    const sys = partMap[claim.part_id] || 'Other';
    subsystemCounts[sys] = (subsystemCounts[sys] || 0) + 1;

    // Chart 1: Liability vs Recovery (Grouped by Month)
    const month = new Date(claim.submission_date).toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!monthlyData[month]) {
      monthlyData[month] = { name: month, oemSpend: 0, supplierLiability: 0, recovered: 0 };
    }
    
    if (claim.liability_type === 'OEM') {
      monthlyData[month].oemSpend += (claim.claim_amount || 0);
    } else if (claim.liability_type === 'Supplier') {
      monthlyData[month].supplierLiability += (claim.claim_amount || 0);
      monthlyData[month].recovered += (claim.recovered_amount || 0);
    }
  });

  const avgAdjudication = adjudicatedCount > 0 ? (totalAdjudicationDays / adjudicatedCount).toFixed(1) : 0;
  const nffRate = filteredClaims.length > 0 ? ((nffCount / filteredClaims.length) * 100).toFixed(1) : 0;
  const recoveryRate = supplierLiabilitySpend > 0 ? ((totalRecovered / supplierLiabilitySpend) * 100).toFixed(1) : 0;

  const chart2Data = Object.keys(subsystemCounts)
    .map(key => ({ name: key, claims: subsystemCounts[key] }))
    .sort((a, b) => b.claims - a.claims);

  // Define chronological order for sorting the months
  const monthOrder = { 'Jan':1, 'Feb':2, 'Mar':3, 'Apr':4, 'May':5, 'Jun':6, 'Jul':7, 'Aug':8, 'Sep':9, 'Oct':10, 'Nov':11, 'Dec':12 };
  const sortedChart1Data = Object.values(monthlyData).sort((a, b) => {
    const [monthA, yearA] = a.name.split(' ');
    const [monthB, yearB] = b.name.split(' ');
    if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
    return monthOrder[monthA] - monthOrder[monthB];
  });

  return {
    kpis: { openClaims, monthlySpend: totalSpend, avgAdjudication, recoveryRate, nffRate, aiFlagged },
    chart1Data: sortedChart1Data,
    chart2Data
  };
}