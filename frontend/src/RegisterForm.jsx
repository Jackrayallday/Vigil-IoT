/*
file: src/RegisterForm.jsx
programmer: Jack Ray (modified by Kevin Volkov to add functionality)
===================================================
Standalone registration form shown inside the auth modal.
*/
import React, { useState } from "react";
import axios from "axios";//KV add
import PasswordField from "./PasswordField"; // Shared press-to-reveal password input

const PASSWORD_COMPLEXITY_RULE =
  "Password must include uppercase, lowercase, a number, and a symbol.";

function getPasswordComplexityError(password) {
  if (typeof password !== "string") {
    return PASSWORD_COMPLEXITY_RULE;
  }
  if (!/[a-z]/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  if (!/[A-Z]/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  if (!/\d/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  return "";
}

function getPasswordValidationChecks(password) {
  const nextPassword = typeof password === "string" ? password : "";
  return [
    { label: "At least 1 uppercase letter", passed: /[A-Z]/.test(nextPassword) },
    { label: "At least 1 lowercase letter", passed: /[a-z]/.test(nextPassword) },
    { label: "At least 1 number", passed: /\d/.test(nextPassword) },
    { label: "At least 1 symbol", passed: /[^A-Za-z0-9]/.test(nextPassword) },
  ];
}

export default function RegisterForm({ onBack }) {//KV edit: removed "onRegister"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");//KV add
  const passwordValidationChecks = getPasswordValidationChecks(password);
  const confirmValidationChecks = [
    {
      label: "Matches password",
      passed: Boolean(confirmPassword) && confirmPassword === password,
    },
  ];

  function resetForm() {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if(password !== confirmPassword) {
      setFormError("Passwords don't match!");
      setFormSuccess("");//KV add
      return;
    }

    const complexityError = getPasswordComplexityError(password);
    if (complexityError) {
      setFormError(complexityError);
      setFormSuccess("");
      return;
    }

    try{
      await axios.post(//send request to /register on server
        "http://localhost:3000/register",
        {email, password},
        {headers: {"Content-Type": "application/json"}}
      );

      //if here, registration was sucessful (status 2XX)
      setFormSuccess("Registration successful!");
      setFormError("");
      resetForm();
    }
    catch (err){//if here, registration failed
      console.error("Registration error!: ", err);

      if(err.response)//Axios attaches backend response here for 400/500 errors
        setFormError(err.response.data?.message || "Registration failed!");//extract error message
      else//if here, no response at all (network error, server down, CORS, timeout)
        setFormError("Unable to connect to server!");
      
      setFormSuccess("");
    }
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
        validationChecks={passwordValidationChecks}
        validationLabel="Password requirements status"
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
        validationChecks={confirmValidationChecks}
        validationLabel="Confirm password match status"
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
