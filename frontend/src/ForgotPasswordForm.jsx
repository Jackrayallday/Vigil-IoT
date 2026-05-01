/*
file: src/ForgotPasswordForm.jsx
programmer: Jack Ray (Modified by Kevin to call corresponding backend route)
===================================================
Password reset request form shown inside the auth modal.
*/
import React, { useState } from "react";
//import { getApiErrorMessage, getApiResponseMessage } from "./apiErrors";//KV: no longer needed
import axios from "axios"; //KV add

const EMAIL_MAX_LENGTH = 254;
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[A-Za-z][^\s@]*$/;

export default function ForgotPasswordForm({ onBack/*, onRequestReset*/ }) {//KV edit
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {//KV edit: added "async"
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter the email associated with your account.");
      return;
    }
    if (!EMAIL_FORMAT_REGEX.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address (example@domain.com).");
      return;
    }

    try{
      await axios.post(//send request to /send-email on server
        "https://localhost:443/send-email",
        {email: trimmedEmail},
        {headers: {"Content-Type": "application/json"}}
      );

      //if here, email sucessfully sent
      setStatusMessage("Reset email successfully sent!");
    }
    catch(err){//if here, email sending failed
      console.error("Failed to send email!: ", err);

      if(err.response)//Axios attaches backend response here for 400/500 errors
        setErrorMessage(err.response.data?.message || "Registration failed!");//extract error message
      else//if here, no response at all (network error, server down, CORS, timeout)
        setErrorMessage("Unable to connect to server!");
    }
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
          pattern="^[^\s@]+@[^\s@]+\.[A-Za-z][^\s@]*$"
          title="Please enter an email like name@example.com."
          maxLength={EMAIL_MAX_LENGTH}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value.slice(0, EMAIL_MAX_LENGTH));
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
