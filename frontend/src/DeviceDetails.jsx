/*
file: src/DeviceDetails.jsx
programmers: Jack Ray, Richie Delgado
===================================================
Component to display detailed information about a selected device.
*/

import React, { useState, useEffect } from "react";
import "./styles/device.css";

export default function DeviceDetails({ device, onBack, onPrint }) {
  const [enrichedDevice, setEnrichedDevice] = useState(device);

  // Try to enrich device data from discovery.json if we have an IP
  useEffect(() => {
    if (!device) return;
    const deviceIp = device.ip || device.ipAddress || device.itemDiscovered;
    if (!deviceIp || deviceIp === "N/A" || deviceIp === "Not Available") {
      setEnrichedDevice(device);
      return;
    }

    // If device already has discovery fields, use it as-is
    if (device.hostname !== undefined || device.discovered_via || device.vendor || device.mac) {
      setEnrichedDevice(device);
      return;
    }

    // Otherwise, try to fetch from discovery.json
    async function enrichFromDiscovery() {
      try {
        const res = await fetch("http://localhost:3002/discovery.json");
        if (res.ok) {
          const data = await res.json();
          const devices = Array.isArray(data?.devices) ? data.devices : [];
          const foundDevice = devices.find(d => (d.ip || d.ip_address) === deviceIp);
          if (foundDevice) {
            // Merge discovery data with existing device data
            setEnrichedDevice({
              ...device,
              hostname: foundDevice.hostname,
              discovered_via: foundDevice.discovered_via,
              vendor: foundDevice.vendor,
              mac: foundDevice.mac,
              iface: foundDevice.iface,
              services: foundDevice.services || device.services,
            });
          } else {
            setEnrichedDevice(device);
          }
        } else {
          setEnrichedDevice(device);
        }
      } catch {
        // If fetch fails, just use the original device data
        setEnrichedDevice(device);
      }
    }
    enrichFromDiscovery();
  }, [device]);

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

  // Use enriched device data
  const dev = enrichedDevice || device;

  // Device Name: use hostname, fallback to "Not Available"
  const deviceName = dev.hostname || dev.deviceName || dev.name || "Not Available";

  // IP Address: extract from device object
  const ipAddress = dev.ip || dev.ipAddress || dev.itemDiscovered || "Not Available";

  // Services: build from discovered_via and services arrays
  const discoveredVia = Array.isArray(dev.discovered_via) ? dev.discovered_via : [];

  // Ensure services is always an array, handle both array and string formats
  let servicesArray = [];
  if (Array.isArray(dev.services)) {
    servicesArray = dev.services;
  } else if (dev.services && typeof dev.services === 'string' && dev.services !== 'N/A' && dev.services !== 'Unknown') {
    // If services is a string, try to parse it (could be comma-separated)
    servicesArray = dev.services.split(',').map(s => s.trim()).filter(Boolean);
  }

  const serviceList = [];

  // Add services from discovered_via (normalize to lowercase)
  discoveredVia.forEach(method => {
    const normalized = method.toLowerCase();
    if (normalized === 'arp' && !serviceList.includes('arp')) {
      serviceList.push('arp');
    } else if (normalized === 'ssh' && !serviceList.includes('ssh')) {
      serviceList.push('ssh');
    } else if (normalized === 'http' && !serviceList.includes('http')) {
      serviceList.push('http');
    } else if (normalized === 'https' && !serviceList.includes('https')) {
      serviceList.push('https');
    } else if (normalized && !serviceList.includes(normalized)) {
      serviceList.push(normalized);
    }
  });

  // Add services from services array
  servicesArray.forEach(service => {
    if (!service || service === 'N/A' || service === 'Unknown') return;
    const normalized = typeof service === 'string' ? service.toLowerCase().trim() : String(service).toLowerCase().trim();
    // Map common service names to standard format
    let mappedService = normalized;
    if (normalized.includes('ssh') || normalized === '22' || normalized.includes('port 22')) {
      mappedService = 'ssh';
    } else if (normalized.includes('https')) {
      mappedService = 'https';
    } else if (normalized.includes('http') && !normalized.includes('https')) {
      mappedService = 'http';
    } else if (normalized.includes('arp')) {
      mappedService = 'arp';
    }
    if (mappedService && mappedService !== 'n/a' && mappedService !== 'unknown' && !serviceList.includes(mappedService)) {
      serviceList.push(mappedService);
    }
  });

  // Display services
  const servicesDisplay = serviceList.length > 0 ? serviceList.join(', ') : 'None detected';
  const detailedFindings = Array.isArray(dev.findingsDetailed) ? dev.findingsDetailed : [];
  const riskLevel = dev.riskLevel || "UNKNOWN";
  const findingCount = Number.isFinite(Number(dev.findingCount)) ? Number(dev.findingCount) : detailedFindings.length;
  const statusLabel = dev.status || "COMPLETE";

  // Notes: compile helpful information
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
  if (dev.discovered_via && dev.discovered_via.length > 0) {
    notesParts.push(`Discovered via: ${dev.discovered_via.join(', ')}`);
  }
  if (dev.riskLevel) {
    notesParts.push(`Risk Level: ${dev.riskLevel}`);
  }
  if (Number.isFinite(Number(dev.findingCount))) {
    notesParts.push(`Findings: ${Number(dev.findingCount)}`);
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
            <h2 className="device-fieldLabel">Vendor</h2>
            <p className="device-fieldValue">{dev.vendor || "Unknown"}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">IP Address</h2>
            <p className="device-fieldValue">{ipAddress}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">Risk Level</h2>
            <p className="device-fieldValue">{riskLevel}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">Finding Count</h2>
            <p className="device-fieldValue">{findingCount}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">Status</h2>
            <p className="device-fieldValue">{statusLabel}</p>
          </div>

          <div className="device-field">
            <h2 className="device-fieldLabel">Notes</h2>
            <p className="device-fieldValue">{notes}</p>
          </div>
        </div>

        <section className="device-findings">
          <h2 className="device-findingsTitle">Findings</h2>
          {detailedFindings.length === 0 ? (
            <p className="device-findingsEmpty">No detailed findings are available for this device.</p>
          ) : (
            <ul className="device-findingList">
              {detailedFindings.map((finding, index) => {
                const cveIds = Array.isArray(finding?.cveIds) ? finding.cveIds : [];
                const evidence = finding?.evidence || {};
                const severity = typeof finding?.severity === "string" ? finding.severity.toUpperCase() : "LOW";
                return (
                  <li key={finding?.findingId || `finding-${index}`} className="device-findingCard">
                    <div className="device-findingHeader">
                      <h3 className="device-findingTitle">{finding?.title || `Finding ${index + 1}`}</h3>
                      <span className={`device-severityBadge device-severityBadge--${severity.toLowerCase()}`}>
                        {severity}
                      </span>
                    </div>
                    {cveIds.length > 0 && (
                      <p className="device-findingMeta"><strong>CVE(s):</strong> {cveIds.join(", ")}</p>
                    )}
                    {finding?.description && (
                      <p className="device-findingMeta"><strong>Description:</strong> {finding.description}</p>
                    )}
                    {finding?.impact && (
                      <p className="device-findingMeta"><strong>Impact:</strong> {finding.impact}</p>
                    )}
                    {finding?.recommendation && (
                      <p className="device-findingMeta"><strong>Recommendation:</strong> {finding.recommendation}</p>
                    )}
                    <p className="device-findingMeta">
                      <strong>Evidence:</strong>{" "}
                      {`${evidence?.service || "unknown"}:${evidence?.port ?? "?"}/${evidence?.protocol || "?"}`}
                      {evidence?.state ? ` (${evidence.state})` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </article>
    </section>
  );
}
