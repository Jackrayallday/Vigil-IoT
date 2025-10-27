/*
file: src/NewScanWizard.jsx
programmer: Jack Ray
===================================================
Component for the new scan wizard modal dialog. Collects scan name, targets, exclusions, and options.
*/
import React, { useEffect, useMemo, useState } from "react";
import "./styles/new-scan-wizard.css";

// Local default flags mirror the toggles shown in the form.
const DEFAULT_OPTIONS = {
  discover: true,
  serviceDetection: true,
  legacyProtocols: false,
  weakCreds: false,
  safeMode: true,
};

/**
 * Collects the information needed to start a scan.
 *
 * Think of the component as three layers:
 * 1. State - store what the user types or toggles.
 * 2. Derived data - turn raw strings into validated arrays.
 * 3. Submit - package everything up and hand it back via `onCreate`.
 *
 * Props:
 * - onCreate(payload): parent receives the collected values (may return a Promise)
 * - onClose(): modal wrapper hides itself
 * - defaultOptions: checkbox defaults, usually pulled from saved settings
 */
export default function NewScanWizard({ onCreate, onClose, defaultOptions = DEFAULT_OPTIONS }) {
  // --- Text inputs the user can edit ---
  const [scanName, setScanName] = useState(defaultScanName());
  const [targetsInput, setTargetsInput] = useState("");
  const [exclusionsInput, setExclusionsInput] = useState("");

  // --- Scan option toggles ---
  const initialOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...(defaultOptions || {}) }),
    [defaultOptions],
  );
  const [options, setOptions] = useState(initialOptions);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // If the surrounding app changes the defaults (for example after saving new settings) mirror them here.
  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  // --- Derived data ---
  // useMemo keeps the splitting/validation work from running on every render.
  const targets = useMemo(() => tokenize(targetsInput), [targetsInput]);
  const exclusions = useMemo(() => tokenize(exclusionsInput), [exclusionsInput]);

  const invalidTargets = useMemo(() => targets.filter((t) => !isValidIPv4OrCidr(t)), [targets]);
  const invalidExclusions = useMemo(() => exclusions.filter((t) => !isValidIPv4OrCidr(t)), [exclusions]);

  // Quick sanity check that drives the disabled state of the submit button.
  const isFormValid =
    scanName.trim().length > 0 &&
    targets.length > 0 &&
    invalidTargets.length === 0 &&
    invalidExclusions.length === 0;

  // Flip individual option flags when checkboxes are toggled.
  function toggleOption(key) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Wrap the submit flow so we can show loading state and bubble any error back into the UI.
  async function handleSubmit(e) {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setErrorMsg("");

    const payload = {
      name: scanName.trim(),
      targets,
      exclusions,
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

  // --- Layout ---
  // The markup below is standard JSX; think HTML with curly braces around the dynamic bits.
  return (
    <form onSubmit={handleSubmit} className="nsw-form">
      <h1 className="nsw-title">New Scan</h1>

      <div className="nsw-group">
        <label htmlFor="scanName" className="nsw-label">Scan name</label>
        <input
          id="scanName"
          type="text"
          value={scanName}
          onChange={(e) => setScanName(e.target.value)}
          className="nsw-input"
          placeholder="e.g., Dorm LAN sweep"
          disabled={submitting}
        />
      </div>

      <div className="nsw-group">
        <label htmlFor="targets" className="nsw-label">
          Targets <span className="nsw-note">(required)</span>
        </label>
        <textarea
          id="targets"
          rows={5}
          value={targetsInput}
          onChange={(e) => setTargetsInput(e.target.value)}
          className="nsw-textarea"
          placeholder={"192.168.1.0/24\n10.0.0.5"}
          disabled={submitting}
        />
        {/* Only render an error if the validation step above spotted a bad address. */}
        {invalidTargets.length > 0 && (
          <p className="nsw-error">Invalid entries: {invalidTargets.join(", ")}</p>
        )}
        <p className="nsw-help">IPv4 or IPv4/CIDR. Separate with new lines or commas.</p>
      </div>

      <div className="nsw-group">
        <label htmlFor="exclusions" className="nsw-label">
          Exclusions <span className="nsw-note">(optional)</span>
        </label>
        <textarea
          id="exclusions"
          rows={4}
          value={exclusionsInput}
          onChange={(e) => setExclusionsInput(e.target.value)}
          className="nsw-textarea"
          placeholder={"10.0.0.0/24\n192.168.1.10"}
          disabled={submitting}
        />
        {/* Same validation pattern as the targets field but for hosts we want to skip. */}
        {invalidExclusions.length > 0 && (
          <p className="nsw-error">Invalid exclusions: {invalidExclusions.join(", ")}</p>
        )}
      </div>

      <fieldset className="nsw-fieldset" disabled={submitting}>
        <legend className="nsw-legend">Options</legend>
        <Checkbox label="Discover hosts" checked={options.discover} onChange={() => toggleOption("discover")} />
        <Checkbox label="Service detection" checked={options.serviceDetection} onChange={() => toggleOption("serviceDetection")} />
        <Checkbox label="Legacy protocols" checked={options.legacyProtocols} onChange={() => toggleOption("legacyProtocols")} />
        <Checkbox label="Weak credentials" checked={options.weakCreds} onChange={() => toggleOption("weakCreds")} />
        <Checkbox label="Safe mode" checked={options.safeMode} onChange={() => toggleOption("safeMode")} />
      </fieldset>

      {/* Show failure returned by onCreate. */}
      {errorMsg && <div className="nsw-errorBox">{errorMsg}</div>}

      <div className="nsw-actions">
        <button type="button" onClick={onClose} disabled={submitting} className="nsw-btn nsw-btnGhost">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isFormValid || submitting}
          className={`nsw-btn ${isFormValid && !submitting ? "nsw-btnPrimary" : "nsw-btnDisabled"}`}
        >
          {/* Swap button text between loading state and the normal label. */}
          {submitting ? (
            <span className="nsw-loadingWrap">
              <span className="nsw-spinner" aria-hidden="true" /> Creating...
            </span>
          ) : (
            "Create scan"
          )}
        </button>
      </div>
    </form>
  );
}

// Reusable label/checkbox pair used across the fieldset above.
function Checkbox({ label, checked, onChange }) {
  return (
    <label className="nsw-checkboxRow">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

// Helper utilities keep the main component focused on UI concerns.
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
