import { format } from 'date-fns';
import { supabase } from '../config/supabaseClient';

// Shared by the analytics modules: global sidebar filters -> the p_filters jsonb contract
// (docs/modules/claims-repair-analytics/design.md §6.3), and the RPC wrapper.

const ALL = {
  region: 'All Regions',
  model: 'All Models',
  variant: 'All Variants',
  vehicleType: 'All Vehicle Types',
  customerType: 'All Customer Types',
};

const orNull = (value, sentinel) => (value && value !== sentinel ? value : null);

// "All …" sentinels in the store become null (= no filter) in the contract
export function globalFilters(global) {
  return {
    date_from: global.dateRange?.from ? format(global.dateRange.from, 'yyyy-MM-dd') : null,
    date_to: global.dateRange?.to ? format(global.dateRange.to, 'yyyy-MM-dd') : null,
    region: orNull(global.region, ALL.region),
    brand: orNull(global.model, ALL.model),
    variant: orNull(global.variant, ALL.variant),
    vehicle_type: orNull(global.vehicleType, ALL.vehicleType),
    customer_type: orNull(global.customerType, ALL.customerType),
  };
}

// chips: { <p_filters key>: [{ value, label }] } -> { key: [values] }
export function chipFilters(chips) {
  return Object.fromEntries(Object.entries(chips).filter(([, list]) => list.length).map(([key, list]) => [key, list.map((c) => c.value)]));
}

export class BackendMissingError extends Error {}

// Identical calls share one request: React StrictMode runs effects twice in dev, and tab switches re-ask the same
// questions. The data only changes when migrations reload it, so a short-lived cache is safe.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

export function rpc(name, args) {
  const key = `${name}|${JSON.stringify(args)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = callRpc(name, args);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));  // never cache failures
  return promise;
}

// The database is a small shared instance with a 3 s statement timeout for the API role. A page fires several
// aggregate RPCs at once; running at most MAX_IN_FLIGHT together (and retrying a timeout once) keeps a burst
// from pushing individual statements past the limit.
const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const queue = [];

function acquire() {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release() {
  const next = queue.shift();
  if (next) next();
  else inFlight -= 1;
}

async function callRpc(name, args) {
  await acquire();
  let result;
  try {
    result = await supabase.rpc(name, args);
    if (result.error?.code === '57014') {  // statement timeout: retry once after a short pause
      await new Promise((r) => setTimeout(r, 600));
      result = await supabase.rpc(name, args);
    }
  } finally {
    release();
  }
  const { data, error } = result;
  if (error) {
    // PGRST202 = function not found: the module's migrations have not been applied yet
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      throw new BackendMissingError(error.message);
    }
    throw new Error(error.message);
  }
  return data;
}
