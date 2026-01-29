/*
file: src/RegisterForm.jsx
programmer: Jack Ray (modified by Kevin Volkov to add functionality)
===================================================
Standalone registration form shown inside the auth modal.
*/
import React, { useState } from "react";
import axios from "axios";//KV add
import PasswordField from "./PasswordField"; // Shared press-to-reveal password input

export default function RegisterForm({ onBack }) {//KV edit: removed "onRegister"
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

  async function handleSubmit(e) {//KV edit: added "async"
    e.preventDefault();

    if(password !== confirmPassword) {
      setFormError("Invalid Input!: Passwords do not match!");
      setFormSuccess("");//KV add
      return;
    }
    //KV: later maybe add password strength validation

    try{
      const response = await axios.post(//send request to /register on server
        "http://localhost:3000/register",
        {email, password},
        {headers: {"Content-Type": "application/json"}}
      );

      const result = response.data;//extract data from response

      if(result.success){//if here, registration was sucessful
        setFormSuccess("Registration successful!");
        setFormError("");
        resetForm();
      }
      else{//unlikely because 400/500 won't land here, but keep for safety
        setFormError(result.message || "Registration failed!");
        setFormSuccess("");
      }
    }
    catch(err){
      console.error("Registration error!: ", err); 
      
      if(err.response){//Axios attaches backend response here for 400/500 errors
        const {status, data} = err.response;
        
        if(status === 400){//handle 400-level errors (e.g., email already taken)  
          setFormError(data.message || "Invalid input!");
          setFormSuccess(""); 
          return;
        } 
          
        if(status === 500){//handle 500-level errors 
          setFormError(data.message || "Server error in registration!");
          setFormSuccess(""); 
          return; 
        }
      } 
      
      setFormError("Unable to connect to server!");//if no response (network error, server down)
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