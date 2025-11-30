
/*
file: src/ScanResults.jsx
programmer: Jack Ray
===================================================
Component to display the results of a completed scan. Based on the mockup
*/

import React, { useMemo, useState } from "react";
import "./styles/results.css";


//TODO: Have the Scan Results sort by something that is meaningful like the devices name. As of now sorting by A-Z is not very useful since it is a date string.
// Detail view of a single scan; dropdown lets you hop between stored results. 
const SORT_CHOICES = [
  { value: "input", label: "Input order" },
  { value: "item-asc", label: "Item A-Z" },
  { value: "item-desc", label: "Item Z-A" },
];

export default function ScanResults({
  scan,
  allScans = [],
  onSelectScan,
  onSelectDevice,
  onBackToHome,
  showSaveButton = false,
  onSaveScan,
  isSavingScan = false,
  saveFeedback = null,
}) {
  const [sortChoice, setSortChoice] = useState("input");

  // Sort entirely on the client so we can flip between input order and alphabetical views.
  function handleDeviceActivate(row) {
    if (typeof onSelectDevice === "function") {
      onSelectDevice(row);
    }
  }

  const findings = useMemo(() => {
    if (!scan?.findings) return [];
    const base = [...scan.findings];
    if (sortChoice === "item-asc") {
      base.sort((a, b) => a.itemDiscovered.localeCompare(b.itemDiscovered));
    } else if (sortChoice === "item-desc") {
      base.sort((a, b) => b.itemDiscovered.localeCompare(a.itemDiscovered));
    } else {
      base.sort((a, b) => a.position - b.position);
    }
    return base;
  }, [scan, sortChoice]);

  // No scan selected? Fall back to a empty state instead of rendering the table.
  if (!scan) {
    return (
      <section className="results-shell">
        <header className="results-toolbar">
          <div className="results-meta">
            <h1 className="results-title">No results yet</h1>
            <p className="results-subtitle">Create a scan to see findings.</p>
          </div>
          {onBackToHome && (
            <button type="button" className="results-backBtn" onClick={onBackToHome}>
              Back
            </button>
          )}
        </header>
      </section>
    );
  }

  // Subtitle shows when the scan ran plus how many targets were in scope.
  const submissionInfo = `${scan.submittedAt} - ${scan.targets.length} target${scan.targets.length === 1 ? "" : "s"}`;

  return (
    <section className="results-shell" aria-labelledby="scan-results-heading">
      <header className="results-toolbar">
        <div className="results-meta">
          <div className="results-metaTop">
            {onBackToHome && (
              <button type="button" className="results-backBtn" onClick={onBackToHome}>
                Back
              </button>
            )}
            {allScans.length > 1 && (
              <label className="results-switcher">
                <span className="results-switcherLabel">Scan</span>
                <select
                  value={scan.id}
                  onChange={(e) => onSelectScan?.(e.target.value)}
                  aria-label="Select a scan to view"
                >
                  {allScans.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <h1 id="scan-results-heading" className="results-title">{scan.name}</h1>
          <p className="results-subtitle">{submissionInfo}</p>
          <dl className="results-summary" aria-label="Scan configuration summary">
            <div>
              <dt>Targets</dt>
              <dd>{scan.targets.join(", ")}</dd>
            </div>
            {scan.exclusions.length > 0 && (
              <div>
                <dt>Exclusions</dt>
                <dd>{scan.exclusions.join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>Detection Options</dt>
              <dd>{scan.moduleSummary}</dd>
            </div>
          </dl>
        </div>

        <div className="results-controls">
          <label className="results-sort">
            <span className="results-sortLabel">Sort</span>
            <select value={sortChoice} onChange={(e) => setSortChoice(e.target.value)}>
              {SORT_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="results-pdfBtn"
            onClick={() => window.print()}
          >
            Convert to PDF
          </button>
          {showSaveButton && (
            <button
              type="button"
              className="results-saveBtn"
              onClick={onSaveScan}
              disabled={isSavingScan}
            >
              {isSavingScan ? "Saving..." : "Save Scan Report"}
            </button>
          )}
        </div>
        {saveFeedback && (
          <p
            className={`results-saveFeedback results-saveFeedback--${
              saveFeedback.type === "error" ? "error" : "success"
            }`}
          >
            {saveFeedback.message}
          </p>
        )}
      </header>

      <div className="results-tableWrap">
        {/* Table layout mirrors the mock with numbered items and key findings columns. */}
        <table className="results-table">
          <thead>
            <tr>
              <th scope="col" className="results-colIndex">#</th>
              <th scope="col">Item Discovered</th>
              <th scope="col">Protocol Warnings</th>
              <th scope="col">Remediation Tips</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((row, idx) => {
              const devicePayload = {
                ...row,
                scanId: scan?.id,
                scanName: scan?.name,
                submittedAt: scan?.submittedAt,
              };
              const handleKey = (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleDeviceActivate(devicePayload);
                }
              };

              return (
                <tr
                  key={row.id || `${scan?.id || "scan"}-${idx}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${row.itemDiscovered || `device ${idx + 1}`}`}
                  onClick={() => handleDeviceActivate(devicePayload)}
                  onKeyDown={handleKey}
                >
                  <td className="results-colIndex" data-title="#">{idx + 1}</td>
                  <td data-title="Item Discovered">
                    <div className="results-item">
                      <span className="results-itemName">{row.itemDiscovered}</span>
                      {row.notes && <span className="results-itemNotes">{row.notes}</span>}
                    </div>
                  </td>
                  <td data-title="Protocol Warnings">{row.protocolWarnings}</td>
                  <td data-title="Remediation Tips">{row.remediationTips}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="results-footer" aria-label="Pagination">
        <span>Page 1</span>
        <span>Showing {findings.length} item{findings.length === 1 ? "" : "s"}</span>
      </footer>
    </section>
  );
}
