/*
file: src/NewScanWizard.jsx
programmer: Jack Ray
===================================================
Component for the new scan wizard modal dialog. Collects scan name, targets, and options.
*/
import React, { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  const targets = useMemo(
    () => targetEntries.filter((entry) => entry.checked).map((entry) => entry.value),
    [targetEntries],
  );
  const manualTokens = useMemo(() => tokenize(manualTargetInput), [manualTargetInput]);
  const isManualValid = manualTokens.length > 0 && manualTokens.every((t) => isValidIPv4OrCidr(t));
  const isNameMissing = scanName.trim().length === 0;
  const areTargetsMissing = targets.length === 0;

  const isFormValid = !isNameMissing && !areTargetsMissing && !targetError;

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
          </header>

          <div className="nsw-targetList" aria-label="Discovered targets">
            {targetEntries.length === 0 ? (
              <div className="nsw-targetEmpty">
                <p>Waiting for targets...</p>
                <p className="nsw-note">Add targets manually to get started.</p>
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
