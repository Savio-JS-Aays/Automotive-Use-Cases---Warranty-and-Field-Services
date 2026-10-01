import React from 'react';

// Small status / recommendation pill; `styles` maps text -> Tailwind classes (see ../lib.js)
export function Pill({ text, styles }) {
  if (!text) return null;
  return <span className={`inline-block text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${styles[text] || ''}`}>{text}</span>;
}

// Tag for numbers that only cover the 200 connected vehicles
export function ConnectedTag() {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5">
      Connected fleet
    </span>
  );
}
