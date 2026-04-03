/*
file: src/apiErrors.js
description: Helpers for surfacing backend error messages in the UI.
*/

export function getApiErrorMessage(error, fallback = "Request failed.") {
  // No error object: use the provided fallback message.
  if (!error) return fallback;
  // If callers passed a string directly, use it as-is.
  if (typeof error === "string") return error;

  // Axios-style errors include response + response.data.
  const response = error.response;
  const data = response?.data;

  // If the server sent a plain string, prefer that.
  if (typeof data === "string" && data.trim()) {
    return data;
  }

  // If the server sent JSON, pull common message fields.
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  }

  // Fall back to the error object's own message (Axios/network).
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  // Last resort if nothing useful was found.
  return fallback;
}

export function getApiResponseMessage(data, fallback = "Request failed.") {
  // Accept plain strings or JSON objects from API responses.
  if (typeof data === "string" && data.trim()) {
    return data;
  }
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  }
  return fallback;
}

export function getApiErrorStatus(error) {
  // Axios stores the HTTP status on error.response.status.
  const status = error?.response?.status;
  return typeof status === "number" ? status : null;
}
