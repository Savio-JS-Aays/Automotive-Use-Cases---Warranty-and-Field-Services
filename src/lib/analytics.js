import { useEffect, useState } from 'react';

// Shared by the analytics modules (Claims & Repair, Reliability & Early Warning).

// ---------------------------------------------------------------------------
// Data hook: runs an async fetcher whenever `key` changes
// ---------------------------------------------------------------------------
export function useAsync(fetcher, key) {
  const [state, setState] = useState({ key: undefined, data: null, error: null });
  useEffect(() => {
    let alive = true;
    fetcher()
      .then((data) => alive && setState({ key, data, error: null }))
      .catch((error) => alive && setState({ key, data: null, error }));
    return () => {
      alive = false;
    };
    // `key` is the serialised dependency list chosen by the caller; `fetcher` is a fresh closure every render
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const loading = state.key !== key;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading };
}

export const CHART_COLORS = ['#0284c7', '#6366f1', '#f97316', '#10b981', '#f43f5e', '#a855f7', '#eab308', '#64748b'];

// Tooltip body for Recharts: consistent styling
export const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
  labelStyle: { fontWeight: 600, color: '#0f172a' },
};

export function sortByOrder(rows, order, key = 'key') {
  const idx = (k) => (order.indexOf(k) === -1 ? 999 : order.indexOf(k));
  return [...rows].sort((a, b) => idx(a[key]) - idx(b[key]));
}

export const num = (v) => (v === null || v === undefined ? null : Number(v));
