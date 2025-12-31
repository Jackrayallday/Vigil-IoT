/*
file: src/RegisterForm.jsx
programmer: Jack Ray (modified by Kevin Volkov to add functionality)
===================================================
Standalone registration form shown inside the auth modal.
*/
import React, { useState } from "react";
import axios from "axios";//KV add
import PasswordField from "./PasswordField"; // Shared press-to-reveal password input

export default function RegisterForm({ onBack }) {//KV edit //export default function RegisterForm({ onBack, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");//KV add

  function resetForm() {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e) {//KV edit //function handleSubmit(e) {
    e.preventDefault();

    if(password !== confirmPassword) {
      setFormError("Passwords do not match.");
      setFormSuccess("");//KV add
      return;
    }

    /*setFormError("");
    if(typeof onRegister === "function")
      onRegister({email, password});

    resetForm();*///KV remove

    //KV add ------------------------------------------------------------------
   try {
    const response = await axios.post(
        "http://localhost:3000/register",
        { email, password },
        {
            headers: { "Content-Type": "application/json" }
        }
    );

    const result = response.data;

    if (result.success) {
        setFormSuccess("Registration successful!");
        setFormError("");
        resetForm();
    } else {
        setFormError(result.message || "Registration failed.");
        setFormSuccess("");
    }
}
catch (err) {
    console.error("Registration error:", err);
    setFormError("Server error. Please try again later.");
    setFormSuccess("");
}
    //-------------------------------------------------------------------------
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-field">
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFormError("");
            setFormSuccess("");//KV add
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
          setFormSuccess("");//Kv add
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
          setFormSuccess("");//KV add
        }}
        required
      />
      {formError && <div className="login-error">{formError}</div>}
      {formSuccess && <div className="login-success">{formSuccess}</div>/*KV add*/}
      <div className="login-actions is-register">
        <button type="button" className="login-switch" onClick={onBack}>
          Already have an account?
        </button>
        <button type="submit" className="login-submit">Register</button>
      </div>
    </form>
  );
}
