/*
file: src/DeviceDetails.jsx
programmer: Jack Ray
===================================================
Component to display detailed information about a selected device.
*/

import React, { useState, useEffect } from "react";
import "./styles/device.css";

export default function DeviceDetails({ device, onBack, onPrint }) {
  if (!device) {
    return (
      <section className="device-shell">
        <div className="device-header">
          <button
            type="button"
            className="device-backBtn"
            onClick={onBack}
          >
            Back to results
          </button>
        </div>
        <article className="device-card">
          <p className="device-empty">No device selected.</p>
        </article>
      </section>
    );
  }

  // Use the device as-is (no enrichment or extra fetch)
  const dev = device;

  // Device Name: hostname or deviceName with a fallback
  const deviceName = dev.hostname || dev.deviceName || "Not Available";

  // IP Address: use ip/ipAddress with fallback
  const ipAddress = dev.ip || dev.ipAddress || "Not Available";

  // Services:
  // - Prefer dev.services if it's an array
  // - Otherwise, fall back to discovered_via
  const discoveredVia = Array.isArray(dev.discovered_via)
    ? dev.discovered_via
    : [];

  const servicesFromField = Array.isArray(dev.services)
    ? dev.services
    : [];

  const combinedServices = servicesFromField.length
    ? servicesFromField
    : discoveredVia;

  const servicesDisplay =
    combinedServices.length > 0
      ? combinedServices.join(", ")
      : "None detected";

  // Notes: assemble Vendor / MAC / Interface / Discovered via / Notes
  const notesParts = [];

  if (dev.vendor) {
    notesParts.push(`Vendor: ${dev.vendor}`);
  }
  if (dev.mac) {
    notesParts.push(`MAC Address: ${dev.mac}`);
  }
  if (dev.iface) {
    notesParts.push(`Interface: ${dev.iface}`);
  }
  if (discoveredVia.length > 0) {
    notesParts.push(`Discovered via: ${discoveredVia.join(", ")}`);
  }
  if (dev.notes) {
    notesParts.push(dev.notes);
  }

  const notes =
    notesParts.length > 0
      ? notesParts.join(" | ")
      : "No additional information available";

  return (
    <section className="device-shell">
      <div className="device-header">
        <button
          type="button"
          className="device-backBtn"
          onClick={onBack}
        >
          Back to results
        </button>

        {onPrint && (
          <button
            type="button"
            className="device-printBtn"
            onClick={onPrint}
          >
            Print
          </button>
        )}
      </div>

      <article className="device-card">
        <header className="device-cardHeader">
          <h1 className="device-title">{deviceName}</h1>
          <p className="device-subtitle">
            IP Address: {ipAddress}
          </p>
        </header>

        <div className="device-body">
          <div className="device-field">
            <h2 className="device-fieldLabel">Device Name</h2>
            <p className="device-fieldValue">{deviceName}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">Services</h2>
            <p className="device-fieldValue">{servicesDisplay}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">IP Address</h2>
            <p className="device-fieldValue">{ipAddress}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">Notes</h2>
            <p className="device-fieldValue">{notes}</p>
          </div>
        </div>
      </article>
    </section>
  );
}
