import React, { useId, useState } from "react";

/*
file: src/PasswordField.jsx
programmer: Jack Ray
===================================================
Reusable password field with press-to-reveal eyeball icon. This needs its own file since we use it in multiple places. 
This works with touchscreens, mouse, and keyboard for accessibility.
*/

export default function PasswordField({
  id,
  label,
  name,
  value,
  onChange,
  autoComplete,
  required = false,
  ...rest
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isRevealing, setIsRevealing] = useState(false);

  // Press-and-hold toggle keeps behaviour identical across input methods.
  function beginReveal(event) {
    event.preventDefault();
    setIsRevealing(true);
  }

  function endReveal() {
    setIsRevealing(false);
  }

  function handleKeyDown(event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setIsRevealing(true);
    }
  }

  function handleKeyUp(event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      endReveal();
    }
  }

  return (
    <div className="login-field password-field">
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="password-input-wrapper">
        <input
          id={inputId}
          name={name}
          type={isRevealing ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          required={required}
          {...rest}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={isRevealing ? "Hide password" : "Show password"}
          onMouseDown={beginReveal}
          onMouseUp={endReveal}
          onMouseLeave={endReveal}
          onTouchStart={beginReveal}
          onTouchEnd={endReveal}
          onTouchCancel={endReveal}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={endReveal}
        >
          {/* Eye glyph from Material Icons(not symbols) "visibility" (https://fonts.google.com/icons) */}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 5c-5.52 0-9.86 3.74-11 7 1.14 3.26 5.48 7 11 7s9.86-3.74 11-7c-1.14-3.26-5.48-7-11-7zm0 12c-4.22 0-7.68-2.9-8.86-5 1.18-2.1 4.64-5 8.86-5s7.68 2.9 8.86 5c-1.18 2.1-4.64 5-8.86 5zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
