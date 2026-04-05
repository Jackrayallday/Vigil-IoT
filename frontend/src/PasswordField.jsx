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
  validationChecks = [],
  validationLabel = "Password rule status",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const tooltipId = `${inputId}-validation-tooltip`;
  const [isRevealing, setIsRevealing] = useState(false);
  const hasValidationChecks = Array.isArray(validationChecks) && validationChecks.length > 0;
  const allValidationPassed =
    hasValidationChecks && validationChecks.every((rule) => Boolean(rule?.passed));

  function toggleReveal() {
    setIsRevealing((prev) => !prev);
  }

  return (
    <div className="login-field password-field">
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className={`password-input-wrapper${hasValidationChecks ? " has-validation" : ""}`}>
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
        {hasValidationChecks && (
          <button
            type="button"
            className={`password-validation-toggle ${allValidationPassed ? "is-valid" : "is-invalid"}`}
            aria-label={validationLabel}
            aria-describedby={tooltipId}
          >
            ?
            <span id={tooltipId} role="tooltip" className="password-validation-tooltip">
              <ul>
                {validationChecks.map((rule, index) => {
                  const isPassed = Boolean(rule?.passed);
                  const labelText = rule?.label || "Requirement";
                  return (
                    <li
                      key={`${labelText}-${index}`}
                      className={isPassed ? "is-passed" : "is-failed"}
                    >
                      {isPassed ? "Done:" : "Missing:"} {labelText}
                    </li>
                  );
                })}
              </ul>
            </span>
          </button>
        )}
        <button
          type="button"
          className={`password-toggle${isRevealing ? " is-revealing" : ""}`}
          aria-label={isRevealing ? "Hide password" : "Show password"}
          aria-pressed={isRevealing}
          onClick={toggleReveal}
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
