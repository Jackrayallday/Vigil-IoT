/*
file: src/LoginModal.jsx
author: Jack Ray (edited by Kevin Volkov)
===================================================
Component for user login modal dialog. Very basic for now.
*/
import React, { useState } from "react"; //import React from "react"; KV edit
import axios from "axios"; //KV add
import "./styles/modal.css";
import "./styles/login.css";
import logoImage from "./assets/logo.png";

export default function LoginModal({ onClose }) {
  const [username, setUsername] = useState(""); //KV add
  const [password, setPassword] = useState(""); //KV add
  const [error, setError] = useState(""); //KV add

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
        alert("Login successful!");
        onClose(); // Close modal or redirect to dashboard
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
          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password" 
              name="password" 
              type="password" 
              autoComplete="current-password"
              value={password} //KV add
              onChange={(e) => setPassword(e.target.value)} //KV add
              required //KV add
            />
          </div>
          {error && <div className="login-error">{error}</div> /* KV add */}
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
