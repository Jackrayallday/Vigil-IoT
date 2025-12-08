/*
file: src/main.jsx
programmer: Jack Ray
===================================================
The main entry point for the React application. This file renders the root App component into the HTML.
*/
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
