/*
file: src/DeviceDetails.jsx
programmer: Jack Ray
===================================================
Component to display detailed information about a selected device.
*/

import React from "react";
import "./styles/device.css";

export default function DeviceDetails({ device, onBack, onPrint }) {
  if (!device) {
    return (
      <section className="device-shell">
        <div className="device-header">
          <button type="button" className="device-backBtn" onClick={onBack}>
            Back to results
          </button>
        </div>
        <article className="device-card">
          <p className="device-empty">No device selected.</p>
        </article>
      </section>
    );
  }

  const name = device.deviceName || device.name || device.itemDiscovered || "Unknown";
  const warnings = device.protocolWarnings || "None";
  const services = device.services || device.serviceSummary || "Unknown";
  const address = device.ipAddress || device.itemDiscovered || "Unknown";
  const notes = device.notes;
  const remediation = device.remediationTips;

  return (
    <section className="device-shell" aria-labelledby="device-details-heading">
      <div className="device-header">
        <button type="button" className="device-backBtn" onClick={onBack}>
          Back to results
        </button>
        <h1 id="device-details-heading" className="device-title">
          Device Information
        </h1>
      </div>

      <article className="device-card">
        <dl className="device-grid">
          <div>
            <dt>Device Name</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>Protocol Warnings</dt>
            <dd>{warnings}</dd>
          </div>
          <div>
            <dt>Services</dt>
            <dd>{services}</dd>
          </div>
          <div>
            <dt>IP Address</dt>
            <dd>{address}</dd>
          </div>
          {notes && (
            <div>
              <dt>Notes</dt>
              <dd>{notes}</dd>
            </div>
          )}
          {remediation && (
            <div>
              <dt>Remediation Tips</dt>
              <dd>{remediation}</dd>
            </div>
          )}
        </dl>
        <button type="button" className="device-pdfBtn" onClick={onPrint}>
          Convert to PDF
        </button>
      </article>
    </section>
  );
}
