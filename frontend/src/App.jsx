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

const RADAR_SWEEP_MS = 2200;
const RADAR_PING_COUNT = 3;
const RADAR_PING_FADE_MS = 1800;
const RADAR_SWEEP_CENTER_OFFSET_DEG = 45;


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
  // Scan data is no longer persisted locally now that SQL handles storage.
  return [];
}

function safeParseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
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

function mapDevicesToFindings(scanId, devices = [], targets = []) {
  if (!Array.isArray(devices) || devices.length === 0) return [];
  return devices.map((device, index) => ({
    id: `${scanId}-device-${index + 1}`,
    position: index,
    deviceName: device.device_name || device.ip_address || `Device ${index + 1}`,
    itemDiscovered: device.device_name || device.ip_address || targets[index] || `Target ${index + 1}`,
    ipAddress: device.ip_address || "N/A",
    services: device.services || "N/A",
    protocolWarnings: device.protocol_warnings || "N/A",
    remediationTips: device.remediation_tips || "Review configuration",
    notes: device.notes || "",
  }));
}

function mapReportToScan(report, devices = null) {
  if (!report) return null;
  const targets = safeParseJsonArray(report.targets);
  const exclusions = safeParseJsonArray(report.exclusions);
  const submittedAt = report.scanned_at ? new Date(report.scanned_at) : new Date();
  const submittedAtISO = submittedAt.toISOString();
  const submittedAtLabel = submittedAt.toLocaleString();
  const scanId = String(report.report_id ?? createId("scan"));
  const hasDevicePayload = Array.isArray(devices);
  const findings = hasDevicePayload ? mapDevicesToFindings(scanId, devices, targets) : null;

  return {
    id: scanId,
    name: report.title || "Untitled scan",
    status: "complete",
    submittedAt: submittedAtLabel,
    submittedAtISO,
    moduleSummary: report.detection_options || "Not specified",
    targets,
    exclusions,
    findings,
    detailsLoaded: hasDevicePayload,
    detailsLoading: false,
    detailsError: null,
  };
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
    initialScansRef.current = loadStoredScans(initialSettings.retentionDays);
  }
  const initialScans = initialScansRef.current;

  // --- UI state toggles ---
  const [showWizard, setShowWizard] = useState(false);
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


  // On first render, apply the stored theme so the UI does not flash light/dark.
  useEffect(() => {
    applyTheme(settings.theme);
  }, []);

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

  // Handy pointer to whichever scan is selected in the history/results views.
  const selectedScan = useMemo(() => {
    if (unsavedScan && selectedScanId === unsavedScan.id) {
      return unsavedScan;
    }
    return scans.find((scan) => scan.id === selectedScanId) || null;
  }, [scans, selectedScanId, unsavedScan]);

  // Modal open/close helpers keep those booleans in place.
  async function openWizard(e) {
    e.preventDefault();
    setShowSettings(false);
    setShowLogin(false);
    
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

  function openLogin(e) {
    if(e) e.preventDefault();
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

  function goHome() {
    setView(VIEW_HOME);
    setSelectedDevice(null);
    setShowLogin(false);
    setShowSettings(false);
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
      const reports = reportsRes?.data?.success ? reportsRes.data.reports || [] : [];
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
      const devices = devicesRes?.data?.success ? devicesRes.data.devices || [] : [];
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

      //uncomment and edit when you find a way to print logout failure message in UI
      /*if(err.response)//Axios attaches backend response here for 400/500 errors
        //print(err.response.data?.message || "Registration failed!");
      else//if here, no response at all (network error, server down, CORS, timeout)
	      //print("Unable to connect to server!");*/
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
        persistScanReport(scanToPersist/*, actor*/);//actor no longer needed
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

  // Persist the new scan and take the user straight to the detail view.
  async function handleCreateScan(payload) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const enriched = createScanRecord(payload);
    setUnsavedScan(enriched);
    setSelectedScanId(enriched.id);
    setSelectedDevice(null);
    setIsViewingFreshScan(true);
    setSaveFeedback(null);
    setView(VIEW_RESULTS);
    closeWizard();
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

  async function persistScanReport(scanData/*, actor = user*/) {//KV: actor no longer needed
    if(!scanData) return;
    /*if (!actor?.user_id) {
      setSaveFeedback({ type: "error", message: "Log in to save scan reports." });
      return;
    }*/
    setIsSavingScan(true);
    setSaveFeedback(null);

    try{
      const payload = {
        //user_id: actor.user_id,//KV: no longer needed (not used by backend)
        title: scanData.name,
        scanned_at: formatToMysqlDatetime(scanData.submittedAtISO || scanData.submittedAt) ||
                    formatToMysqlDatetime(new Date().toISOString()),
        targets: JSON.stringify(scanData.targets || []),
        exclusions: JSON.stringify(scanData.exclusions || []),
        detection_options: scanData.moduleSummary,
        devices: Array.isArray(scanData.findings) ? scanData.findings : []//scanData.findings||[],
      };

      const response = await axios.post(//Send request to /save-scan on server
        "http://localhost:3000/save-scan",
        payload,
        {withCredentials: true}
      );

      //if here, scan was successfully saved
      const savedReportId = String(response?.data?.report_id || scanData.id);
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
      //setIsViewingFreshScan(false);//KV: removed to fix UI bug
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
    persistScanReport(selectedScan/*, user*/);//user no longer needed
  }

  const hasScans = scans.length > 0;
  
  //KV add: fix bug that prevents "save scan" buttom from disappearing
  const showSaveButton = 
    unsavedScan?.id === selectedScanId &&
    view === VIEW_RESULTS && !isSavingScan;

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

        <main className={`main ${view === VIEW_HOME ? "main--home" : "main--fill"}`}>
          {/* Home view redesigned to feature the start panel artwork flanking the primary call to action. */}
          {view === VIEW_HOME && (
          <section className="home-start-panel" aria-label="Start scan panel">
            <div className="home-start-panel__center">
              <a
                href="/scan/new"
                className="start-circle home-start-panel__start"
                aria-label="Start Scan"
                onClick={openWizard}
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
                      {radarPings.map((ping, index) => (
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

        {/* Results view: show modules, findings, and related actions for the selected scan. */}
        {view === VIEW_RESULTS && (
          <div className="results-host">
            <ScanResults
              scan={selectedScan}
              allScans={scans}
              onSelectScan={handleSelectScan}
              onSelectDevice={handleSelectDevice}
              onBackToHome={goHome}
              showSaveButton={showSaveButton}//{isViewingFreshScan}//KV edit: fix non-disappearing "save scan" button
              onSaveScan={handleSaveScanClick}
              isSavingScan={isSavingScan}
              saveFeedback={saveFeedback}
              isLoadingItems={selectedScanItemsLoading}
              itemsError={selectedScanItemsError}
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

      {showLogin && (
        <LoginModal
          onClose={closeLogin}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      <footer className="footer">
        <a href="/legal" className="legal">LEGAL</a>
        <a href="/intro" className="intro">Demo / Introduction</a>
      </footer>
    </div>
  );
}
