/**
 * file: src/constants.js
 * author: Jack Ray
 * ===================================================
 * 
  These constants group the scanning options so the UI and settings pages can stay in sync. Reduces code duplication.
 */

export const MODULE_KEYS = ["discover", "serviceDetection", "legacyProtocols", "weakCreds", "safeMode"];

export const MODULE_LABELS = {
  discover: "Discover hosts",
  serviceDetection: "Service detection",
  legacyProtocols: "Legacy protocols",
  weakCreds: "Weak credentials",
  safeMode: "Safe mode",
};

export const MODULE_FIELDS = MODULE_KEYS.map((key) => ({
  key,
  label: MODULE_LABELS[key] || key,
}));

// Default switch positions used both when the app first loads and in the settings modal.
export const DEFAULT_SCAN_OPTIONS = {
  discover: true,
  serviceDetection: true,
  legacyProtocols: false,
  weakCreds: false,
  safeMode: true,
};

