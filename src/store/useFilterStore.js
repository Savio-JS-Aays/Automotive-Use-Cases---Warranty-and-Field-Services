import { create } from 'zustand';
import { subDays } from 'date-fns';

export const useFilterStore = create((set) => ({
  region: 'All Regions',
  model: 'All Models',
  variant: 'All Variants',
  vehicleType: 'All Vehicle Types',
  customerType: 'All Customer Types',
  dateRange: {
    from: subDays(new Date('2026-09-24'), 180), // Defaulting to 6 months back for seed data
    to: new Date('2026-09-24'),
  },

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
    dateRange: { from: subDays(new Date('2026-09-24'), 180), to: new Date('2026-09-24') }
  })
}));