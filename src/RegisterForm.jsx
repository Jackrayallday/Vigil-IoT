/*
file: src/RegisterForm.jsx
programmer: Jack Ray
===================================================
Standalone registration form shown inside the auth modal.
*/
import React, { useState } from "react";
import PasswordField from "./PasswordField"; // Shared press-to-reveal password input

export default function RegisterForm({ onBack, onRegister }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  function resetForm() {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
  }

  function handleSubmit(e) {
    e.preventDefault();

    if(password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setFormError("");
    if(typeof onRegister === "function")
      onRegister({username, password});

    resetForm();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-field">
        <label htmlFor="register-username">Username</label>
        <input
          id="register-username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setFormError("");
          }}
          required
        />
      </div>
      {/* Keep password inputs consistent with the login modal */}
      <PasswordField
        id="register-password"
        label="Password"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setFormError("");
        }}
        required
      />
      <PasswordField
        id="register-confirm"
        label="Confirm password"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value);
          setFormError("");
        }}
        required
      />
      {formError && <div className="login-error">{formError}</div>}
      <div className="login-actions is-register">
        <button type="button" className="login-switch" onClick={onBack}>
          Already have an account?
        </button>
        <button type="submit" className="login-submit">Register</button>
      </div>
    </form>
  );
}
