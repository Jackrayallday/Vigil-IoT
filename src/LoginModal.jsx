/*
file: src/LoginModal.jsx
author: Jack Ray
===================================================
Component for user login modal dialog. Very basic for now.
*/

import React from "react";
import "./styles/modal.css";
import "./styles/login.css";
import logoImage from "./assets/logo.png";

export default function LoginModal({ onClose }) {
  function handleSubmit(e) {
    e.preventDefault();
    // Stub for now; could hook into auth later
  }

  return (
    <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet login-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="login-header">
          <img className="login-logo" src={logoImage} alt="Dashboard logo" />
          <button type="button" className="modal-closeBtn" aria-label="Close" onClick={onClose}>
            X
          </button>
        </header>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <input id="login-username" name="username" type="text" autoComplete="username" />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" />
          </div>
          <div className="login-actions">
            <button type="button" className="login-forgot">
              Forgot password?
            </button>
            <button type="submit" className="login-submit">Log in</button>
          </div>
        </form>
      </div>
    </div>
  );
}
