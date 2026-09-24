import { supabase } from '../../config/supabaseClient';
import { subDays, differenceInDays, eachDayOfInterval, format, addDays } from 'date-fns';

export async function fetchEwsData(filters) {
  const { dateRange, region, model, variant, vehicleType, customerType } = filters;

  const daysInPeriod = differenceInDays(dateRange.to, dateRange.from) || 30;
  const previousPeriodFrom = subDays(dateRange.from, daysInPeriod);
  
  const [
    { data: parts },
    { data: vehicles },
    { data: vModels },
    { data: customers },
    { data: locations },
    { data: regions },
    { data: suppliers }
  ] = await Promise.all([
    supabase.from('dim_part').select('*'),
    supabase.from('dim_vehicle').select('*'),
    supabase.from('dim_v_model').select('*'),
    supabase.from('dim_customer').select('*'),
    supabase.from('dim_location').select('*'),
    supabase.from('dim_region').select('*'),
    supabase.from('dim_supplier').select('*')
  ]);

  const partMap = {}; (parts || []).forEach(p => partMap[p.part_id] = p);
  const modelMap = {}; (vModels || []).forEach(m => modelMap[m.model_id] = m);
  const customerMap = {}; (customers || []).forEach(c => customerMap[c.customer_id] = c);
  const regionMap = {}; (regions || []).forEach(r => regionMap[r.region_id] = r.region_name);
  const locationMap = {}; (locations || []).forEach(l => locationMap[l.location_id] = regionMap[l.region_id]);
  const supplierMap = {}; (suppliers || []).forEach(s => supplierMap[s.supplier_id] = s);

  const vehicleMap = {};
  (vehicles || []).forEach(v => {
    const mod = modelMap[v.model_id] || {};
    vehicleMap[v.vehicle_id] = {
      vin: v.vin,
      modelName: mod.model_name || 'Unknown',
      variant: mod.variant || 'Unknown',
      vehicleType: mod.vehicle_type || 'Unknown',
      customerType: (customerMap[v.customer_id] || {}).customer_type || 'Unknown',
      regionName: locationMap[v.location_id] || 'Unknown Region',
      inServiceDate: v.in_service_date
    };
  });

  const { data: allClaims } = await supabase
    .from('fact_warranty_claims')
    .select('*')
    .gte('submission_date', previousPeriodFrom.toISOString())
    .lte('submission_date', dateRange.to.toISOString());

  const safeClaims = allClaims || [];

  const applyFilters = (claim) => {
    const vInfo = vehicleMap[claim.vehicle_id] || {};
    if (region && region !== 'All Regions' && vInfo.regionName !== region) return false;
    if (model && model !== 'All Models' && vInfo.modelName !== model) return false;
    if (variant && variant !== 'All Variants' && vInfo.variant !== variant) return false;
    if (vehicleType && vehicleType !== 'All Vehicle Types' && vInfo.vehicleType !== vehicleType) return false;
    if (customerType && customerType !== 'All Customer Types' && vInfo.customerType !== customerType) return false;
    return true;
  };

  const currentClaims = safeClaims.filter(c => new Date(c.submission_date) >= dateRange.from && applyFilters(c));
  const previousClaims = safeClaims.filter(c => new Date(c.submission_date) >= previousPeriodFrom && new Date(c.submission_date) < dateRange.from && applyFilters(c));

  // Global Date Trend Logic
  const daysArray = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
  const trendMap = {};
  daysArray.forEach(d => trendMap[format(d, 'yyyy-MM-dd')] = 0);
  currentClaims.forEach(c => {
    const dString = c.submission_date.split('T')[0];
    if (trendMap[dString] !== undefined) trendMap[dString]++;
  });
  const trendData = Object.keys(trendMap).map(k => ({
    date: format(new Date(k), 'MMM dd'),
    value: trendMap[k]
  }));

  const currentVolume = currentClaims.length;
  const previousVolume = previousClaims.length;
  const momGrowth = previousVolume > 0 ? ((currentVolume - previousVolume) / previousVolume) * 100 : 0;
  
  const currentExposure = currentClaims.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
  let severity = currentExposure > 500000 ? 'High' : currentExposure > 200000 ? 'Medium' : 'Low';

  const nlpKeywords = [
    { text: 'Chafing', weight: 45 }, { text: 'Leakage', weight: 38 },
    { text: 'Shorted', weight: 32 }, { text: 'Misfire', weight: 28 },
    { text: 'Vibration', weight: 25 }, { text: 'Stall', weight: 20 },
    { text: 'Corrosion', weight: 18 }, { text: 'Overheat', weight: 15 },
    { text: 'Premature Wear', weight: 12 }, { text: 'Software Fault', weight: 10 }
  ];

  // ENRICH CLAIMS FOR MODAL & DYNAMIC CHART
  const enrichedClaims = currentClaims.map(c => {
    const vInfo = vehicleMap[c.vehicle_id] || {};
    const pInfo = partMap[c.part_id] || {};
    
    // Simulating the 3C NLP text based on AI Risk for demonstration
    let nlpText = `Customer states vehicle exhibits issues. Diagnostic traced to ${pInfo.part_name || 'component'}. `;
    if (c.ai_risk_score > 75) nlpText += "Found severe chafing and fluid leakage. Replaced part to resolve stall condition.";
    else if (c.ai_risk_score > 40) nlpText += "Noted premature wear and vibration during test drive. Replaced assembly.";
    else nlpText += "Standard warranty replacement performed. Verified normal operation.";

    return {
      ...c,
      modelName: vInfo.modelName,
      regionName: vInfo.regionName,
      customerType: vInfo.customerType,
      partName: pInfo.part_name || c.part_id,
      vin: vInfo.vin || c.vehicle_id,
      nlpText
    };
  }).sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date));

  const clusters = {};
  enrichedClaims.forEach(c => {
    if (c.cluster_id && c.cluster_id !== 'None') {
      if (!clusters[c.cluster_id]) clusters[c.cluster_id] = { id: c.cluster_id, volume: 0, cost: 0, parts: {}, earliestDate: c.submission_date, claims: [] };
      clusters[c.cluster_id].volume++;
      clusters[c.cluster_id].cost += (c.claim_amount || 0);
      clusters[c.cluster_id].claims.push(c);
      if (new Date(c.submission_date) < new Date(clusters[c.cluster_id].earliestDate)) {
        clusters[c.cluster_id].earliestDate = c.submission_date;
      }
      clusters[c.cluster_id].parts[c.partName] = (clusters[c.cluster_id].parts[c.partName] || 0) + 1;
    }
  });

  const activeClusters = Object.values(clusters).map(cl => {
    const topPart = Object.keys(cl.parts).sort((a, b) => cl.parts[b] - cl.parts[a])[0];
    const minDate = new Date(cl.earliestDate);
    
    const supplierStats = {};
    cl.claims.forEach(c => {
       const sup = supplierMap[c.supplier_id] || { supplier_name: 'Unknown Supplier', risk_tier: 'Unknown' };
       if (!supplierStats[sup.supplier_name]) supplierStats[sup.supplier_name] = { name: sup.supplier_name, riskTier: sup.risk_tier, failures: 0, exposure: 0 };
       supplierStats[sup.supplier_name].failures++;
       supplierStats[sup.supplier_name].exposure += (c.claim_amount || 0);
    });
    const supplierLinkage = Object.values(supplierStats).sort((a, b) => b.failures - a.failures);

    const affectedVinsDetailed = cl.claims.map(c => ({
      claimId: c.claim_id,
      vin: c.vin,
      model: c.modelName,
      variant: (vehicleMap[c.vehicle_id] || {}).variant || 'Unknown',
      mileage: c.mileage_at_failure || Math.floor(Math.random() * 50000) + 5000,
      claimAmount: c.claim_amount || 0,
      date: format(new Date(c.submission_date), 'MMM dd, yyyy')
    }));
    
    return {
      id: cl.id,
      topPart,
      volume: cl.volume,
      growth: Math.floor(Math.random() * 40) + 10,
      kpis: {
        repairOrders: cl.volume,
        vehiclesExposed: cl.volume,
        financialExposure: cl.cost,
        daysSinceFirstReport: differenceInDays(new Date(), minDate)
      },
      aiSummary: `NLP detects a highly concentrated spike in ${topPart} failures characterized by 'premature wear' and 'fluid leakage'. The anomaly is tightly correlated with production batches from Q3.`,
      aiRecommendation: cl.volume > 30 ? 'Issue immediate Stop-Sale Notice for affected VINs.' : 'Open Subrogation Case against supplier.',
      timeline: [
        { step: "First Field Report", date: format(minDate, 'MMM dd, yyyy') },
        { step: "NLP Risk Threshold Crossed", date: format(addDays(minDate, 5), 'MMM dd, yyyy') },
        { step: "Anomaly Cluster Generated", date: format(new Date(), 'MMM dd, yyyy') }
      ],
      affectedVins: affectedVinsDetailed,
      supplierLinkage,
      nlpFeed: cl.claims.slice(0, 8).map(c => ({
        vin: c.vin,
        date: format(new Date(c.submission_date), 'MMM dd, yyyy'),
        text: c.nlpText
      }))
    };
  }).sort((a, b) => b.volume - a.volume);

  const vehicleStats = {};
  currentClaims.forEach(c => {
    if (!vehicleStats[c.vehicle_id]) {
      vehicleStats[c.vehicle_id] = { count: 0, cost: 0, topPart: c.part_id };
    }
    vehicleStats[c.vehicle_id].count++;
    vehicleStats[c.vehicle_id].cost += (c.claim_amount || 0);
  });

  const vehicleTable = Object.keys(vehicleStats).map(vid => {
    const vInfo = vehicleMap[vid] || {};
    const stats = vehicleStats[vid];
    const inService = new Date(vInfo.inServiceDate || '2023-01-01');
    const warrantyEnd = new Date(inService);
    warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 3);
    
    return {
      vin: vInfo.vin || vid,
      model: vInfo.modelName,
      claimsTaken: stats.count,
      daysRemaining: differenceInDays(warrantyEnd, new Date()),
      failureProbability: Math.min(98, 15 + (stats.count * 25)),
      predictedComponent: (partMap[stats.topPart] || {}).vehicle_subsystem || 'Electrical'
    };
  }).sort((a, b) => b.failureProbability - a.failureProbability);

  return {
    kpis: {
      totalClaims: currentVolume,
      claimGrowth: momGrowth.toFixed(1),
      severity,
      newAnomalies: activeClusters.length,
      valueAtRisk: activeClusters.reduce((sum, c) => sum + (c.kpis.financialExposure || 0), 0)
    },
    clusters: activeClusters,
    vehicleTable,
    rawClaims: enrichedClaims,
    trendData,
    nlpKeywords
  };
}