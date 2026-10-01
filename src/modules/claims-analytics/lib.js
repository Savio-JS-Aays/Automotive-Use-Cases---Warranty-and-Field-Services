export { useAsync, CHART_COLORS, tooltipStyle, sortByOrder, num } from '../../lib/analytics';

export const STATUS_COLORS = { Open: '#f59e0b', Approved: '#10b981', Rejected: '#f43f5e' };

// Ordered bucket keys (the RPCs return them ordered by cost; charts need natural order)
export const MIS_BUCKETS = ['pre-service', '0-12', '13-24', '25-36', '37-48', '48+'];
export const KM_BUCKETS = ['0-50k', '50-100k', '100-200k', '200-300k', '300k+'];
export const CYCLE_BUCKETS = ['0-7', '8-14', '15-21', '22-30', '30+', 'Not adjudicated'];
export const AGING_BUCKETS = ['0-7', '8-30', '31-60', '60+', 'Future-dated'];
export const STATUS_GROUPS = ['Open', 'Approved', 'Rejected'];

// months in service -> MIS bucket used by the filter contract
export function misBucketForMonths(m) {
  if (m < 0) return 'pre-service';
  if (m < 12) return '0-12';
  if (m < 24) return '13-24';
  if (m < 36) return '25-36';
  if (m < 48) return '37-48';
  return '48+';
}

export function kmBucketForKm(km) {
  if (km < 50000) return '0-50k';
  if (km < 100000) return '50-100k';
  if (km < 200000) return '100-200k';
  if (km < 300000) return '200-300k';
  return '300k+';
}

