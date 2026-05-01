
/*
file: src/ScanResults.jsx
programmer: Jack Ray
===================================================
Component to display the results of a completed scan. Based on the mockup
*/

import React, { useEffect, useMemo, useState } from "react";
import "./styles/results.css";


//TODO: Have the Scan Results sort by something that is meaningful like the devices name. As of now sorting by A-Z is not very useful since it is a date string.
// Detail view of a single scan; dropdown lets you hop between stored results. 
const SORT_CHOICES = [
  { value: "input", label: "Input order" },
  { value: "item-asc", label: "Item A-Z" },
  { value: "item-desc", label: "Item Z-A" },
];

function formatDurationFromMs(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function getLongScanStatusLabel(session) {
  if (!session) return "Not started";
  if (session.active) return "Running";
  if (session.stopReason === "timer") return "Timer complete";
  return "Stopped";
}

function formatLongScanTimestamp(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function isStrictLongScanFinding(finding) {
  const evidence = finding?.evidence;
  if (!finding || typeof finding !== "object" || !evidence || typeof evidence !== "object") return false;
  if (!finding.findingId || !finding.severity) return false;
  if (!evidence.timestamp || !evidence.sourceIp || !evidence.destinationIp) return false;
  if (evidence.packetSize === undefined || evidence.frequency === undefined || evidence.score === undefined) return false;
  return true;
}

function normalizeLongScanRow(finding) {
  const evidence = finding.evidence;
  return {
    findingId: finding.findingId,
    type: finding.type || "ANOMALY",
    title: finding.title || "Network Traffic Anomaly",
    severity: finding.severity,
    sourceIp: evidence.sourceIp,
    destinationIp: evidence.destinationIp,
    packetSize: evidence.packetSize,
    packetFrequency: evidence.frequency,
    score: evidence.score,
    anomalyDetectedAt: formatLongScanTimestamp(evidence.timestamp),
  };
}

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
  isLoadingItems = false,
  itemsError = null,
  longScanSession = null,
  onStopLongScan,
  onResumeLongScan,
  onRetryLoadItems,
}) {
  const [sortChoice, setSortChoice] = useState("input");
  const isLongScan = scan?.scanMode === "long";
  const [clockMs, setClockMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isLongScan || !longScanSession?.active) return undefined;
    const tickId = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tickId);
  }, [isLongScan, longScanSession?.active]);

  // Sort entirely on the client so we can flip between input order and alphabetical views.
  function handleDeviceActivate(row) {
    if (typeof onSelectDevice === "function") {
      onSelectDevice(row);
    }
  }

  const findings = useMemo(() => {
    if (!Array.isArray(scan?.findings)) return [];
    const base = [...scan.findings];
    if (sortChoice === "item-asc") {
      base.sort((a, b) =>
        String(a?.itemDiscovered || a?.deviceName || a?.ipAddress || "").localeCompare(
          String(b?.itemDiscovered || b?.deviceName || b?.ipAddress || "")
        )
      );
    } else if (sortChoice === "item-desc") {
      base.sort((a, b) =>
        String(b?.itemDiscovered || b?.deviceName || b?.ipAddress || "").localeCompare(
          String(a?.itemDiscovered || a?.deviceName || a?.ipAddress || "")
        )
      );
    } else {
      base.sort((a, b) => a.position - b.position);
    }
    return base;
  }, [scan, sortChoice]);

  const longScanRows = useMemo(() => {
    if (!isLongScan || !Array.isArray(longScanSession?.rows)) return [];
    const normalizedRows = longScanSession.rows
      .filter((row) => isStrictLongScanFinding(row))
      .map((row) => normalizeLongScanRow(row));
    return normalizedRows.reverse();
  }, [isLongScan, longScanSession?.rows]);

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
  const targetList = Array.isArray(scan.targets) ? scan.targets : [];
  const exclusions = Array.isArray(scan.exclusions) ? scan.exclusions : [];
  const submissionInfo = `${scan.submittedAt} - ${targetList.length} target${targetList.length === 1 ? "" : "s"}`;
  const longScanReferenceMs = longScanSession?.active
    ? clockMs
    : (longScanSession?.stoppedAtMs || longScanSession?.endAtMs || 0);
  const longScanRemainingMs = longScanSession
    ? Math.max(0, longScanSession.endAtMs - longScanReferenceMs)
    : 0;
  const longScanStatusLabel = getLongScanStatusLabel(longScanSession);

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
              <dd>{targetList.join(", ")}</dd>
            </div>
            {exclusions.length > 0 && (
              <div>
                <dt>Exclusions</dt>
                <dd>{exclusions.join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>Detection Options</dt>
              <dd>{scan.moduleSummary}</dd>
            </div>
          </dl>
        </div>

        <div className="results-controls">
          {!isLongScan && (
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
          )}
          <button
            type="button"
            className="results-pdfBtn"
            onClick={() => window.print()}
          >
            Convert to PDF
          </button>
          {isLongScan && (
            <button
              type="button"
              className="results-stopBtn"
              onClick={longScanSession?.active ? onStopLongScan : onResumeLongScan}
              disabled={!longScanSession?.active && longScanRemainingMs <= 0}
            >
              {longScanSession?.active ? "Stop Scan" : "Resume Scan"}
            </button>
          )}
          {isLongScan && (
            <button
              type="button"
              className="results-saveBtn"
              disabled
              title="Coming soon"
            >
              Save Scan Report
            </button>
          )}
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

      {isLongScan ? (
        <>
          <div className="results-longStatus">
            <span className={`results-longBadge results-longBadge--${longScanSession?.active ? "running" : "stopped"}`}>
              {longScanStatusLabel}
            </span>
            <span>Configured Duration: {formatDurationFromMs(longScanSession?.totalDurationMs || 0)}</span>
            <span>Time Remaining: {formatDurationFromMs(longScanRemainingMs)}</span>
            <span>Rows Streamed: {longScanRows.length}</span>
          </div>
          {longScanRows.length === 0 ? (
            <p className="results-empty">Waiting for dynamic packet events...</p>
          ) : (
            <>
              <div className="results-tableWrap">
                <table className="results-table results-table--dynamic">
                  <thead>
                    <tr>
                      <th scope="col" className="results-colIndex">#</th>
                      <th scope="col">Finding ID</th>
                      <th scope="col">Type</th>
                      <th scope="col">Title</th>
                      <th scope="col">Severity</th>
                      <th scope="col">Source IP</th>
                      <th scope="col">Destination IP</th>
                      <th scope="col">Packet Size (bytes)</th>
                      <th scope="col">Packet Freq (pkts/sec)</th>
                      <th scope="col">Score</th>
                      <th scope="col">Timestamp Anomaly Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {longScanRows.map((row, idx) => (
                      <tr key={row.findingId || `${scan?.id || "scan"}-dynamic-${idx}`}>
                        <td className="results-colIndex" data-title="#">{idx + 1}</td>
                        <td data-title="Finding ID">{row.findingId}</td>
                        <td data-title="Type">{row.type}</td>
                        <td data-title="Title">{row.title}</td>
                        <td data-title="Severity">{row.severity}</td>
                        <td data-title="Source IP">{row.sourceIp}</td>
                        <td data-title="Destination IP">{row.destinationIp}</td>
                        <td data-title="Packet Size (bytes)">{row.packetSize}</td>
                        <td data-title="Packet Freq (pkts/sec)">{row.packetFrequency}</td>
                        <td data-title="Score">{row.score}</td>
                        <td data-title="Timestamp Anomaly Detected">{row.anomalyDetectedAt || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="results-footer" aria-label="Dynamic scan summary">
                <span>Live stream</span>
                <span>Showing latest {longScanRows.length} event{longScanRows.length === 1 ? "" : "s"}</span>
              </footer>
            </>
          )}
        </>
      ) : isLoadingItems ? (
        <p className="results-empty">Loading scan report items...</p>
      ) : itemsError ? (
        <div className="results-loadError">
          <p className="results-empty">{itemsError}</p>
          {typeof onRetryLoadItems === "function" && (
            <button type="button" className="results-backBtn" onClick={onRetryLoadItems}>
              Retry
            </button>
          )}
        </div>
      ) : findings.length === 0 ? (
        <p className="results-empty">No items found for this scan report.</p>
      ) : (
        <>
          <div className="results-tableWrap">
            {/* Table layout mirrors the mock with numbered items and key findings columns. */}
            <table className="results-table">
              <thead>
                <tr>
                  <th scope="col" className="results-colIndex">#</th>
                  <th scope="col">Device</th>
                  <th scope="col">Risk</th>
                  <th scope="col">Findings</th>
                  <th scope="col">Top Exposure</th>
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
                      <td data-title="Device">
                        <div className="results-item">
                          <span className="results-itemName">{row.itemDiscovered || row.deviceName || row.ipAddress || "Unknown device"}</span>
                          <span className="results-itemNotes">{row.ipAddress || "N/A"}</span>
                          {row.vendor && <span className="results-itemNotes">Vendor: {row.vendor}</span>}
                          {row.notes && <span className="results-itemNotes">{row.notes}</span>}
                        </div>
                      </td>
                      <td data-title="Risk">
                        <span className={`results-riskBadge results-riskBadge--${String(row.riskLevel || "unknown").toLowerCase()}`}>
                          {row.riskLevel || "UNKNOWN"}
                        </span>
                      </td>
                      <td data-title="Findings">{Number.isFinite(Number(row.findingCount)) ? Number(row.findingCount) : "N/A"}</td>
                      <td data-title="Top Exposure">{row.topExposure || row.protocolWarnings || "N/A"}</td>
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
        </>
      )}
    </section>
  );
}
