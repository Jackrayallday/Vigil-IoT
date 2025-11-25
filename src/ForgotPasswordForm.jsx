/*
file: src/ForgotPasswordForm.jsx
programmer: Jack Ray (Modified by Kevin to call corresponding backend route)
===================================================
Password reset request form shown inside the auth modal.
*/
import React, { useState } from "react";

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

    //KV add---------------------------------------------------------------------------------------
    try
    {
        const response = await fetch("http://localhost:3001/send-email",//call backend route with following info:
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: trimmedEmail }),
        });

        const data = await response.json();//get the response from server

        if(response.ok && data.success) 
            setStatusMessage("Reset email sent successfully!");//email sent
        else
            setErrorMessage(data.message || "Something went wrong. Please try again later.");//fail
    }
    catch (err)
    {//if here, server error
      console.error(err);//log the error
      setErrorMessage("Server error! Please try again later.");//inform user
    }
    //---------------------------------------------------------------------------------------------

    /*if (typeof onRequestReset === "function") {
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

    setStatusMessage("If that email is on file, we'll send a reset link shortly.");*/
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
