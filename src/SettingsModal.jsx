/*
file: src/SettingsModal.jsx
author: Jack Ray
===================================================
Component for the settings/preferences modal dialog.
*/
import React, { useState } from "react";
import "./styles/modal.css";
import "./styles/settings.css";

// Mirrors the toggles shown in the new scan wizard so both screens stay consistent.
const OPTION_FIELDS = [
  { key: "discover", label: "Discover hosts" },
  { key: "serviceDetection", label: "Service detection" },
  { key: "legacyProtocols", label: "Legacy protocols" },
  { key: "weakCreds", label: "Weak credentials" },
  { key: "safeMode", label: "Safe mode" },
];

/**
 *  Preference panel that lets the user tweak three things:
 * - theme (light/dark)
 * - which scan modules are pre-selected for each new scan
 * - how long scan history should stick around
 *
 * The parent component owns the saved values; we edit a copy here and hand them
 * back up through onSave when the form is submitted.
 */

export default function SettingsModal({ settings, onClose, onSave }) {
  // Local copies of the incoming settings keep the form snappy and easy to reset.
  const [theme, setTheme] = useState(settings?.theme || "light");
  const [retentionDays, setRetentionDays] = useState(String(settings?.retentionDays ?? 30));
  const [defaultOptions, setDefaultOptions] = useState({
    discover: true,
    serviceDetection: true,
    legacyProtocols: false,
    weakCreds: false,
    safeMode: true,
    ...(settings?.defaultOptions || {}),
  });

  // Convenience helper used by every checkbox in the options list.
  function toggleOption(key) {
    setDefaultOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Gather the form values and give them back to the parent so it can persist them.
  function handleSubmit(e) {
    e.preventDefault();
    const days = Math.max(1, Number.parseInt(retentionDays, 10) || 30);
    onSave({
      ...settings,
      theme,
      retentionDays: days,
      defaultOptions,
    });
  }

  return (
    <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet settings-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button type="button" className="modal-closeBtn" aria-label="Close" onClick={onClose}>
            X
          </button>
        </header>

        <form className="settings-form" onSubmit={handleSubmit}>
          <section className="settings-section">
            <h3>Appearance</h3>
            <div className="settings-row">
              <label htmlFor="settings-theme">Theme</label>
              <select id="settings-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </section>

          <section className="settings-section">
            <h3>Default Scan Options</h3>
            <div className="settings-options">
              {OPTION_FIELDS.map((field) => (
                <label key={field.key} className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(defaultOptions[field.key])}
                    onChange={() => toggleOption(field.key)}
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Data Retention</h3>
            <div className="settings-row">
              <label htmlFor="settings-retention">Keep scan history (days)</label>
              <input
                id="settings-retention"
                type="number"
                min="1"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
              />
            </div>
          </section>

          <div className="settings-actions">
            <button type="button" className="settings-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="settings-save">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
