/*
file: src/LoginModal.jsx
programmer: Jack Ray (edited by Kevin Volkov)
===================================================
Component for user login modal dialog. 
TODO: Hook into real authentication system.
TODO: Implement forgot password button.
*/
import React, { useState } from "react"; //import React from "react"; KV edit
import axios from "axios"; //KV add
import "./styles/modal.css";
import "./styles/login.css";
import logoImage from "./assets/logo.png";
import RegisterForm from "./RegisterForm";
import PasswordField from "./PasswordField";

export default function LoginModal({ onClose, onLoginSuccess }) {
  const [showRegister, setShowRegister] = useState(false);
  const [username, setUsername] = useState(""); //KV add
  const [password, setPassword] = useState(""); //KV add
  const [error, setError] = useState(""); //KV add
  const [infoMessage, setInfoMessage] = useState("");

  function resetLoginState() {
    setUsername("");
    setPassword("");
    setError("");
    setInfoMessage("");
  }

  function handleShowRegister() {
    setShowRegister(true);
    setError("");
    setInfoMessage("");
  }

  function handleBackToLogin() {
    setShowRegister(false);
    resetLoginState();
  }

  function handleRegisterPlaceholder() {
    resetLoginState();
    setShowRegister(false);
    setInfoMessage("Registration coming soon. Please check back later!");
  }

  async function handleSubmit(e) { //function handleSubmit(e) { KV edit
    e.preventDefault();
    // Stub for now; could hook into auth later
    //KV add --------------------------------------------------------
    try {
      const res = await axios.post("http://localhost:3001/login", {
        username,
        password,
      });

      if (res.data.success) {
        const userInfo = res?.data?.user ?? { username };
        resetLoginState();
        if (typeof onLoginSuccess === "function")
          onLoginSuccess(userInfo);
        else if (typeof onClose === "function")
          onClose();
        return;
      } else {
        setError("Invalid username or password.");
      }
    } catch (err) {
      console.error(err);
      setError("Server error. Please try again later.");
    }
    //---------------------------------------------------------------
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
        {showRegister ? (
          <RegisterForm
            onBack={handleBackToLogin}
            onRegister={handleRegisterPlaceholder}
          />
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <input 
                id="login-username"
                name="username"
                type="text"
                autoComplete="username" 
                value={username} //Kv add
                onChange={(e) => setUsername(e.target.value)} //KV add
                required //KV add
              />
            </div>
            <PasswordField
              id="login-password"
              label="Password"
              name="password"
              autoComplete="current-password"
              value={password} //KV add
              onChange={(e) => setPassword(e.target.value)} //KV add
              required //KV add
            />
            {error && <div className="login-error">{error}</div> /* KV add */}
            {infoMessage && <div className="login-info">{infoMessage}</div>}
            <div className="login-actions">
              <button type="button" className="login-forgot">
                Forgot password?
              </button>
              <button type="submit" className="login-submit">Log in</button>
            </div>
            <button
              type="button"
              className="login-create"
              onClick={handleShowRegister}
            >
              Create new account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
