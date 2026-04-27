const RESET_TOKEN = document.body?.dataset?.resetToken || "";

const PASSWORD_COMPLEXITY_RULE =
  "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.";

function getPasswordComplexityError(password) {
  if (typeof password !== "string" || password.length < 8) return PASSWORD_COMPLEXITY_RULE;
  if (!/[a-z]/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  if (!/[A-Z]/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  if (!/\d/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_COMPLEXITY_RULE;
  return "";
}

function buildDriftDots() {
  const layer = document.getElementById("drift-layer");
  if (!layer) return;
  const dotCount = 54;
  for (let index = 0; index < dotCount; index += 1) {
    const dot = document.createElement("span");
    dot.className = "drift-dot";
    dot.style.setProperty("--dot-size", `${(0.12 + Math.random() * 0.28).toFixed(3)}rem`);
    dot.style.setProperty("--dot-opacity", (0.25 + Math.random() * 0.55).toFixed(3));
    dot.style.setProperty("--dot-duration", `${(18 + Math.random() * 32).toFixed(3)}s`);
    dot.style.setProperty("--dot-delay", `${(Math.random() * 6).toFixed(3)}s`);
    dot.style.setProperty("--dot-x", `${(Math.random() * 100).toFixed(3)}%`);
    dot.style.setProperty("--dot-y", `${(Math.random() * 100).toFixed(3)}%`);
    dot.style.setProperty("--dot-lightness", `${(52 + Math.random() * 24).toFixed(3)}%`);
    dot.style.setProperty("--dot-blur", `${(Math.random() * 0.6).toFixed(3)}px`);
    layer.appendChild(dot);
  }
}

const formEl = document.getElementById("reset-form");
const buttonEl = document.getElementById("reset-btn");
const newPasswordEl = document.getElementById("new-password");
const confirmPasswordEl = document.getElementById("confirm-password");
const messageEl = document.getElementById("message");
const passwordValidationToggleEl = document.getElementById("password-validation-toggle");
const passwordValidationListEl = document.getElementById("new-password-validation-list");
const confirmPasswordValidationToggleEl = document.getElementById("confirm-password-validation-toggle");
const confirmPasswordValidationListEl = document.getElementById("confirm-password-validation-list");

function getPasswordValidationChecks(password) {
  return [
    {label: "At least 8 characters", passed: typeof password === "string" && password.length >= 8},
    {label: "At least one uppercase letter", passed: /[A-Z]/.test(password)},
    {label: "At least one lowercase letter", passed: /[a-z]/.test(password)},
    {label: "At least one number", passed: /\d/.test(password)},
    {label: "At least one symbol", passed: /[^A-Za-z0-9]/.test(password)}
  ];
}

function renderPasswordValidationChecks(password) {
  const checks = getPasswordValidationChecks(password);
  const allPassed = checks.every((rule) => Boolean(rule.passed));

  passwordValidationToggleEl.classList.toggle("is-valid", allPassed);
  passwordValidationToggleEl.classList.toggle("is-invalid", !allPassed);

  passwordValidationListEl.textContent = "";
  checks.forEach((rule) => {
    const li = document.createElement("li");
    li.className = rule.passed ? "is-passed" : "is-failed";
    li.textContent = `${rule.passed ? "Done:" : "Missing:"} ${rule.label}`;
    passwordValidationListEl.appendChild(li);
  });
}

function renderConfirmPasswordValidation(newPassword, confirmPassword) {
  const passed =
    typeof confirmPassword === "string" &&
    confirmPassword.length > 0 &&
    confirmPassword === newPassword;

  confirmPasswordValidationToggleEl.classList.toggle("is-valid", passed);
  confirmPasswordValidationToggleEl.classList.toggle("is-invalid", !passed);

  confirmPasswordValidationListEl.textContent = "";
  const li = document.createElement("li");
  li.className = passed ? "is-passed" : "is-failed";
  li.textContent = `${passed ? "Done:" : "Missing:"} Matches new password`;
  confirmPasswordValidationListEl.appendChild(li);
}

function showMessage(message, type) {
  messageEl.textContent = message;
  messageEl.className = `reset-message ${type}`;
}

buildDriftDots();

document.querySelectorAll(".password-toggle").forEach((toggleButton) => {
  toggleButton.addEventListener("click", () => {
    const targetId = toggleButton.getAttribute("data-target");
    const inputEl = document.getElementById(targetId);
    if (!inputEl) return;

    const isRevealing = inputEl.type === "text";
    inputEl.type = isRevealing ? "password" : "text";
    toggleButton.classList.toggle("is-revealing", !isRevealing);
    toggleButton.setAttribute("aria-pressed", isRevealing ? "false" : "true");
    toggleButton.setAttribute("aria-label", isRevealing ? "Show password" : "Hide password");
  });
});

newPasswordEl.addEventListener("input", () => {
  renderPasswordValidationChecks(newPasswordEl.value);
  renderConfirmPasswordValidation(newPasswordEl.value, confirmPasswordEl.value);
});

confirmPasswordEl.addEventListener("input", () => {
  renderConfirmPasswordValidation(newPasswordEl.value, confirmPasswordEl.value);
});

renderPasswordValidationChecks("");
renderConfirmPasswordValidation("", "");

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("", "");

  const newPassword = newPasswordEl.value;
  const confirmPassword = confirmPasswordEl.value;

  const complexityError = getPasswordComplexityError(newPassword);
  if (complexityError) {
    showMessage(complexityError, "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  buttonEl.disabled = true;
  buttonEl.textContent = "Updating...";

  try {
    const response = await fetch("/reset-password", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        token: RESET_TOKEN,
        newPassword
      })
    });

    const text = await response.text();
    if (response.ok) {
      showMessage(text, "success");
      formEl.reset();
      renderPasswordValidationChecks("");
      renderConfirmPasswordValidation("", "");
    } else {
      showMessage(text || "Password reset failed.", "error");
    }
  } catch (err) {
    showMessage("Unable to connect to server.", "error");
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = "Reset Password";
  }
});
