/*
file: electron/main.js
programmer: Jack Ray
--------------------------------------------------------
This file can be ignored unless you are interested in the Electron main process code or changing how the Electron app starts up.

This file is used to as the main process entry point for an Electron application. We set up the main application window, 
handle application lifecycle events such as closing the window or starting the project, and load the correct content based 
on how we start our project (npm run x:electron).
*/

import { app, BrowserWindow } from 'electron'; // Main Electron modules import
import { fileURLToPath } from 'node:url'; // Utility to convert file URL to path
import path from 'node:path';


// Determine directory name and environment ESM style
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.argv.includes('--dev');
const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
const distPath = path.join(__dirname, '..', 'dist');

// Function to create the main application window
async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
// Show window when ready and open dev tools if in development mode
  win.on('ready-to-show', () => {
    win.show();
    if (isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });
// Load content based on environment. For now we are just going to stay in dev mode. The build mode will be used later for packaging.
  if (isDev) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(distPath, 'index.html'));
  }
}
// Application lifecycle event handlers for quitting and activating
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});
