/**
 * file: src/App.jsx
 * author: Jack Ray
 * ===================================================
 * 
 * App.jsx is the main backbone of the dashboard. It does the following:
 *  - keep track of the current view (home, history, results, device details)
 *  - store scan data, including mock findings for the demo (this will be phased out for database integration)
 *  - coordinate the three modals: new scan wizard, settings, and login
 *  - manage user settings like theme and retention period
 *  - handle navigation and selection between scans and devices
 * 
 * A good amount of this file can be removed when we get actual data flow from the backend, but for now it helps keep the demo functional.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles/base.css";
import "./styles/app-shell.css";
import "./styles/modal.css";
import "./styles/history.css";
import "./styles/theme-dark.css";
import NewScanWizard from "./NewScanWizard.jsx";
import ScanResults from "./ScanResults.jsx";
import LoginModal from "./LoginModal.jsx";
import SettingsModal from "./SettingsModal.jsx";
import DeviceDetails from "./DeviceDetails.jsx";
import logoImage from "./assets/logo.png";


const VIEW_HOME = "home";
const VIEW_HISTORY = "history";
const VIEW_RESULTS = "results";
const VIEW_DEVICE = "device";

const MODULE_LABELS = {
  discover: "Discover hosts",
  serviceDetection: "Service detection",
  legacyProtocols: "Legacy protocols",
  weakCreds: "Weak credentials",
  safeMode: "Safe mode",
};

// Sample data keeps the demo interesting without hitting real services. This will be removed later.
const SAMPLE_DEVICE_NAMES = [
  "TP-Link Archer AX55",
  "Cisco Catalyst 9200",
  "Raspberry Pi 4",
  "Dell OptiPlex 7090",
  "Synology DS920+",
  "Juniper EX2200",
];

const SAMPLE_SERVICE_PROFILES = [
  "HTTP :80, HTTPS :443",
  "SSH :22, SFTP :22",
  "Telnet :23, FTP :21",
  "MQTT :1883, HTTPS :8883",
  "SMB :445, RDP :3389",
  "SNMP :161, NTP :123",
];


const SETTINGS_STORAGE_KEY = "appSettings";

// Base settings values when the app is first opened or storage fails to load.
const DEFAULT_SETTINGS = {
  theme: "light",
  retentionDays: 30,
  defaultOptions: {
    discover: true,
    serviceDetection: true,
    legacyProtocols: false,
    weakCreds: false,
    safeMode: true,
  },
};

// Read users preferences and merge them with defaults so that way we for sure have values set. This is just a precaution in case of schema changes.
function loadSettings() {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      defaultOptions: {
        ...DEFAULT_SETTINGS.defaultOptions,
        ...(parsed?.defaultOptions || {}),
      },
    };
    merged.retentionDays = Math.max(1, Number(merged.retentionDays) || DEFAULT_SETTINGS.retentionDays);
    merged.theme = merged.theme === "dark" ? "dark" : "light";
    return merged;
  } catch (err) {
    console.warn("Failed to read settings from storage", err);
    return { ...DEFAULT_SETTINGS };
  }
}

// Toggle the CSS class on the <html> element so theme-specific styles kick in (Light/Dark).
function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("theme-dark");
  } else {
    root.classList.remove("theme-dark");
  }
}

// Drop scan history entries older than the user has set up in the settings.
function pruneScans(scans, retentionDays) {
  if (!Array.isArray(scans)) return [];
  const days = Number(retentionDays) || 0;
  if (days <= 0) return [...scans];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return scans.filter((scan) => {
    const iso = scan?.submittedAtISO || scan?.submittedAt;
    const ts = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(ts)) return true;
    return ts >= cutoff;
  });
}

// Read any stored scans and bring them back into the shape the UI expects. This helps with any missing fields from older versions.
function loadStoredScans(retentionDays = DEFAULT_SETTINGS.retentionDays) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("scans");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map((scan) => normalizeScan(scan)).filter(Boolean);
    return pruneScans(normalized, retentionDays);
  } catch (err) {
    console.warn("Failed to read scans from storage", err);
    return [];
  }
}

// Generate predictable-looking IDs so React can key lists without duplicates.
function createId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const random = Math.floor(Math.random() * 10_000);
  return `${prefix}-${Date.now()}-${random}`;
}

// normalizeScan is used to ensure any scan loaded from storage has all required fields
// This avoids crashes and maybe should be phased out later when data is for sure from db?
function normalizeScan(scan) {
  if (!scan || typeof scan !== "object") return null;
  const id = scan.id || createId("scan");
  const options = { ...scan.options };
  const targets = Array.isArray(scan.targets) ? scan.targets : [];
  const findings = Array.isArray(scan.findings) && scan.findings.length > 0
    ? scan.findings.map((finding, index) => hydrateFinding(id, finding, index, options, targets))
    : buildFindings(id, targets, options);

  let submittedAtISO = scan.submittedAtISO;
  if (!submittedAtISO) {
    const parsedTs = scan.submittedAt ? Date.parse(scan.submittedAt) : NaN;
    submittedAtISO = Number.isNaN(parsedTs) ? new Date().toISOString() : new Date(parsedTs).toISOString();
  }
  const submittedAt = scan.submittedAt || new Date(submittedAtISO).toLocaleString();

  return {
    ...scan,
    id,
    status: scan.status || "complete",
    submittedAt,
    submittedAtISO,
    moduleSummary: scan.moduleSummary || formatModuleSummary(options),
    findings,
  };
}

function formatModuleSummary(options) {
  const enabled = Object.entries(options)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => MODULE_LABELS[key] || key);
  return enabled.length > 0 ? enabled.join(", ") : "No modules selected";
}

// This function creates the fake findings used in the demo based on the scan options and target info. This will be removed later after testing UI
//It uses the sample data defined earlier to make things look more interesting.
function fakeFindings(scanId, target, index, options = {}) {
  const vendorName = SAMPLE_DEVICE_NAMES[index % SAMPLE_DEVICE_NAMES.length];
  const deviceName = options.discover ? vendorName : `Target ${index + 1}`;
  const services = options.serviceDetection
    ? SAMPLE_SERVICE_PROFILES[index % SAMPLE_SERVICE_PROFILES.length]
    : "Service detection disabled";

  const protocolWarnings = options.legacyProtocols
    ? "Legacy protocol handshake observed."
    : "No deprecated protocols detected.";
  const remediationTips = options.weakCreds
    ? "Rotate credentials and enforce strong password policy."
    : "Review host configuration and rerun the scan on schedule.";
  const notes = options.safeMode
    ? "Scan ran in safe mode; intrusive checks were skipped."
    : undefined;

  return {
    id: `${scanId}-finding-${index + 1}`,
    position: index,
    deviceName,
    itemDiscovered: target,
    ipAddress: target,
    services,
    protocolWarnings,
    remediationTips,
    notes,
  };
}

// Merge stored findings with the fake placeholders so missing fields get filled in.
function hydrateFinding(scanId, finding, index, options = {}, targets = []) {
  const fallbackTarget =
    (Array.isArray(targets) && targets[index]) ||
    (finding && typeof finding === "object" && finding.itemDiscovered) ||
    (finding && typeof finding === "object" && finding.ipAddress) ||
    `Target ${index + 1}`;

  const placeholder = fakeFindings(scanId, fallbackTarget, index, options);

  if (!finding || typeof finding !== "object") {
    return placeholder;
  }
  // Mix our template data with whatever was saved earlier so each finding still shows the info we expect.
  return {
    ...placeholder,
    ...finding,
    id: finding.id || placeholder.id,
    position: typeof finding.position === "number" ? finding.position : placeholder.position,
    itemDiscovered: finding.itemDiscovered || placeholder.itemDiscovered,
    ipAddress: finding.ipAddress || placeholder.ipAddress,
    deviceName: finding.deviceName || finding.name || placeholder.deviceName,
    services: finding.services || finding.serviceSummary || placeholder.services,
    protocolWarnings: finding.protocolWarnings || placeholder.protocolWarnings,
    remediationTips: finding.remediationTips || placeholder.remediationTips,
    notes: finding.notes || placeholder.notes,
  };
}

//buildFindings creates the findings list if a scan has no stored findings. Kind of hard coded and jank
function buildFindings(scanId, targets, options = {}) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return [
      {
        id: `${scanId}-finding-1`,
        position: 0,
        deviceName: "No target provided",
        itemDiscovered: "No targets provided",
        ipAddress: "N/A",
        services: "N/A",
        protocolWarnings: "N/A",
        remediationTips: "Provide at least one target and rerun the scan.",
      },
    ];
  }

  return targets.map((target, index) => fakeFindings(scanId, target, index, options));
}
// Wrap new submissions with IDs, timestamps, summaries, and generated findings.
function createScanRecord(payload) {
  const now = new Date();
  const id = createId("scan");
  const options = { ...payload.options };
  return {
    ...payload,
    id,
    status: "complete",
    submittedAt: now.toLocaleString(),
    submittedAtISO: now.toISOString(),
    moduleSummary: formatModuleSummary(options),
    findings: buildFindings(id, payload.targets, options),
  };
}
// Main shell puts together the scan wizard modal, history list, and results details.
// The backbone React component that holds the modals, history list, and results screen together.
export default function App() {
  // useRef lets us compute expensive defaults only once, even if the component re-renders.
  const initialSettingsRef = useRef(null);
  if (initialSettingsRef.current === null) {
    initialSettingsRef.current = loadSettings();
  }
  const initialSettings = initialSettingsRef.current;

  const initialScansRef = useRef(null);
  if (initialScansRef.current === null) {
    initialScansRef.current = loadStoredScans(initialSettings.retentionDays);
  }
  const initialScans = initialScansRef.current;

  // --- UI state toggles ---
  const [showWizard, setShowWizard] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // --- Persisted data ---
  const [settings, setSettings] = useState(initialSettings);
  const [scans, setScans] = useState(initialScans);
  // --- Navigation and selection ---
  const [selectedScanId, setSelectedScanId] = useState(initialScans[0]?.id ?? null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [view, setView] = useState(VIEW_HOME);

  // On first render, apply the stored theme so the UI does not flash light/dark.
  useEffect(() => {
    applyTheme(settings.theme);
  }, []);

  // Persist scans whenever the list changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("scans", JSON.stringify(scans));
  }, [scans]);

  // Persist settings and apply theme changes immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    applyTheme(settings.theme);
  }, [settings]);

  // When the window changes, sweep old scans from state.
  useEffect(() => {
    setScans((prev) => {
      const pruned = pruneScans(prev, settings.retentionDays);
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [settings.retentionDays]);

  // Handy pointer to whichever scan is selected in the history/results views.
  const selectedScan = useMemo(
    () => scans.find((scan) => scan.id === selectedScanId) || null,
    [scans, selectedScanId],
  );

  // Modal open/close helpers keep those booleans in place.
  function openWizard(e) {
    e.preventDefault();
    setShowSettings(false);
    setShowLogin(false);
    setShowWizard(true);
  }

  function openLogin(e) {
    e.preventDefault();
    setShowSettings(false);
    setShowWizard(false);
    setShowLogin(true);
  }

  function openSettings(e) {
    e.preventDefault();
    setShowLogin(false);
    setShowWizard(false);
    setShowSettings(true);
  }

  function closeWizard() {
    setShowWizard(false);
  }

  function closeLogin() {
    setShowLogin(false);
  }

  function closeSettings() {
    setShowSettings(false);
  }

  function goHome() {
    setView(VIEW_HOME);
    setSelectedDevice(null);
    setShowLogin(false);
    setShowSettings(false);
  }

  // Navigation helpers wire the buttons to their views.
  function handleSelectDevice(device) {
    if (!device) return;
    const enriched = {
      ...device,
      scanId: device.scanId || (selectedScan?.id ?? null),
      scanName: device.scanName || (selectedScan?.name ?? null),
      submittedAt: device.submittedAt || (selectedScan?.submittedAt ?? null),
    };
    setSelectedDevice(enriched);
    setView(VIEW_DEVICE);
  }

  function handleSelectScan(id) {
    setSelectedScanId(id);
    setSelectedDevice(null);
    setView(VIEW_RESULTS);
  }

  function handleBackToResults() {
    setSelectedDevice(null);
    setView(VIEW_RESULTS);
  }

  // Merge incoming settings with defaults so we never lose settings.
  function handleSettingsSave(nextSettings) {
    const merged = {
      ...settings,
      ...nextSettings,
      defaultOptions: {
        ...DEFAULT_SETTINGS.defaultOptions,
        ...(settings.defaultOptions || {}),
        ...(nextSettings?.defaultOptions || {}),
      },
      retentionDays: Math.max(1, Number(nextSettings?.retentionDays) || DEFAULT_SETTINGS.retentionDays),
      theme: nextSettings?.theme === "dark" ? "dark" : "light",
    };
    setSettings(merged);
    const pruned = pruneScans(scans, merged.retentionDays);
    setScans(pruned);
    if (!pruned.some((scan) => scan.id === selectedScanId)) {
      setSelectedScanId(pruned[0]?.id ?? null);
      setSelectedDevice(null);
    }
    setShowSettings(false);
  }

  // Persist the new scan and take the user straight to the detail view.
  async function handleCreateScan(payload) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const enriched = createScanRecord(payload);
    setScans((prev) => pruneScans([enriched, ...prev], settings.retentionDays));
    setSelectedScanId(enriched.id);
    setSelectedDevice(null);
    setView(VIEW_RESULTS);
    closeWizard();
  }

  const hasScans = scans.length > 0;
//the elements for each view and modal are laid out here
  return (
    <div className="frame">
      <header className="header">
        <a className="logo" href="/" aria-label="Home" onClick={(e) => { e.preventDefault(); goHome(); }}>
          <img className="logo-img" src={logoImage} alt="Dashboard logo" />
        </a>

        <nav className="top-actions" aria-label="Primary">
          <button type="button" className="settings-btn" onClick={openSettings}>Settings</button>
          <button type="button" className="login-btn" onClick={openLogin}>Log in</button>
        </nav>
      </header>

      <main className={`main ${view !== VIEW_HOME ? "main--fill" : ""}`}>
        {/* Home view: big start button plus optional shortcut to history. */}
        {view === VIEW_HOME && (
          <>
            <a
              href="/scan/new"
              className="start-circle"
              aria-label="Start Scan"
              onClick={openWizard}
            >
              <span className="start-text">Start{"\n"}Scan</span>
            </a>

            {hasScans && (
              <button
                type="button"
                className="prev-scans"
                onClick={() => {
                  setSelectedDevice(null);
                  setView(VIEW_HISTORY);
                }}
              >
                Previous Scans
              </button>
            )}
          </>
        )}

        {/* History view: list each previous scan for quick access. */}
        {view === VIEW_HISTORY && (
          <section className="history-panel" aria-label="Previous scans">
            <header className="history-header">
              <h1>Previous scans</h1>
              <button type="button" className="history-back" onClick={goHome}>
                Back to home
              </button>
            </header>
            {hasScans ? (
              <ul className="history-list">
                {scans.map((scan) => (
                  <li key={scan.id} className="history-item">
                    <button type="button" onClick={() => handleSelectScan(scan.id)}>
                      <span className="history-itemName">{scan.name}</span>
                      <span className="history-itemMeta">{scan.submittedAt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="history-empty">No scans recorded yet.</p>
            )}
          </section>
        )}

        {/* Results view: show modules, findings, and related actions for the selected scan. */}
        {view === VIEW_RESULTS && (
          <div className="results-host">
            <ScanResults
              scan={selectedScan}
              allScans={scans}
              onSelectScan={handleSelectScan}
              onSelectDevice={handleSelectDevice}
              onBackToHome={goHome}
            />
          </div>
        )}
        {/* Device detail view: focused look at a single asset pulled from the findings list. */}
        {view === VIEW_DEVICE && (
          <div className="device-host">
            <DeviceDetails
              device={selectedDevice}
              onBack={handleBackToResults}
              onPrint={() => window.print()}
            />
          </div>
        )}
      </main>

      {/* Modals live at the bottom so they overlay the main content when toggled on. */}
      {showWizard && (
        <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={closeWizard}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Scan</h2>
              <button onClick={closeWizard} className="modal-closeBtn" aria-label="Close">X</button>
            </div>
            <div className="modal-body">
              <NewScanWizard onCreate={handleCreateScan} onClose={closeWizard} defaultOptions={settings.defaultOptions} />
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={closeSettings}
          onSave={handleSettingsSave}
        />
      )}

      {showLogin && <LoginModal onClose={closeLogin} />}

      <footer className="footer">
        <a href="/legal" className="legal">LEGAL</a>
        <a href="/intro" className="intro">Demo / Introduction</a>
      </footer>
    </div>
  );
}
