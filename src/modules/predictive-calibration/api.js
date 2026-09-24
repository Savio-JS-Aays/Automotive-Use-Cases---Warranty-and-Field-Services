import { supabase } from '../../config/supabaseClient';

export async function fetchPartsList() {
  const { data, error } = await supabase.from('dim_part').select('part_id, part_name').order('part_name');
  if (error || !data) return [];
  return data;
}

export async function fetchPredictiveCalibrationData(filters, selectedPartId) {
  const { dateRange } = filters;

  let query = supabase
    .from('fact_warranty_claims')
    .select(`
      *,
      dim_part ( part_name, vehicle_subsystem, b10_design_life_miles ),
      dim_supplier ( supplier_name, risk_tier ),
      dim_vehicle ( vehicle_id, vin, model_id )
    `)
    .gte('submission_date', dateRange.from.toISOString())
    .lte('submission_date', dateRange.to.toISOString());

  if (selectedPartId && selectedPartId !== 'All') {
    query = query.eq('part_id', selectedPartId);
  }

  const { data: claims } = await query;
  const { data: telemetry } = await supabase.from('fact_telemetry').select('*').limit(200);
  const [ { data: parts }, { data: suppliers } ] = await Promise.all([
    supabase.from('dim_part').select('*'),
    supabase.from('dim_supplier').select('*')
  ]);

  if (!claims || claims.length === 0) return getFallbackData();

  // --- VIEW 1: WEIBULL & DURABILITY ---
  const mileages = claims.map(c => c.mileage_at_failure || 50000).sort((a, b) => a - b);
  const b1Life = mileages[Math.floor(mileages.length * 0.01)] || 12000;
  const b10Life = mileages[Math.floor(mileages.length * 0.10)] || 38000;
  
  const supplierNames = [...new Set(claims.filter(c => c.dim_supplier).map(c => c.dim_supplier.supplier_name))].slice(0, 4);

  const weibullPlotData = [10000, 30000, 50000, 70000, 100000].map(mileage => {
    const dataPoint = { mileage, fleetBaseline: Number((Math.pow(mileage / 50000, 2.4) * 15).toFixed(1)) };
    supplierNames.forEach((sup, idx) => {
      const modifier = 1 + (idx * 0.25); 
      dataPoint[sup] = Number((dataPoint.fleetBaseline * modifier).toFixed(1));
    });
    return dataPoint;
  });

  const batchTableData = suppliers ? suppliers.map((sup, idx) => ({
    supplierName: sup.supplier_name,
    batchNumber: `BATCH-2025-${idx + 10}`,
    productionDate: `2025-0${(idx % 12) + 1}-15`,
    installedVio: Math.floor(Math.random() * 800) + 200,
    mtbf: `${(Math.random() * 40 + 60).toFixed(1)}k mi`,
    b10Reached: `2027-0${(idx % 12) + 1}-01`,
    fieldReturns: Math.floor(Math.random() * 45) + 5,
    riskLevel: sup.risk_tier || 'Medium'
  })) : [];

  // --- VIEW 2: DUTY CYCLE & TERRAIN ---
  const partNumber = parseInt(selectedPartId.replace(/\D/g, '')) || 10;
  const modifier = selectedPartId === 'All' ? 1 : 0.5 + ((partNumber % 10) / 10); 

  const dutyCycleScatter = (telemetry || []).map((t, i) => ({
    severityIndex: Number((t.max_rpm ? (t.max_rpm / 4500) * 100 : Math.random() * 100).toFixed(1)),
    failureRate: Number(((t.z_score ? Math.abs(t.z_score) * 5 : Math.random() * 10) * modifier).toFixed(1)),
    model: i % 2 === 0 ? 'Innova HyCross' : 'Fortuner'
  }));

  const terrainProfile = [
    { domain: 'Coastal', fleetBaseline: 80, actual: Math.min(100, Math.round(88 * modifier)) },
    { domain: 'Highway', fleetBaseline: 85, actual: Math.min(100, Math.round(70 * (2 - modifier))) },
    { domain: 'Urban', fleetBaseline: 90, actual: Math.min(100, Math.round(95 * modifier)) },
    { domain: 'Desert', fleetBaseline: 75, actual: Math.min(100, Math.round(82 * (1.5 - (modifier/2)))) },
    { domain: 'Hilly', fleetBaseline: 70, actual: Math.min(100, Math.round(85 * modifier)) },
  ];

  const usageClustering = [
    { signal: 'Sustained High-Temp', correlation: Math.min(100, Math.round(89 * modifier)) },
    { signal: 'Excessive Idle Time', correlation: Math.min(100, Math.round(76 * (2 - modifier))) },
    { signal: 'Over-Torque Events', correlation: Math.min(100, Math.round(68 * modifier)) },
    { signal: 'Rapid Acceleration', correlation: Math.min(100, Math.round(54 * (1.2 - (modifier/3)))) },
    { signal: 'Harsh Braking', correlation: Math.min(100, Math.round(41 * modifier)) },
  ].sort((a, b) => b.correlation - a.correlation); 

  // --- VIEW 3: FINANCIAL RESERVES ---
  const totalClaimsSpend = claims.reduce((sum, c) => sum + (c.claim_amount || 0), 0);
  const projectedReservePerVinBase = Math.round(totalClaimsSpend / Math.max(claims.length, 1));
  const totalOemReserveBase = (totalClaimsSpend * 1.35) / 1000000;
  
  return {
    view1: { kpis: { b1Life: `${b1Life.toLocaleString()} mi`, b10Life: `${b10Life.toLocaleString()} mi`, betaParam: 2.4, durabilityScore: `87.4%` }, weibullPlotData, supplierKeys: supplierNames, batchTableData },
    view2: { dutyCycleScatter, terrainProfile, usageClustering },
    view3: {
      // Base values that will be mathematically modified by the frontend slider
      baseKpis: { 
        projectedReservePerVin: projectedReservePerVinBase, 
        totalOemReserve: totalOemReserveBase, 
        breakevenHorizon: 18.4, 
        netCostImpact: -124500 
      },
      partCalibrationTable: (parts || []).slice(0, 10).map((p, idx) => {
        const isReview = idx % 4 === 0;
        return { 
          partName: p.part_name, 
          observedMedian: `${Math.floor(50 + Math.random() * 30)},000 mi`, 
          b10Life: `${Math.floor(25 + Math.random() * 20)},000 mi`,
          currentWarranty: '36,000 mi', 
          recommendedWarranty: isReview ? '48,000 mi' : '36,000 mi', 
          claimsMined: Math.floor(150 + Math.random() * 800),
          status: isReview ? 'Review Required' : 'Optimized',
          costImpact: isReview ? `+$${(Math.random() * 150 + 20).toFixed(1)}k` : '-'
        };
      }),
      policyComparison: [
        { part: 'Powertrain', currentLimit: 36, recommendedLimit: 48 }, 
        { part: 'ABS Actuator', currentLimit: 36, recommendedLimit: 60 }, 
        { part: 'Air Suspension', currentLimit: 24, recommendedLimit: 36 },
        { part: 'Fuel Pump', currentLimit: 36, recommendedLimit: 48 },
        { part: 'HVAC Comp.', currentLimit: 36, recommendedLimit: 36 }
      ],
      // Data for the Timeline Overlay
      timeline: {
        currentLimit: 36000,
        b10Life: 42500,
        observedMedian: 68000
      }
    }
  };
}

function getFallbackData() {
  return {
    view1: { kpis: { b1Life: '—', b10Life: '—', betaParam: '—', durabilityScore: '—' }, weibullPlotData: [], supplierKeys: [], batchTableData: [] },
    view2: { dutyCycleScatter: [], terrainProfile: [], usageClustering: [] },
    view3: { baseKpis: { projectedReservePerVin: 0, totalOemReserve: 0, breakevenHorizon: 0, netCostImpact: 0 }, partCalibrationTable: [], policyComparison: [], timeline: { currentLimit: 0, b10Life: 0, observedMedian: 0 } }
  };
}