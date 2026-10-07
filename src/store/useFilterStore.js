import { create } from 'zustand';
import { subDays } from 'date-fns';

// Date range presets are anchored to the seed data's as-of date, not to today
export const DATE_ANCHOR = new Date('2026-09-24');
export const DATE_PRESETS = [7, 30, 90];
export const DEFAULT_DATE_DAYS = 90;
export const lastNDays = (days) => ({ from: subDays(DATE_ANCHOR, days), to: DATE_ANCHOR });

export const useFilterStore = create((set) => ({
  region: 'All Regions',
  model: 'All Models',
  variant: 'All Variants',
  vehicleType: 'All Vehicle Types',
  customerType: 'All Customer Types',
  dateRange: lastNDays(DEFAULT_DATE_DAYS),

  setRegion: (region) => set({ region }),
  setModel: (model) => set({ model }),
  setVariant: (variant) => set({ variant }),
  setVehicleType: (vehicleType) => set({ vehicleType }),
  setCustomerType: (customerType) => set({ customerType }),
  setDateRange: (dateRange) => set({ dateRange }),
  
  resetFilters: () => set({
    region: 'All Regions',
    model: 'All Models',
    variant: 'All Variants',
    vehicleType: 'All Vehicle Types',
    customerType: 'All Customer Types',
    dateRange: lastNDays(DEFAULT_DATE_DAYS)
  })
}));