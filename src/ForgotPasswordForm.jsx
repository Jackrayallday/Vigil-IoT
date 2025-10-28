/*
file: src/ForgotPasswordForm.jsx
programmer: Jack Ray
===================================================
Password reset request form shown inside the auth modal.
*/
import React, { useState } from "react";

export default function ForgotPasswordForm({ onBack, onRequestReset }) {
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter the email associated with your account.");
      return;
    }

    if (typeof onRequestReset === "function") {
      try {
        const maybe = onRequestReset({ email: trimmedEmail });
        if (maybe && typeof maybe.then === "function") {
          maybe.catch(() => {
            setErrorMessage("Something went wrong. Please try again later.");
          });
        }
      } catch (err) {
        console.error(err);
        setErrorMessage("Something went wrong. Please try again later.");
        return;
      }
    }

    setStatusMessage("If that email is on file, we'll send a reset link shortly.");
    setEmail("");
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-field">
        <label htmlFor="forgot-email">Email address</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrorMessage("");
            setStatusMessage("");
          }}
          required
        />
      </div>
      {errorMessage && <div className="login-error">{errorMessage}</div>}
      {statusMessage && <div className="login-info">{statusMessage}</div>}
      <div className="login-actions is-forgot">
        <button type="button" className="login-switch" onClick={onBack}>
          Back to login
        </button>
        <button type="submit" className="login-submit">
          Send reset link
        </button>
      </div>
    </form>
  );
}
