"use client";

import React from "react";

export interface RangeState {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
}

export default function Filters({
  range,
  onChange,
  onRefresh,
  loading,
}: {
  range: RangeState;
  onChange: (next: RangeState) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="filters">
      <label>
        From
        <input
          type="date"
          value={range.from}
          max={range.to}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={range.to}
          min={range.from}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
        />
      </label>
      <button className="btn primary" onClick={onRefresh} disabled={loading}>
        {loading ? "Loading…" : "Refresh"}
      </button>
    </div>
  );
}
