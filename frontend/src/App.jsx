/**
 * file: src/App.jsx
 * programmer: Jack Ray
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
import axios from "axios";
import { getApiErrorMessage, getApiErrorStatus } from "./apiErrors";
import "./styles/base.css";
import "./styles/app-shell.css";
import "./styles/modal.css";
import "./styles/history.css";
import NewScanWizard from "./NewScanWizard.jsx";
import ScanResults from "./ScanResults.jsx";
import LoginModal from "./LoginModal.jsx";
import SettingsModal from "./SettingsModal.jsx";
import DeviceDetails from "./DeviceDetails.jsx";
import logoImage from "./assets/logo.svg";
import trashIcon from "./assets/trash.svg";

axios.defaults.withCredentials = true;

const VIEW_HOME = "home";
const VIEW_HISTORY = "history";
const VIEW_SCANNING = "scanning";
const VIEW_RESULTS = "results";
const VIEW_DEVICE = "device";

const LOGIN_ACTIONS = {
  HISTORY: "show-history",
  SAVE_SCAN: "save-scan",
};

const MODULE_LABELS = {
  discover: "Discover hosts",
  serviceDetection: "Service detection",
  legacyProtocols: "Legacy protocols",
  weakCreds: "Weak credentials",
  safeMode: "Safe mode",
};

const RADAR_SWEEP_MS = 2200;
const RADAR_PING_COUNT = 3;
const RADAR_PING_FADE_MS = 1800;
const RADAR_SWEEP_CENTER_OFFSET_DEG = 45;

const RUN_SCAN_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  SUCCESS: "success",
  ERROR: "error",
};

const SCAN_MODE = {
  STANDARD: "standard",
  LONG: "long",
};

const DEFAULT_LONG_SCAN_TIMER = {
  days: "0",
  hours: "0",
  minutes: "30",
  seconds: "0",
};

const LONG_SCAN_STREAM_INTERVAL_MS = 30000;
const LONG_SCAN_MAX_ROWS = 2500;
const MOCK_DYNAMIC_IP_POOL = [
  "192.168.1.9",
  "192.168.1.18",
  "192.168.1.44",
  "192.168.1.105",
  "192.168.1.122",
  "10.0.0.14",
  "10.0.0.37",
  "172.16.0.21",
];

const SEVERITY_RANK = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};


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

// Read any stored scans and bring them back into the shape the UI expects.
function loadStoredScans() {
  // Scan data is no longer persisted locally now that SQL handles storage.
  return [];
}

function safeParseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
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

function parseLongScanTimer(rawTimer) {
  const days = Math.max(0, Number.parseInt(rawTimer?.days ?? "0", 10) || 0);
  const hours = Math.min(23, Math.max(0, Number.parseInt(rawTimer?.hours ?? "0", 10) || 0));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(rawTimer?.minutes ?? "0", 10) || 0));
  const seconds = Math.min(59, Math.max(0, Number.parseInt(rawTimer?.seconds ?? "0", 10) || 0));
  const totalSeconds = (((days * 24) + hours) * 60 + minutes) * 60 + seconds;
  return {
    days,
    hours,
    minutes,
    seconds,
    totalMs: totalSeconds * 1000,
  };
}

function formatDurationFromMs(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function createMockDynamicScanRow(now = Date.now()) {
  const packetSize = 64 + Math.floor(Math.random() * (1518 - 64 + 1));
  const packetFrequency = Number((8 + Math.random() * 240).toFixed(2));
  const fallbackLastOctet = 2 + Math.floor(Math.random() * 250);
  const sourceIp =
    MOCK_DYNAMIC_IP_POOL[Math.floor(Math.random() * MOCK_DYNAMIC_IP_POOL.length)] ||
    `192.168.1.${fallbackLastOctet}`;
  const destinationIp =
    MOCK_DYNAMIC_IP_POOL[Math.floor(Math.random() * MOCK_DYNAMIC_IP_POOL.length)] ||
    "192.168.1.1";
  const timestamp = new Date(now).toISOString();
  const score = Number((-0.35 + Math.random() * 0.4).toFixed(4));
  const severity = score < -0.2 ? "CRITICAL" : score < -0.1 ? "HIGH" : score < -0.05 ? "MEDIUM" : "LOW";
  const findingId = `${sourceIp}-${timestamp}`;

  return {
    findingId,
    type: "ANOMALY",
    title: "Network Traffic Anomaly",
    severity,
    description: `${severity} anomaly detected in packet stream.`,
    impact: "Potential malicious or abnormal network traffic pattern.",
    recommendation: "Inspect source and destination traffic pair and isolate if needed.",
    source: "ml",
    evidence: {
      timestamp,
      sourceIp,
      destinationIp,
      packetSize,
      frequency: packetFrequency,
      score,
    },
  };
}

function isValidIpv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function ipv4ToInt(ip) {
  if (!isValidIpv4(ip)) return null;
  const [a, b, c, d] = ip.split(".").map((part) => Number(part));
  return ((((a << 24) >>> 0) | (b << 16) | (c << 8) | d) >>> 0);
}

function ipMatchesTarget(ip, target) {
  if (!isValidIpv4(ip) || typeof target !== "string") return false;
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return false;
  if (!trimmedTarget.includes("/")) return ip === trimmedTarget;

  const [baseIp, prefixRaw] = trimmedTarget.split("/");
  const prefix = Number(prefixRaw);
  if (!isValidIpv4(baseIp) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(baseIp);
  if (ipInt === null || baseInt === null) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function normalizeSeverity(rawSeverity) {
  const normalized = typeof rawSeverity === "string" ? rawSeverity.toUpperCase() : "";
  return SEVERITY_RANK[normalized] ? normalized : "LOW";
}

function getHighestSeverity(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return "LOW";
  return findings.reduce((currentHighest, finding) => {
    const next = normalizeSeverity(finding?.severity);
    return SEVERITY_RANK[next] > SEVERITY_RANK[currentHighest] ? next : currentHighest;
  }, "LOW");
}

function summarizeServices(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return "No exposed services detected";
  const serviceLabels = [];
  for (const finding of findings) {
    const evidence = finding?.evidence || {};
    const service = evidence?.service || "unknown";
    const port = evidence?.port ?? "?";
    const protocol = evidence?.protocol || "";
    const label = protocol ? `${service}:${port}/${protocol}` : `${service}:${port}`;
    if (!serviceLabels.includes(label)) serviceLabels.push(label);
  }
  return serviceLabels.length > 0 ? serviceLabels.join(", ") : "No exposed services detected";
}

function summarizeExposure(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return "No CVE references found";
  const cveIds = [];
  for (const finding of findings) {
    const ids = Array.isArray(finding?.cveIds) ? finding.cveIds : [];
    for (const cveId of ids) {
      if (typeof cveId === "string" && cveId.trim() && !cveIds.includes(cveId)) {
        cveIds.push(cveId);
      }
    }
  }
  if (cveIds.length === 0) return "No CVE references found";
  return cveIds.slice(0, 3).join(", ");
}

function summarizeRemediation(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return "Review device configuration and rerun the scan.";
  const recommendations = [];
  for (const finding of findings) {
    const recommendation = finding?.recommendation;
    if (typeof recommendation === "string" && recommendation.trim() && !recommendations.includes(recommendation)) {
      recommendations.push(recommendation);
    }
  }
  if (recommendations.length === 0) return "Review device configuration and rerun the scan.";
  return recommendations.slice(0, 2).join(" | ");
}

function mapContractDeviceToFinding(scanId, device, index) {
  const findings = Array.isArray(device?.findings) ? device.findings : [];
  const ipAddress = device?.ip || "N/A";
  const hostname = device?.hostname || null;
  const vendor = device?.vendor || null;
  const highestSeverity = getHighestSeverity(findings);
  const riskLevel = typeof device?.riskLevel === "string" ? device.riskLevel.toUpperCase() : highestSeverity;
  const findingCount = Number.isFinite(Number(device?.findingCount)) ? Number(device.findingCount) : findings.length;
  const services = summarizeServices(findings);
  const topExposure = summarizeExposure(findings);
  const remediationTips = summarizeRemediation(findings);
  const itemLabel = hostname || ipAddress || `Device ${index + 1}`;

  const noteParts = [];
  if (vendor) noteParts.push(`Vendor: ${vendor}`);
  noteParts.push(`Risk: ${riskLevel}`);
  noteParts.push(`Findings: ${findingCount}`);

  return {
    id: device?.deviceId || `${scanId}-device-${index + 1}`,
    position: index,
    deviceName: hostname || itemLabel,
    itemDiscovered: itemLabel,
    hostname,
    ip: ipAddress,
    ipAddress,
    vendor,
    services,
    riskLevel,
    findingCount,
    status: device?.status || "COMPLETE",
    topExposure,
    protocolWarnings: topExposure,
    remediationTips,
    notes: noteParts.join(" | "),
    findingsDetailed: findings,
  };
}

function mapDevicesToFindings(scanId, devices = [], targets = []) {
  if (!Array.isArray(devices) || devices.length === 0) return [];
  return devices.map((device, index) => {
    const findingsDetailed = Array.isArray(device?.findingsDetailed)
      ? device.findingsDetailed
      : Array.isArray(device?.findings)
      ? device.findings
      : [];
    const ipAddress = device?.ip || device?.ip_address || "N/A";
    const hostname = device?.hostname || device?.device_name || null;
    const itemDiscovered = hostname || ipAddress || targets[index] || `Target ${index + 1}`;
    const riskSource = device?.riskLevel || device?.risk_level || getHighestSeverity(findingsDetailed);
    const riskLevel = typeof riskSource === "string" ? riskSource.toUpperCase() : "UNKNOWN";
    const findingCountValue = device?.findingCount ?? device?.finding_count;
    const findingCount = Number.isFinite(Number(findingCountValue))
      ? Number(findingCountValue)
      : findingsDetailed.length;
    const topExposure = device?.topExposure || device?.protocol_warnings || summarizeExposure(findingsDetailed);
    const remediationTips =
      device?.remediationTips || device?.remediation_tips || summarizeRemediation(findingsDetailed);

    return {
      id: device?.deviceId || device?.device_id || `${scanId}-device-${index + 1}`,
      position: index,
      deviceName: hostname || ipAddress || `Device ${index + 1}`,
      itemDiscovered,
      ipAddress,
      ip: ipAddress,
      hostname,
      vendor: device?.vendor || null,
      services: device?.services || summarizeServices(findingsDetailed),
      riskLevel,
      findingCount,
      status: device?.status || "COMPLETE",
      topExposure,
      protocolWarnings: topExposure,
      remediationTips,
      notes: device?.notes || "",
      findingsDetailed,
    };
  });
}

function mapReportToScan(report, devices = null) {
  if (!report) return null;
  const submittedAtRaw = report.scannedAt || report.scanned_at;
  const parsedSubmittedAt = submittedAtRaw ? new Date(submittedAtRaw) : new Date();
  const submittedAtDate = Number.isNaN(parsedSubmittedAt.getTime()) ? new Date() : parsedSubmittedAt;
  const deviceCount = Number(report.deviceCount ?? 0);
  const findingCount = Number(report.totalFindingCount ?? 0);
  const contractSummary =
    Number.isFinite(deviceCount) && Number.isFinite(findingCount)
      ? `Devices: ${deviceCount} | Findings: ${findingCount}`
      : null;
  const targets = safeParseJsonArray(report.targets);
  const exclusions = safeParseJsonArray(report.exclusions);
  const submittedAtISO = submittedAtDate.toISOString();
  const submittedAtLabel = submittedAtDate.toLocaleString();
  const scanId = String(report.scanId ?? report.scan_id ?? report.report_id ?? createId("scan"));
  const hasDevicePayload = Array.isArray(devices);
  const findings = hasDevicePayload ? mapDevicesToFindings(scanId, devices, targets) : null;

  return {
    id: scanId,
    name: report.scanName || report.scan_name || report.title || "Untitled scan",
    status: typeof report.status === "string" ? report.status.toLowerCase() : "complete",
    submittedAt: submittedAtLabel,
    submittedAtISO,
    moduleSummary: report.detection_options || contractSummary || "Not specified",
    targets,
    exclusions,
    findings,
    detailsLoaded: hasDevicePayload,
    detailsLoading: false,
    detailsError: null,
  };
}

function formatModuleSummary(options) {
  const enabled = Object.entries(options)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => MODULE_LABELS[key] || key);
  return enabled.length > 0 ? enabled.join(", ") : "No modules selected";
}

function createScanRecordFromContract(payload, contractPayload) {
  const scanDetails = contractPayload?.scanDetailsResponse || {};
  const options = { ...payload.options };
  const selectedTargets = Array.isArray(payload?.targets) ? payload.targets : [];
  const allDevices = Array.isArray(scanDetails?.devices) ? scanDetails.devices : [];
  const selectedDevices =
    selectedTargets.length > 0
      ? allDevices.filter((device) => selectedTargets.some((target) => ipMatchesTarget(device?.ip, target)))
      : allDevices;

  if (selectedTargets.length > 0) {
    const missingTargets = selectedTargets.filter(
      (target) => !allDevices.some((device) => ipMatchesTarget(device?.ip, target))
    );
    if (missingTargets.length > 0) {
      console.warn(
        "[scan-mismatch] Selected target(s) missing from vulnerability scan results:",
        missingTargets
      );
    }

    const selectedDeviceIps = selectedDevices
      .map((device) => device?.ip)
      .filter((ip) => typeof ip === "string" && ip.trim());
    const extraDeviceIps = allDevices
      .map((device) => device?.ip)
      .filter((ip) => typeof ip === "string" && ip.trim() && !selectedDeviceIps.includes(ip));
    if (extraDeviceIps.length > 0) {
      console.info(
        "[scan-mismatch] Vulnerability scan returned additional device(s) not selected in wizard:",
        extraDeviceIps
      );
    }
  }

  const scanId = String(scanDetails?.scanId || createId("scan"));
  const scannedAtDate = scanDetails?.scannedAt ? new Date(scanDetails.scannedAt) : new Date();
  const submittedAtISO = Number.isNaN(scannedAtDate.getTime()) ? new Date().toISOString() : scannedAtDate.toISOString();
  const submittedAt = new Date(submittedAtISO).toLocaleString();

  return {
    ...payload,
    id: scanId,
    name: payload?.name?.trim() || scanDetails?.scanName || "Static Scan",
    status: typeof scanDetails?.status === "string" ? scanDetails.status.toLowerCase() : "complete",
    submittedAt,
    submittedAtISO,
    moduleSummary: formatModuleSummary(options),
    findings: selectedDevices.map((device, index) => mapContractDeviceToFinding(scanId, device, index)),
  };
}

function createRadarPings(count = RADAR_PING_COUNT, now = Date.now()) {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 6 + Math.sqrt(Math.random()) * 22;
    const cx = 32 + Math.cos(angle) * radius;
    const cy = 32 + Math.sin(angle) * radius;
    const size = 1.3 + Math.random() * 0.7;
    const dx = cx - 32;
    const dy = cy - 32;
    const rawAngleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const normalizedAngle = (rawAngleDeg + 360) % 360;
    const revealAngle = (normalizedAngle - RADAR_SWEEP_CENTER_OFFSET_DEG + 360) % 360;
    const delayMs = (revealAngle / 360) * RADAR_SWEEP_MS;
    const expiresAt = now + delayMs + RADAR_PING_FADE_MS + 120;
    return {
      id: createId("ping"),
      cx: Number(cx.toFixed(2)),
      cy: Number(cy.toFixed(2)),
      r: Number(size.toFixed(2)),
      delayMs: Number(delayMs.toFixed(0)),
      expiresAt,
    };
  });
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
    initialScansRef.current = loadStoredScans();
  }
  const initialScans = initialScansRef.current;

  // --- UI state toggles ---
  const [showWizard, setShowWizard] = useState(false);
  const [showScanModePrompt, setShowScanModePrompt] = useState(false);
  const [showLongScanSetup, setShowLongScanSetup] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  // --- Persisted data ---
  const [settings, setSettings] = useState(initialSettings);
  const [scans, setScans] = useState(initialScans);
  // --- Navigation and selection ---
  const [selectedScanId, setSelectedScanId] = useState(initialScans[0]?.id ?? null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [view, setView] = useState(VIEW_HOME);
  const [unsavedScan, setUnsavedScan] = useState(null);
  const [isViewingFreshScan, setIsViewingFreshScan] = useState(false);
  const [pendingLoginAction, setPendingLoginAction] = useState(null);
  const [isSavingScan, setIsSavingScan] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [historyFeedback, setHistoryFeedback] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [deletingScanId, setDeletingScanId] = useState(null);
  const [radarPings, setRadarPings] = useState([]);
  const [isRadarActive, setIsRadarActive] = useState(false);
  const [runScanStatus, setRunScanStatus] = useState(RUN_SCAN_STATUS.IDLE);
  const [runScanError, setRunScanError] = useState("");
  const [pendingScanConfig, setPendingScanConfig] = useState(null);
  const [longScanTimerInput, setLongScanTimerInput] = useState(DEFAULT_LONG_SCAN_TIMER);
  const [longScanTimerError, setLongScanTimerError] = useState("");
  const [longScanSession, setLongScanSession] = useState(null);
  const runScanRequestIdRef = useRef(0);
  const [showUnsavedClosePrompt, setShowUnsavedClosePrompt] = useState(false);
  const wizardBackdropPointerDownRef = useRef(false); // Prevents dismiss when dragging selections outside the modal.
  const driftDots = useMemo(() => (
    Array.from({ length: 54 }, (_, index) => {
      const sizeRem = 0.12 + Math.random() * 0.28;
      const opacity = 0.25 + Math.random() * 0.55;
      const duration = 18 + Math.random() * 32;
      const delay = Math.random() * 6;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const lightness = 52 + Math.random() * 24;
      const blur = Math.random() * 0.6;
      return {
        id: `dot-${index}`,
        sizeRem,
        opacity,
        duration,
        delay,
        x,
        y,
        lightness,
        blur,
      };
    })
  ), []);

  useEffect(() => {
    let isActive = true;
    async function hydrateSession() {
      try {
        const res = await axios.get(
          "http://localhost:3000/check_login",
          {withCredentials: true}
        );
        if (!isActive) return;
        if (res?.data?.loggedIn && res?.data?.user) {
          setUser(res.data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Session check failed!: ", err);
      }
    }
    hydrateSession();
    return () => {
      isActive = false;
    };
  }, []);

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

  useEffect(() => {
    setSaveFeedback(null);
  }, [selectedScanId]);

  useEffect(() => {
    if (view !== VIEW_HOME || !isRadarActive) {
      setRadarPings([]);
      return undefined;
    }
    const spawnPings = () => {
      const now = Date.now();
      setRadarPings((prev) => {
        const active = prev.filter((ping) => ping.expiresAt > now);
        return [...active, ...createRadarPings(RADAR_PING_COUNT, now)];
      });
    };
    spawnPings();
    const intervalId = window.setInterval(spawnPings, RADAR_SWEEP_MS);
    return () => window.clearInterval(intervalId);
  }, [view, isRadarActive]);

  useEffect(() => {
    if (!longScanSession?.active) return undefined;

    const intervalId = window.setInterval(() => {
      setLongScanSession((current) => {
        if (!current || !current.active) return current;
        const now = Date.now();
        const nextRows = [...current.rows, createMockDynamicScanRow(now)];
        const trimmedRows =
          nextRows.length > LONG_SCAN_MAX_ROWS
            ? nextRows.slice(nextRows.length - LONG_SCAN_MAX_ROWS)
            : nextRows;

        if (now >= current.endAtMs) {
          return {
            ...current,
            active: false,
            rows: trimmedRows,
            stopReason: "timer",
            stoppedAtMs: now,
          };
        }

        return {
          ...current,
          rows: trimmedRows,
        };
      });
    }, LONG_SCAN_STREAM_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [longScanSession?.active]);

  useEffect(() => {
    if (!longScanSession?.scanId) return;
    setUnsavedScan((current) => {
      if (!current || current.id !== longScanSession.scanId || current.scanMode !== SCAN_MODE.LONG) {
        return current;
      }
      const nextStatus = longScanSession.active
        ? "running"
        : (longScanSession.stopReason === "manual" ? "paused" : "complete");
      if (current.status === nextStatus) return current;
      return { ...current, status: nextStatus };
    });
  }, [longScanSession?.active, longScanSession?.scanId]);

  // Handy pointer to whichever scan is selected in the history/results views.
  const selectedScan = useMemo(() => {
    if (unsavedScan && selectedScanId === unsavedScan.id) {
      return unsavedScan;
    }
    return scans.find((scan) => scan.id === selectedScanId) || null;
  }, [scans, selectedScanId, unsavedScan]);
  async function startRunScan() {
    const requestId = runScanRequestIdRef.current + 1;
    runScanRequestIdRef.current = requestId;
    setRunScanStatus(RUN_SCAN_STATUS.RUNNING);
    setRunScanError("");

    try {
      const response = await axios.post(
        "http://localhost:3000/run-scan",
        {},
        { withCredentials: false }
      );

      if (requestId !== runScanRequestIdRef.current) return null;

      const payload = response?.data;
      if (!payload || typeof payload !== "object" || !payload.scanDetailsResponse) {
        setRunScanStatus(RUN_SCAN_STATUS.ERROR);
        setRunScanError("Scan completed but returned invalid scan data.");
        return null;
      }

      setRunScanStatus(RUN_SCAN_STATUS.SUCCESS);
      return payload;
    } catch (err) {
      if (requestId !== runScanRequestIdRef.current) return null;

      const status = getApiErrorStatus(err);
      const fallbackMessage =
        status === 500
          ? "Backend scan failed. Check backend logs and retry."
          : "Unable to run scan. Make sure backend is running on port 3000.";
      setRunScanStatus(RUN_SCAN_STATUS.ERROR);
      setRunScanError(getApiErrorMessage(err, fallbackMessage));
      return null;
    }
  }

  function stopLongScan(reason = "manual") {
    setLongScanSession((current) => {
      if (!current || !current.active) return current;
      return {
        ...current,
        active: false,
        stopReason: reason,
        stoppedAtMs: Date.now(),
      };
    });
  }

  function resumeLongScan() {
    setLongScanSession((current) => {
      if (!current || current.active) return current;
      const pausedAtMs = current.stoppedAtMs || Date.now();
      const remainingMs = Math.max(0, current.endAtMs - pausedAtMs);
      if (remainingMs <= 0) return current;
      const nowMs = Date.now();
      return {
        ...current,
        active: true,
        startedAtMs: nowMs,
        endAtMs: nowMs + remainingMs,
        stopReason: null,
        stoppedAtMs: null,
      };
    });
  }

  // Modal open/close helpers keep those booleans in place.
  function openScanModePrompt(e) {
    e.preventDefault();
    setShowSettings(false);
    setShowLogin(false);
    setShowWizard(false);
    setShowLongScanSetup(false);

    setShowScanModePrompt(true);
  }

  function openStandardWizard() {
    runScanRequestIdRef.current += 1;
    setRunScanStatus(RUN_SCAN_STATUS.IDLE);
    setRunScanError("");
    setPendingScanConfig(null);

    // Run the device discovery script (don't wait for it)
    console.log("Starting device discovery...");
    axios.post("http://localhost:3002/run-discovery", {}, { withCredentials: false })
      .then((response) => {
        if (response.data?.success) {
          console.log(
            "Device discovery completed successfully, found",
            response.data.deviceCount || 0,
            "devices"
          );
        } else {
          console.warn("Device discovery API responded, but success was false:", response.data);
        }
      })
      .catch((err) => {
        console.error("Device discovery failed:", err);
      });

    // Open the wizard immediately
    setShowWizard(true);
  }

  function handleSelectStandardScan() {
    setShowScanModePrompt(false);
    openStandardWizard();
  }

  function handleSelectLongScan() {
    setShowScanModePrompt(false);
    setLongScanTimerError("");
    setShowLongScanSetup(true);
  }

  function closeScanModePrompt() {
    setShowScanModePrompt(false);
  }

  function closeLongScanSetup() {
    setShowLongScanSetup(false);
    setLongScanTimerError("");
  }

  function handleLongScanTimerInput(field, value) {
    if (!["days", "hours", "minutes", "seconds"].includes(field)) return;
    const sanitized = String(value).replace(/[^\d]/g, "");
    setLongScanTimerInput((prev) => ({ ...prev, [field]: sanitized }));
  }

  function handleStartLongScan() {
    const parsed = parseLongScanTimer(longScanTimerInput);
    if (!parsed.totalMs) {
      setLongScanTimerError("Enter a duration greater than zero.");
      return;
    }

    stopLongScan("manual");
    const nowMs = Date.now();
    const scanId = createId("scan");
    const submittedAtISO = new Date(nowMs).toISOString();
    const newLongScan = {
      id: scanId,
      name: "Long Dynamic Scan",
      scanMode: SCAN_MODE.LONG,
      status: "running",
      submittedAt: new Date(nowMs).toLocaleString(),
      submittedAtISO,
      targets: ["Live packet stream"],
      exclusions: [],
      moduleSummary: `Dynamic monitoring (${formatDurationFromMs(parsed.totalMs)})`,
      findings: [],
      detailsLoaded: true,
      detailsLoading: false,
      detailsError: null,
    };

    setUnsavedScan(newLongScan);
    setSelectedScanId(newLongScan.id);
    setSelectedDevice(null);
    setIsViewingFreshScan(true);
    setSaveFeedback(null);
    setView(VIEW_RESULTS);
    setShowLongScanSetup(false);
    setLongScanTimerError("");

    setLongScanSession({
      scanId,
      active: true,
      startedAtMs: nowMs,
      endAtMs: nowMs + parsed.totalMs,
      totalDurationMs: parsed.totalMs,
      rows: [createMockDynamicScanRow(nowMs)],
      stopReason: null,
      stoppedAtMs: null,
    });
  }

  function openLogin(e) {
    if(e) e.preventDefault();
    setShowSettings(false);
    setShowWizard(false);
    setShowScanModePrompt(false);
    setShowLongScanSetup(false);
    setShowLogin(true);
  }

  function openSettings(e) {
    e.preventDefault();
    setShowLogin(false);
    setShowWizard(false);
    setShowScanModePrompt(false);
    setShowLongScanSetup(false);
    setShowSettings(true);
  }

  function closeWizard() {
    setShowWizard(false);
  }

  function handleWizardBackdropPointerDown(event) {
    wizardBackdropPointerDownRef.current = event.target === event.currentTarget;
  }

  function handleWizardBackdropPointerUp(event) {
    if (wizardBackdropPointerDownRef.current && event.target === event.currentTarget) {
      closeWizard();
    }
    wizardBackdropPointerDownRef.current = false;
  }

  function resetWizardBackdropPointerFlag() {
    wizardBackdropPointerDownRef.current = false;
  }

  function closeLogin() {
    setPendingLoginAction(null);
    setShowLogin(false);
  }

  function closeSettings() {
    setShowSettings(false);
  }

  function closeUnsavedClosePrompt() {
    setShowUnsavedClosePrompt(false);
  }

  function goHome() {
    runScanRequestIdRef.current += 1;
    setRunScanStatus(RUN_SCAN_STATUS.IDLE);
    setRunScanError("");
    setPendingScanConfig(null);
    setView(VIEW_HOME);
    setSelectedDevice(null);
    setShowLogin(false);
    setShowSettings(false);
    setShowScanModePrompt(false);
    setShowLongScanSetup(false);
    setIsViewingFreshScan(false);
    setSaveFeedback(null);
  }

  function handleLoginSuccess(userInfo) {
    setUser(userInfo);
    setShowLogin(false);
    if (pendingLoginAction) {
      const actionToRun = pendingLoginAction;
      setPendingLoginAction(null);
      runPendingLoginAction(actionToRun, userInfo);
    }
  }

  async function loadHistoryForUser(userId, { force = false } = {}) {
    if (!userId) return;
    if (isHistoryLoading) return;
    if (hasLoadedHistory && !force) return;

    setHistoryFeedback(null);
    setIsHistoryLoading(true);

    try{
      const reportsRes = await axios.get(//send request to /scan-reports on the server
        "http://localhost:3000/scan-reports",
        {withCredentials: true}
      );

      //if here, scan reports successfully retrieved
      const reports = reportsRes?.data?.success
        ? reportsRes.data.scans || reportsRes.data.reports || []
        : [];
      const mapped = pruneScans(
        reports
          .map((report) => mapReportToScan(report))
          .filter(Boolean),
        settings.retentionDays
      );

      setScans(mapped);
      setHasLoadedHistory(true);
      setSelectedScanId((prev) => {
        if (prev && mapped.some((scan) => scan.id === prev)) return prev;
        if (unsavedScan?.id) return unsavedScan.id;
        return mapped[0]?.id ?? null;
      });
    }
    catch(err){
      console.error("Failed to load scan scan reports for user ", userId, err);

      if(err.response)//Axios attaches backend response here for 400/500 errors
        setHistoryFeedback({
          type: "error",
          message: err.response.data?.message || "Failed to load scan history!"
        });
      else//if here, no response at all (network error, server down, CORS, timeout)
        setHistoryFeedback({
          type: "error",
          message: "Unable to connect to server!"
        });
 
      setScans([]);
      setSelectedScanId(null);
    }
    finally{
      setIsHistoryLoading(false);
    }
  }

  async function loadScanDetails(scanId, actor = user) {
    if (!scanId || !actor?.user_id) return;
    const scanToLoad = scans.find((scan) => scan.id === scanId);
    if (!scanToLoad || scanToLoad.detailsLoaded || scanToLoad.detailsLoading) return;

    setScans((prev) =>
      prev.map((scan) =>
        scan.id === scanId
          ? { ...scan, detailsLoading: true, detailsError: null }
          : scan
      )
    );

    try{
      const devicesRes = await axios.get(//send request to /scan_reports/id/devices on server
        `http://localhost:3000/scan-reports/${scanId}/devices`,
        {withCredentials: true}
      );

      //if here, devices successfully retrieved
      const scanDetailsPayload = devicesRes?.data?.scanDetails || devicesRes?.data?.scanDetailsResponse;
      const devices = devicesRes?.data?.success
        ? scanDetailsPayload?.devices || devicesRes.data.devices || []
        : [];
      setScans((prev) =>
        prev.map((scan) =>
          scan.id === scanId
            ? {
                ...scan,
                findings: mapDevicesToFindings(scan.id, devices, scan.targets),
                detailsLoaded: true,
                detailsLoading: false,
                detailsError: null,
              }
            : scan
        )
      );
    }
    catch(err){//if here, device retrieval failed
      console.error("Failed to load scan details ", scanId, err);//log the error

      if(err.response)//Axios attaches backend response here for 400/500 errors
        setScans((prev) =>
          prev.map((scan) =>
            scan.id === scanId
              ? {
                  ...scan,
                  detailsLoading: false,
                  detailsError: err.response.data?.message || "Failed to load scan report details."
                }
              : scan
          )
        );
      else//if here, no response at all (network error, server down, CORS, timeout)
        setScans((prev) => 
          prev.map((scan) => 
            scan.id === scanId 
              ? {
                  ...scan,
                  detailsLoading: false,
                  detailsError: "Unable to connect to server!",
                } 
              : scan
          )
        );
    }
  }

  useEffect(() => {
    if (user?.user_id) return;
    setScans([]);
    setHistoryFeedback(null);
    setIsHistoryLoading(false);
    setHasLoadedHistory(false);
    if (!unsavedScan) {
      setSelectedScanId(null);
    }
  }, [user?.user_id, unsavedScan]);

  async function handleLogout(){
    try{
      await axios.post(//Send request to /logout on server
        "http://localhost:3000/logout",
        {},
        {
          withCredentials: true,
          headers: {"Content-Type": "application/json"}
        }
      );
    }
    catch(err){//if here, logout failed
      console.error("Logout failed!: ", err);//log the error
    } 
    finally{//execute this no matter what
      setUser(null);
      setPendingLoginAction(null);
    }
  }

  function runPendingLoginAction(action, actor = user) {
    if (!action) return;
    if (action.type === LOGIN_ACTIONS.HISTORY) {
      showHistoryView();
      loadHistoryForUser(actor?.user_id);
    } else if (action.type === LOGIN_ACTIONS.SAVE_SCAN) {
      const scanToPersist = action.scan || selectedScan;
      if (scanToPersist) {
        persistScanReport(scanToPersist);
      }
    }
  }

  function showHistoryView() {
    setSelectedDevice(null);
    setView(VIEW_HISTORY);
    setIsViewingFreshScan(false);
    setSaveFeedback(null);
  }

  function handleHistoryButtonClick() {
    if (!user) {
      setPendingLoginAction({ type: LOGIN_ACTIONS.HISTORY });
      openLogin();
      return;
    }
    showHistoryView();
    loadHistoryForUser(user.user_id);
  }

  function handleResultsBackClick() {
    const isViewingUnsavedScan = Boolean(
      unsavedScan &&
      selectedScanId &&
      unsavedScan.id === selectedScanId
    );

    if (isViewingUnsavedScan && unsavedScan?.scanMode === SCAN_MODE.LONG) {
      goHome();
      return;
    }

    if (isViewingUnsavedScan) {
      setShowUnsavedClosePrompt(true);
      return;
    }

    handleHistoryButtonClick();
  }

  function handleConfirmCloseWithoutSaving() {
    const unsavedId = unsavedScan?.id ?? null;
    if (unsavedScan?.scanMode === SCAN_MODE.LONG) {
      stopLongScan("manual");
    }
    setShowUnsavedClosePrompt(false);
    if (unsavedId && selectedScanId === unsavedId) {
      setSelectedScanId(null);
    }
    setUnsavedScan(null);
    goHome();
  }

  async function handleDeleteScan(scanId) {
    if (!scanId) return;
    if (!user) {
      setPendingLoginAction({ type: LOGIN_ACTIONS.HISTORY });
      openLogin();
      return;
    }
    setDeletingScanId(scanId);
    setHistoryFeedback(null);
    try{
      await axios.delete(`http://localhost:3000/delete-scan/${scanId}`);//send req to /delete-scan

      //if here, deletion was successful
      setScans((prev) => {
        const next = prev.filter((entry) => entry.id !== scanId);
        if (prev.length !== next.length) {
          setSelectedScanId((current) => {
            if (current !== scanId) return current;
            if (unsavedScan?.id) return unsavedScan.id;
            return next[0]?.id ?? null;
          });
        }
        return next;
      });
    }
    catch(err){//if here, deletion failed
      console.error("Failed to delete scan!: ", scanId, err);//log the error

      if(err.response)//Axios attaches backend response here for 400/500 errors
         setHistoryFeedback({//indicate failure in response
          type: "error",
          message: err.response.data?.message || "Delete scan failed!"
        });
      else
        setHistoryFeedback({//indicate failure in response
          type: "error",
          message: "Unable to connect to server!"
        });
    }
    finally{
      setDeletingScanId(null);
    }
  }

  // Navigation helpers wire the buttons to their views.
  function handleSelectDevice(device) {
    if (!device) return;
    if (selectedScan?.scanMode === SCAN_MODE.LONG) return;
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
    if (unsavedScan && unsavedScan.id === id) {
      setIsViewingFreshScan(true);
    } else {
      setIsViewingFreshScan(false);
      loadScanDetails(id);
    }
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
    const selectedStillExists =
      (unsavedScan && unsavedScan.id === selectedScanId) ||
      pruned.some((scan) => scan.id === selectedScanId);
    if (!selectedStillExists) {
      const fallbackId = pruned[0]?.id ?? (unsavedScan?.id ?? null);
      setSelectedScanId(fallbackId);
      setSelectedDevice(null);
    }
    setShowSettings(false);
  }

  async function runScanForConfig(scanConfig) {
    if (!scanConfig) return false;
    const contractPayload = await startRunScan();
    if (!contractPayload) return false;

    const enriched = {
      ...createScanRecordFromContract(scanConfig, contractPayload),
      scanMode: SCAN_MODE.STANDARD,
    };
    setUnsavedScan(enriched);
    setSelectedScanId(enriched.id);
    setSelectedDevice(null);
    setIsViewingFreshScan(true);
    setSaveFeedback(null);
    setPendingScanConfig(null);
    setView(VIEW_RESULTS);
    return true;
  }

  // Persist the new scan and take the user straight to the detail view.
  async function handleCreateScan(payload) {
    if (!payload) return;
    stopLongScan("manual");
    setPendingScanConfig(payload);
    closeWizard();
    setView(VIEW_SCANNING);
    await runScanForConfig(payload);
  }

  async function retryPendingRunScan() {
    if (!pendingScanConfig || runScanStatus === RUN_SCAN_STATUS.RUNNING) return;
    setView(VIEW_SCANNING);
    await runScanForConfig(pendingScanConfig);
  }

  function backToScanSetup() {
    runScanRequestIdRef.current += 1;
    setRunScanStatus(RUN_SCAN_STATUS.IDLE);
    setRunScanError("");
    setPendingScanConfig(null);
    setView(VIEW_HOME);
    setShowWizard(true);
  }

  function snapshotScan(scan) {
    if (!scan) return null;
    try {
      return JSON.parse(JSON.stringify(scan));
    } catch (err) {
      console.warn("Failed to deep copy scan payload, falling back to shallow copy.", err);
      return { ...scan };
    }
  }

  function formatToMysqlDatetime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  async function persistScanReport(scanData) {
    if(!scanData) return;
    setIsSavingScan(true);
    setSaveFeedback(null);

    try{
      const devicesPayload = Array.isArray(scanData.findings)
        ? scanData.findings.map((device) => {
            const detailedFindings = Array.isArray(device?.findingsDetailed) ? device.findingsDetailed : [];
            return {
              ip: device?.ip || device?.ipAddress || null,
              hostname: device?.hostname || device?.deviceName || null,
              vendor: device?.vendor || null,
              type: device?.type || null,
              riskLevel:
                typeof device?.riskLevel === "string"
                  ? device.riskLevel.toUpperCase()
                  : getHighestSeverity(detailedFindings),
              status: typeof device?.status === "string" ? device.status.toUpperCase() : "COMPLETE",
              findings: detailedFindings.map((finding) => {
                const evidence = finding?.evidence || {};
                const normalizedPort = Number(evidence?.port);
                return {
                  title: finding?.title || "Unnamed finding",
                  severity: normalizeSeverity(finding?.severity),
                  description: finding?.description || null,
                  impact: finding?.impact || null,
                  recommendation: finding?.recommendation || null,
                  source: finding?.source || "service-map",
                  protocol: evidence?.protocol || null,
                  port: Number.isFinite(normalizedPort) ? normalizedPort : null,
                  service: evidence?.service || null,
                  state: evidence?.state || null,
                  cveIds: Array.isArray(finding?.cveIds) ? finding.cveIds : [],
                };
              }),
            };
          })
        : [];

      const payload = {
        scanName: scanData.name,
        scannedAt:
          formatToMysqlDatetime(scanData.submittedAtISO || scanData.submittedAt) ||
          formatToMysqlDatetime(new Date().toISOString()),
        status: typeof scanData?.status === "string" ? scanData.status.toUpperCase() : "COMPLETE",
        devices: devicesPayload,
      };

      const response = await axios.post(//Send request to /save-scan on server
        "http://localhost:3000/save-scan",
        payload,
        {withCredentials: true}
      );

      //if here, scan was successfully saved
      const savedReportId = String(response?.data?.scan_id || response?.data?.report_id || scanData.id);
      const savedScan = {
        ...snapshotScan(scanData),
        id: savedReportId,
        detailsLoaded: true,
        detailsLoading: false,
        detailsError: null,
      };

      setScans((prev) => {
        const withoutCurrent = prev.filter(
          (entry) => entry.id !== scanData.id && entry.id !== savedReportId
        );
        return pruneScans([savedScan, ...withoutCurrent], settings.retentionDays);
      });

      setUnsavedScan((current) => (current?.id === scanData.id ? null : current));
      setSelectedScanId(savedScan.id);
      setHasLoadedHistory(false);
      setSaveFeedback({type: "success", message: "Scan report saved."});
    }
    catch(err){//if here, saving failed
      console.error("Save scan error!: ", err);//log the error

      if(err.response)//Axios attaches backend response here for 400/500 errors
        setSaveFeedback({
          type: "error",
          message: err.response.data?.message || "Save scan failed!"
        });
      else
        setSaveFeedback({
          type: "error",
          message: "Unable to connect to server!"
        });
    }
    finally{
      setIsSavingScan(false);
    }
  }

  function handleSaveScanClick() {
    if (!selectedScan) return;
    if (!user) {
      setPendingLoginAction({
        type: LOGIN_ACTIONS.SAVE_SCAN,
        scan: snapshotScan(selectedScan),
      });
      openLogin();
      return;
    }
    persistScanReport(selectedScan);
  }

  const hasScans = scans.length > 0;
  const isLongScanSelected = selectedScan?.scanMode === SCAN_MODE.LONG;
  const selectedLongScanSession =
    isLongScanSelected && longScanSession?.scanId === selectedScan?.id
      ? longScanSession
      : null;
  const longScanDurationPreview = formatDurationFromMs(parseLongScanTimer(longScanTimerInput).totalMs);
  
  const showSaveButton = 
    unsavedScan?.id === selectedScanId &&
    view === VIEW_RESULTS &&
    !isSavingScan &&
    !isLongScanSelected;

  const selectedScanItemsLoading =
    Boolean(selectedScan) &&
    !isViewingFreshScan &&
    Boolean(selectedScan?.detailsLoading);

  const selectedScanItemsError =
    !isViewingFreshScan && selectedScan?.detailsError
      ? selectedScan.detailsError
      : null;

//the elements for each view and modal are laid out here
  return (
    <div className="frame">
      <div className="drift-layer" aria-hidden="true">
        {driftDots.map((dot) => (
          <span
            key={dot.id}
            className="drift-dot"
            style={{
              "--dot-size": `${dot.sizeRem}rem`,
              "--dot-opacity": dot.opacity,
              "--dot-duration": `${dot.duration}s`,
              "--dot-delay": `${dot.delay}s`,
              "--dot-x": `${dot.x}%`,
              "--dot-y": `${dot.y}%`,
              "--dot-lightness": `${dot.lightness}%`,
              "--dot-blur": `${dot.blur}px`,
            }}
          />
        ))}
      </div>
      <header className="header">
        <a
          className="logo"
          href="/"
          aria-label="Home"
          tabIndex="-1"
          onClick={(e) => { e.preventDefault(); goHome(); }}
        >
          <img className="logo-img" src={logoImage} alt="Vigil IoT logo" />
          
        </a>

        <nav className="top-actions" aria-label="Primary">
          <button type="button" className="settings-btn" onClick={openSettings}>Settings</button>
          {user ? (
            <button type="button" className="user-btn" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <button type="button" className="login-btn" onClick={openLogin}>Log in</button>
          )}
        </nav>
      </header>

        <main className={`main ${view === VIEW_HOME ? "main--home" : view === VIEW_SCANNING ? "main--scanning" : "main--fill"}`}>
          {/* Home view redesigned to feature the start panel artwork flanking the primary call to action. */}
          {view === VIEW_HOME && (
          <section className="home-start-panel" aria-label="Start scan panel">
            <div className="home-start-panel__center">
              <a
                href="/scan/new"
                className="start-circle home-start-panel__start"
                aria-label="Start Scan"
                onClick={openScanModePrompt}
                onMouseEnter={() => setIsRadarActive(true)}
                onMouseLeave={() => setIsRadarActive(false)}
                onFocus={() => setIsRadarActive(true)}
                onBlur={() => setIsRadarActive(false)}
              >
                <span className="start-radar" aria-hidden="true">
                  <svg viewBox="0 0 64 64" className="start-radar__svg">
                    <circle className="start-radar__ring" cx="32" cy="32" r="30" />
                    <g className="start-radar__sweep-group">
                      <path className="start-radar__sweep" d="M32 32 L32 2 A30 30 0 0 1 62 32 Z" />
                      <path className="start-radar__grid" d="M32 12 A20 20 0 0 1 52 32" />
                      <path className="start-radar__grid" d="M32 18 A14 14 0 0 1 46 32" />
                    </g>
                    <g className="start-radar__pings">
                      {radarPings.map((ping) => (
                        <circle
                          key={ping.id}
                          className="start-radar__ping"
                          cx={ping.cx}
                          cy={ping.cy}
                          r={ping.r}
                          style={{
                            "--ping-delay": `${ping.delayMs}ms`,
                            "--ping-life": `${RADAR_PING_FADE_MS}ms`,
                          }}
                        />
                      ))}
                    </g>
                  </svg>
                </span>
                <span className="start-text">Start Scan</span>
              </a>

              <p className="home-start-panel__subtitle">
                Scan your local network for vulnerable IoT devices
              </p>

              <button
                type="button"
                className="prev-scans"
                onClick={handleHistoryButtonClick}
              >
                <span className="prev-scans__icon" aria-hidden="true" />
                <span className="prev-scans__content">
                  <span className="prev-scans__title">Previous Scans</span>
                  <span className="prev-scans__subtitle">View past results</span>
                </span>
                <span className="prev-scans__arrow" aria-hidden="true">&gt;</span>
              </button>
            </div>
          </section>
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
            {historyFeedback && (
              <p className={`history-feedback history-feedback--${historyFeedback.type === "error" ? "error" : "info"}`}>
                {historyFeedback.message}
              </p>
            )}
            {isHistoryLoading ? (
              <p className="history-empty">Loading scan history...</p>
            ) : hasScans ? (
              <ul className="history-list">
                {scans.map((scan) => (
                  <li key={scan.id} className="history-item">
                    <div className="history-card">
                      <button
                        type="button"
                        className="history-cardMain"
                        onClick={() => handleSelectScan(scan.id)}
                      >
                        <span className="history-itemName">{scan.name}</span>
                        <span className="history-itemMeta">{scan.submittedAt}</span>
                      </button>
                      <button
                        type="button"
                        className="history-deleteBtn"
                        aria-label={`Delete scan ${scan.name}`}
                        onClick={() => handleDeleteScan(scan.id)}
                        disabled={deletingScanId === scan.id}
                      >
                        <img className="history-deleteIcon" src={trashIcon} alt="" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="history-empty">No scans recorded yet.</p>
            )}
          </section>
        )}

        {view === VIEW_SCANNING && (
          <section className="scan-progress" aria-live="polite">
            <div className="scan-progress__panel">
              <span className="scan-progress__spinner" aria-hidden="true" />
              <h1 className="scan-progress__title">
                {runScanStatus === RUN_SCAN_STATUS.ERROR
                  ? "Unable to match scan results"
                  : "Matching devices to vulnerabilities"}
              </h1>
              <p className="scan-progress__message">
                {runScanStatus === RUN_SCAN_STATUS.ERROR
                  ? (runScanError || "Backend matching failed. Retry once the scan service is ready.")
                  : "Preparing vulnerability findings for the devices you selected. This can take a minute."}
              </p>
              {runScanStatus === RUN_SCAN_STATUS.ERROR && (
                <div className="scan-progress__actions">
                  <button type="button" className="scan-progress__btn scan-progress__btn--primary" onClick={retryPendingRunScan}>
                    Retry matching
                  </button>
                  <button type="button" className="scan-progress__btn scan-progress__btn--ghost" onClick={backToScanSetup}>
                    Back to scan setup
                  </button>
                </div>
              )}
            </div>
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
              onBackToHome={handleResultsBackClick}
              showSaveButton={showSaveButton}
              onSaveScan={handleSaveScanClick}
              isSavingScan={isSavingScan}
              saveFeedback={saveFeedback}
              isLoadingItems={selectedScanItemsLoading}
              itemsError={selectedScanItemsError}
              longScanSession={selectedLongScanSession}
              onStopLongScan={() => stopLongScan("manual")}
              onResumeLongScan={resumeLongScan}
              onRetryLoadItems={() => {
                if (selectedScan?.id) {
                  loadScanDetails(selectedScan.id, user);
                }
              }}
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
      {showScanModePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-mode-title"
          className="modal-backdrop"
          onClick={closeScanModePrompt}
        >
          <div className="modal-sheet scan-mode-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="scan-mode-body">
              <h2 id="scan-mode-title" className="scan-mode-title">Choose Scan Type</h2>
              <p className="scan-mode-copy">
                Run a standard vulnerability scan or start a long-running dynamic stream.
              </p>
              <div className="scan-mode-actions">
                <button
                  type="button"
                  className="scan-mode-btn scan-mode-btn--primary"
                  onClick={handleSelectStandardScan}
                >
                  Standard Scan
                </button>
                <button
                  type="button"
                  className="scan-mode-btn scan-mode-btn--secondary"
                  onClick={handleSelectLongScan}
                >
                  Long Dynamic Scan
                </button>
              </div>
              <button
                type="button"
                className="scan-mode-cancel"
                onClick={closeScanModePrompt}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showLongScanSetup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="long-scan-title"
          className="modal-backdrop"
          onClick={closeLongScanSetup}
        >
          <div className="modal-sheet scan-mode-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="scan-mode-body">
              <h2 id="long-scan-title" className="scan-mode-title">Long Dynamic Scan Timer</h2>
              <p className="scan-mode-copy">
                Set how long to stream packet anomalies. The scan auto-stops at this duration.
              </p>
              <div className="long-scan-grid">
                <label className="long-scan-field">
                  <span>Days</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={longScanTimerInput.days}
                    onChange={(e) => handleLongScanTimerInput("days", e.target.value)}
                    aria-label="Long scan days"
                  />
                </label>
                <label className="long-scan-field">
                  <span>Hours</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={longScanTimerInput.hours}
                    onChange={(e) => handleLongScanTimerInput("hours", e.target.value)}
                    aria-label="Long scan hours"
                  />
                </label>
                <label className="long-scan-field">
                  <span>Minutes</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={longScanTimerInput.minutes}
                    onChange={(e) => handleLongScanTimerInput("minutes", e.target.value)}
                    aria-label="Long scan minutes"
                  />
                </label>
                <label className="long-scan-field">
                  <span>Seconds</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={longScanTimerInput.seconds}
                    onChange={(e) => handleLongScanTimerInput("seconds", e.target.value)}
                    aria-label="Long scan seconds"
                  />
                </label>
              </div>
              <p className="long-scan-preview">Duration: {longScanDurationPreview}</p>
              {longScanTimerError && (
                <p className="long-scan-error">{longScanTimerError}</p>
              )}
              <div className="scan-mode-actions">
                <button
                  type="button"
                  className="scan-mode-btn scan-mode-btn--secondary"
                  onClick={closeLongScanSetup}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="scan-mode-btn scan-mode-btn--primary"
                  onClick={handleStartLongScan}
                >
                  Start Long Scan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWizard && (
        <div
          role="dialog"
          aria-modal="true"
          className="modal-backdrop"
          onPointerDown={handleWizardBackdropPointerDown}
          onPointerUp={handleWizardBackdropPointerUp}
          onPointerLeave={resetWizardBackdropPointerFlag}
          onPointerCancel={resetWizardBackdropPointerFlag}
        >
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <NewScanWizard
                onCreate={handleCreateScan}
                onClose={closeWizard}
                defaultOptions={settings.defaultOptions}
              />
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

      {showLogin && (
        <LoginModal
          onClose={closeLogin}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {showUnsavedClosePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-unsaved-title"
          className="modal-backdrop"
          onClick={closeUnsavedClosePrompt}
        >
          <div className="modal-sheet confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-body">
              <h2 id="close-unsaved-title" className="confirm-title">
                You are about to close without saving your Scan Report, would you like to close without saving?
              </h2>
              <div className="confirm-actions">
                <button type="button" className="confirm-btn confirm-btn--secondary" onClick={closeUnsavedClosePrompt}>
                  No
                </button>
                <button type="button" className="confirm-btn confirm-btn--primary" onClick={handleConfirmCloseWithoutSaving}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <a href="/legal" className="legal">LEGAL</a>
        <a href="https://jackrayallday.github.io/Vigil-IoT/" className="intro">Demo / Introduction</a>
      </footer>
    </div>
  );
}
