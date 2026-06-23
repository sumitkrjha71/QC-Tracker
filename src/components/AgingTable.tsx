"use client";

import React from "react";

import { formatDateTime, formatMinutes } from "@/lib/format";
import type { VinJourney } from "@/lib/types";

const STATUS_CLASS: Record<string, string> = {
  in_tech: "tech",
  in_ai: "ai",
  in_qc: "qc",
};

/** VINs currently stuck past their stage aging threshold, worst first. */
export default function AgingTable({ rows }: { rows: VinJourney[] }) {
  return (
    <div className="card">
      <h2>
        Aging / stuck VINs
        <span className="hint">in-progress beyond stage threshold</span>
      </h2>
      {rows.length === 0 ? (
        <div className="muted center" style={{ padding: 30 }}>
          Nothing aging right now. 🎉
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>VIN</th>
                <th>SKU</th>
                <th>Stage</th>
                <th>Age in stage</th>
                <th>Received</th>
                <th>Dealer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.vin}-${r.skuId}`}>
                  <td className="mono">{r.vin}</td>
                  <td className="mono">{r.skuId ?? "—"}</td>
                  <td>
                    <span className={`pill ${STATUS_CLASS[r.status] ?? ""}`}>
                      {r.currentStageLabel}
                    </span>
                  </td>
                  <td>
                    <span className="pill aging">
                      {formatMinutes(r.ageInStageMinutes)}
                    </span>
                  </td>
                  <td className="muted">{formatDateTime(r.receivedAt)}</td>
                  <td className="muted">{r.dealer ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
