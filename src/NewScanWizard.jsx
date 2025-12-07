/*
file: src/NewScanWizard.jsx
programmer: Jack Ray
===================================================
Component for the new scan wizard modal dialog. Collects scan name, targets, and options.
*/
import React, { useEffect, useMemo, useState, useRef } from "react";
import "./styles/new-scan-wizard.css";

const DEFAULT_OPTIONS = {
  discover: true,
  serviceDetection: true,
  legacyProtocols: false,
  weakCreds: false,
  safeMode: true,
};

export default function NewScanWizard({ onCreate, onClose, defaultOptions = DEFAULT_OPTIONS }) {
  const [scanName, setScanName] = useState("");
  const [showNamePlaceholder, setShowNamePlaceholder] = useState(true);
  const [manualTargetInput, setManualTargetInput] = useState("");
  const [targetEntries, setTargetEntries] = useState([]);

  const initialOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...(defaultOptions || {}) }),
    [defaultOptions],
  );
  const [options, setOptions] = useState(initialOptions);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [targetError, setTargetError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [indicatorState, setIndicatorState] = useState("center"); // center | corner | stalled
  const idleTimerRef = useRef(null);

  const [discoveryError, setDiscoveryError] = useState("");

  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  /*Pull data from discovery.json.*/
useEffect(() => {
    if (targetEntries.length > 0) return; // don't override manual choices

    const controller = new AbortController();

    async function loadDiscoveredTargets() {
      try {
        const res = await fetch("http://localhost:3002/discovery.json", { signal: controller.signal });

        if (!res.ok) {
          if (res.status !== 404) {
            setDiscoveryError("Could not load discovered targets."); 
          }

          return;
        }

        const data = await res.json();
        const devices = Array.isArray(data?.devices) ? data.devices : [];

        const ips = [
          ...new Set(
            devices
              .map((d) => d.ip || d.ip_address)
              .filter(Boolean)
          ),
        ];

        if (ips.length === 0) return;

        setTargetEntries((prev) => {
          if (prev.length > 0) return prev;
          return ips.map((ip) => ({
            id: createLocalId("target"),
            value: ip,
            checked: true,
          })); // ✨ NEW
        });

        setIndicatorState("corner"); 
      } catch (err) {
        if (err.name !== "AbortError") {
          setDiscoveryError("Error loading discovered targets."); 
        }
      }
    }

    loadDiscoveredTargets();
    return () => controller.abort();
  }, [targetEntries.length]);

  const targets = useMemo(
    () => targetEntries.filter((entry) => entry.checked).map((entry) => entry.value),
    [targetEntries],
  );
  const manualTokens = useMemo(() => tokenize(manualTargetInput), [manualTargetInput]);
  const isManualValid = manualTokens.length > 0 && manualTokens.every((t) => isValidIPv4OrCidr(t));
  const isNameMissing = scanName.trim().length === 0;
  const areTargetsMissing = targets.length === 0;

  const isFormValid = !isNameMissing && !areTargetsMissing && !targetError;

  // Move indicator between center/corner depending on targets present.
  useEffect(() => {
    if (targetEntries.length === 0 && indicatorState === "corner") {
      setIndicatorState("center");
    }
    if (targetEntries.length > 0 && indicatorState === "center") {
      setIndicatorState("corner");
    }
  }, [targetEntries.length, indicatorState]);

  // Idle timer: after 10s in center or corner, pause the indicator (stalled).
  useEffect(() => {
    clearIdleTimer(idleTimerRef);
    if (indicatorState === "center" || indicatorState === "corner") {
      idleTimerRef.current = window.setTimeout(() => setIndicatorState("stalled"), 10_000);
    }
    return () => clearIdleTimer(idleTimerRef);
  }, [indicatorState]);

  function toggleOption(key) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setShowValidation(true);
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setErrorMsg("");

    const payload = {
      name: scanName.trim(),
      targets,
      exclusions: [],
      options: { ...options },
    };

    try {
      const maybe = typeof onCreate === "function" ? onCreate(payload) : null;
      if (maybe && typeof maybe.then === "function") await maybe;
      if (typeof onClose === "function") onClose();
    } catch (err) {
      setErrorMsg(err?.message || "Failed to create scan.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleTargetChecked(id) {
    setTargetEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, checked: !entry.checked } : entry)),
    );
  }

  function handleAddTargets(e) {
    if (e) e.preventDefault();
    if (!manualTargetInput.trim()) {
      setTargetError("");
      return;
    }
    const tokens = tokenize(manualTargetInput);
    const invalid = tokens.filter((token) => !isValidIPv4OrCidr(token));
    if (invalid.length > 0) {
      setTargetError(`Invalid target(s): ${invalid.join(", ")}`);
      return;
    }

    setTargetError("");
    setTargetEntries((prev) => {
      const existing = new Set(prev.map((entry) => entry.value));
      const next = tokens
        .filter((token) => !existing.has(token))
        .map((token) => ({
          id: createLocalId("target"),
          value: token,
          checked: true,
        }));
      return [...prev, ...next];
    });
    setManualTargetInput("");
    const willHaveTargets = targetEntries.length + tokens.length > 0;
    setIndicatorState(willHaveTargets ? "corner" : "center");
  }

  function handleManualInputKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTargets();
    }
  }

  return (
    <div className="nsw-shell">
      <button
        type="button"
        className="nsw-closeBtn nsw-closeBtn--outer"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <form onSubmit={handleSubmit} className="nsw-form nsw-form--panel">
        <div className="nsw-headingBar">
          <input
            id="scanName"
            type="text"
            value={scanName}
            onChange={(e) => setScanName(e.target.value)}
            onFocus={() => setShowNamePlaceholder(false)}
            onBlur={() => setShowNamePlaceholder(scanName.trim().length === 0)}
            className={`nsw-input nsw-input--title ${showValidation && isNameMissing ? "nsw-input--invalid" : ""}`}
            placeholder={showNamePlaceholder ? "New scan name here..." : ""}
            disabled={submitting}
            aria-label="Scan name"
          />
        </div>
        {showValidation && isNameMissing && <p className="nsw-warning">Enter a scan name.</p>}

        <section className="nsw-card">
          <header className="nsw-card__header">
            <div className="nsw-card__title">
              <span>Targets</span>
              <span className="nsw-note">(required)</span>
            </div>
            {indicatorState === "corner" && (
              <div className="nsw-refreshSlot" aria-live="polite">
                <WifiSpinner variant="small" />
              </div>
            )}
            {indicatorState === "stalled" && (
              <button
                type="button"
                className="nsw-refreshBtn"
                onClick={() => setIndicatorState("center")}
                aria-label="Scan more"
              >
                <WifiSpinner variant="small" animated={false} />
                <span className="nsw-refreshBtn__text">Scan more</span>
              </button>
            )}
          </header>

          <div className="nsw-targetList" aria-label="Discovered targets">
            {discoveryError &&( 
              <p className="nsw-error" style={{ marginBottom: "0.5rem"}}>
                {discoveryError}
                </p>
            )}
            {targetEntries.length === 0 ? (
              <div className="nsw-targetEmpty">
                {indicatorState === "center" && <WifiSpinner variant="large" />}
                {indicatorState === "center" && <p>Scanning for targets...</p>}
              </div>
            ) : (
              <ul>
                {targetEntries.map((entry) => (
                  <li key={entry.id} className="nsw-targetRow">
                    <label>
                      <input
                        type="checkbox"
                        checked={entry.checked}
                        onChange={() => toggleTargetChecked(entry.id)}
                        disabled={submitting}
                      />
                      <span>{entry.value}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="nsw-manualRow">
            <input
              type="text"
              value={manualTargetInput}
              onChange={(e) => setManualTargetInput(e.target.value)}
              onKeyDown={handleManualInputKeyDown}
              className="nsw-input nsw-input--manual"
              placeholder="Manually enter IP address not found in scan..."
              disabled={submitting}
              aria-label="Manually add IP or CIDR"
            />
            <button
              type="button"
              className={`nsw-btn nsw-btnSquare ${isManualValid ? "nsw-btnReady" : ""}`}
              onClick={handleAddTargets}
              disabled={submitting}
              aria-label="Add target"
            >
              +
            </button>
          </div>
          {targetError && <p className="nsw-error">{targetError}</p>}
          {!targetError && showValidation && areTargetsMissing && <p className="nsw-warning">Add at least one target.</p>}
          <p className="nsw-help">IPv4 or IPv4/CIDR. Add one or multiple (comma or newline separated).</p>
        </section>

        <section className="nsw-card">
          <header className="nsw-card__header">
            <span className="nsw-card__title">Options</span>
          </header>
          <div className="nsw-options">
            <Checkbox label="Discover hosts" checked={options.discover} onChange={() => toggleOption("discover")} disabled={submitting} />
            <Checkbox label="Service detection" checked={options.serviceDetection} onChange={() => toggleOption("serviceDetection")} disabled={submitting} />
            <Checkbox label="Legacy protocols" checked={options.legacyProtocols} onChange={() => toggleOption("legacyProtocols")} disabled={submitting} />
            <Checkbox label="Weak credentials" checked={options.weakCreds} onChange={() => toggleOption("weakCreds")} disabled={submitting} />
            <Checkbox label="Safe mode" checked={options.safeMode} onChange={() => toggleOption("safeMode")} disabled={submitting} />
          </div>
        </section>

        {errorMsg && <div className="nsw-errorBox">{errorMsg}</div>}

        <div className="nsw-actions">
          <button type="button" onClick={onClose} disabled={submitting} className="nsw-btn nsw-btnGhost">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`nsw-btn ${isFormValid && !submitting ? "nsw-btnPrimary" : "nsw-btnDisabled"}`}
          >
            {submitting ? (
              <span className="nsw-loadingWrap">
                <span className="nsw-spinner" aria-hidden="true" /> Creating...
              </span>
            ) : (
              "Create Scan"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Checkbox({ label, checked, onChange, disabled }) {
  return (
    <label className="nsw-checkboxRow">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

function defaultScanName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `Scan ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tokenize(input) {
  return input.split(/[\n,\s]+/g).map((s) => s.trim()).filter(Boolean);
}

function isValidIPv4OrCidr(s) {
  const seg = "(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)";
  const ipv4 = `(?:${seg}\\.){3}${seg}`;
  const cidr = "(?:\\/(?:[0-9]|[1-2][0-9]|3[0-2]))?";
  const re = new RegExp(`^${ipv4}${cidr}$`);
  return re.test(s);
}

function createLocalId(prefix = "item") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function WifiSpinner({ variant = "small", animated = true }) {
  return (
    <svg
      className={`nsw-wifiSpinner ${variant === "large" ? "nsw-wifiSpinner--large" : ""}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Scanning for targets"
    >
      <circle fill="#e63946" r="11" cy="75" cx="28">
        {animated && (
          <animate
            begin="0s"
            keyTimes="0;0.2;1"
            values="0;1;1"
            dur="2.8s"
            repeatCount="indefinite"
            attributeName="fill-opacity"
          />
        )}
      </circle>
      <path strokeWidth="10" stroke="#d9a829" fill="none" d="M28 47A28 28 0 0 1 56 75">
        {animated && (
          <animate
            begin="0.28s"
            keyTimes="0;0.2;1"
            values="0;1;1"
            dur="2.8s"
            repeatCount="indefinite"
            attributeName="stroke-opacity"
          />
        )}
      </path>
      <path strokeWidth="10" stroke="#16b19a" fill="none" d="M28 25A50 50 0 0 1 78 75">
        {animated && (
          <animate
            begin="0.56s"
            keyTimes="0;0.2;1"
            values="0;1;1"
            dur="2.8s"
            repeatCount="indefinite"
            attributeName="stroke-opacity"
          />
        )}
      </path>
    </svg>
  );
}

function clearIdleTimer(ref) {
  if (ref.current) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}
