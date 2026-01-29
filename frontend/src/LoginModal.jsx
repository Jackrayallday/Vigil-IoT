/*
file: src/LoginModal.jsx
programmer: Jack Ray (edited by Kevin Volkov to add functionallity)
===================================================
Component for user login modal dialog. 
TODO: Hook into real authentication system.
Includes placeholder flows for register + forgot password.
*/
import React, { useRef, useState } from "react"; //import React from "react"; KV edit
import axios from "axios"; //KV add
import "./styles/modal.css";
import "./styles/login.css";
import logoImage from "./assets/logo.png";
import RegisterForm from "./RegisterForm";
import ForgotPasswordForm from "./ForgotPasswordForm";
import PasswordField from "./PasswordField";

const VIEW_LOGIN = "login";
const VIEW_REGISTER = "register";
const VIEW_FORGOT = "forgot";

export default function LoginModal({ onClose, onLoginSuccess }) {
  const backdropPointerDownRef = useRef(false); // Track if pointer press started on the backdrop.
  const [activeView, setActiveView] = useState(VIEW_LOGIN);
  const [email, setEmail] = useState(""); //KV add
  const [password, setPassword] = useState(""); //KV add
  const [error, setError] = useState(""); //KV add
  const [infoMessage, setInfoMessage] = useState("");

  function resetLoginState() {
    setEmail("");
    setPassword("");
    setError("");
    setInfoMessage("");
  }

  function handleShowRegister() {
    setActiveView(VIEW_REGISTER);
    setError("");
    setInfoMessage("");
  }

  function handleBackToLogin() {
    setActiveView(VIEW_LOGIN);
    resetLoginState();
  }

  function handleRegisterPlaceholder() {
    resetLoginState();
    setActiveView(VIEW_LOGIN);
    setInfoMessage("Registration coming soon. Please check back later!");
  }

  function handleShowForgotPassword() {
    setActiveView(VIEW_FORGOT);
    setError("");
    setInfoMessage("");
  }

  function handleForgotPlaceholder() {
    resetLoginState();
    setActiveView(VIEW_LOGIN);
    setInfoMessage("Check your email for the reset link once it is available.");
  }

  async function handleSubmit(e) { //function handleSubmit(e) { KV edit
    e.preventDefault();
    // Stub for now; could hook into auth later
    try{ // Send request to /login on server
      const response = await axios.post(
        "http://localhost:3000/login",
        {email, password},
        {headers: {"Content-Type": "application/json"}}
      );
      
      const userInfo = response.data.user;//if here, status is 2xx -> login successful
      
      resetLoginState(); 
      
      if(typeof onLoginSuccess === "function")
        onLoginSuccess(userInfo);
      else if(typeof onClose === "function") 
        onClose(); 
      
      return;
    }
    catch(err){//if here, error occured
      console.error("Login error!: ", err); 

      if(err.response){//get the error daTa
        const {status, data} = err.response;
        
         
        if(status === 400){//handle 400-level errors (email not found, wrong password)
          setError(data.message || "Invalid Input: Wrong Email or password!");
          return;
        }
        
        if(status === 500){//handle 500-level errors 
          setError(data.message || "Server error in login!");
          return;
        }
      } 
      
      setError("Unable to connect to server!");//network error or no response from server
    }
  }

  function handleBackdropPointerDown(event) {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  }

  function handleBackdropPointerUp(event) {
    if (backdropPointerDownRef.current && event.target === event.currentTarget) {
      onClose();
    }
    backdropPointerDownRef.current = false;
  }

  function resetBackdropPointerFlag() {
    backdropPointerDownRef.current = false;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-backdrop"
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
      onPointerLeave={resetBackdropPointerFlag}
      onPointerCancel={resetBackdropPointerFlag}
    >
      <div className="modal-sheet login-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="login-header">
          <img className="login-logo" src={logoImage} alt="Dashboard logo" />
          <button type="button" className="modal-closeBtn" aria-label="Close" onClick={onClose}>
            X
          </button>
        </header>
        {activeView === VIEW_REGISTER ? (
          <RegisterForm
            onBack={handleBackToLogin}
            onRegister={handleRegisterPlaceholder}
          />
        ) : activeView === VIEW_FORGOT ? (
          <ForgotPasswordForm
            onBack={handleBackToLogin}
            onRequestReset={handleForgotPlaceholder}
          />
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input 
                id="login-email"
                name="email"
                type="email"
                autoComplete="email" 
                value={email} //Kv add
                onChange={(e) => setEmail(e.target.value)} //KV add
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
              <button type="button" className="login-forgot" onClick={handleShowForgotPassword}>
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
