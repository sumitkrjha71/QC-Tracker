"use client";

import React from "react";

import { formatDateTime, formatMinutes } from "@/lib/format";
import type { StageKey, VinJourney } from "@/lib/types";

function stageMin(j: VinJourney, key: StageKey): number | null {
  return j.stages.find((s) => s.key === key)?.minutes ?? null;
}

/** Recently delivered VINs with full per-stage breakdown and SLA flag. */
export default function VinTable({ rows }: { rows: VinJourney[] }) {
  return (
    <div className="card">
      <h2>
        Recent deliveries
        <span className="hint">per-VIN stage breakdown</span>
      </h2>
      {rows.length === 0 ? (
        <div className="muted center" style={{ padding: 30 }}>
          No deliveries in this window.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>VIN</th>
                <th>SKU</th>
                <th>Media</th>
                <th>Tech</th>
                <th>AI</th>
                <th>QC</th>
                <th>Total TAT</th>
                <th>SLA</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.vin}-${r.skuId}`}>
                  <td className="mono">{r.vin}</td>
                  <td className="mono">{r.skuId ?? "—"}</td>
                  <td className="muted">{r.mediaType}</td>
                  <td>{formatMinutes(stageMin(r, "tech"))}</td>
                  <td>{formatMinutes(stageMin(r, "ai"))}</td>
                  <td>{formatMinutes(stageMin(r, "qc"))}</td>
                  <td>
                    <b>{formatMinutes(r.totalTatMinutes)}</b>
                  </td>
                  <td>
                    {r.withinSla == null ? (
                      "—"
                    ) : r.withinSla ? (
                      <span className="pill delivered">on-SLA</span>
                    ) : (
                      <span className="pill aging">breach</span>
                    )}
                  </td>
                  <td className="muted">{formatDateTime(r.qcDoneAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
