/*
file: electron/main.js
programmer: Jack Ray
--------------------------------------------------------
This file can be ignored unless you are interested in the Electron main process code or changing how the Electron app starts up.

This file is used to as the main process entry point for an Electron application. We set up the main application window, 
handle application lifecycle events such as closing the window or starting the project, and load the correct content based 
on how we start our project (npm run x:electron).
*/

import { app, BrowserWindow, screen } from 'electron'; // Main Electron modules import
import { fileURLToPath } from 'node:url'; // Utility to convert file URL to path
import path from 'node:path';
import { spawn } from 'node:child_process'; // ADDED: to start FastAPI

// Determine directory name and environment ESM style
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.argv.includes('--dev');
const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
const distPath = path.join(__dirname, '..', 'dist');

let fastAPIServer = null;

//Function to start FastAPI server (api_server.py)
function startFastAPIServer() {
  // Adjust this path if directory changes occur ************************************************
  // This assumes: project root / deviceDisovery / api_server.py
  // __dirname is frontend/electron, so we need to go up two levels to reach project root
  const apiPath = path.join(__dirname, '..', '..', 'deviceDisovery', 'api_server.py');

  fastAPIServer = spawn('python', [apiPath], {
    cwd: path.dirname(apiPath),
    shell: false,
  });

  // Logging for dev
  fastAPIServer.stdout.on('data', (data) => {
    console.log('[FASTAPI]', data.toString());
  });

  fastAPIServer.stderr.on('data', (data) => {
    console.error('[FASTAPI ERROR]', data.toString());
  });

  fastAPIServer.on('close', (code) => {
    console.log(`[FASTAPI exited with code ${code}]`);
    fastAPIServer = null;
  });
}

// Function to create the main application window
async function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: workArea?.x ?? undefined,
    y: workArea?.y ?? undefined,
    width: workArea?.width ?? 1280,
    height: workArea?.height ?? 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Show window when ready and open dev tools if in development mode
  win.on('ready-to-show', () => {
    win.maximize(); // start maximized so the window fills the screen
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
  // Stop api when program quits.
  if (fastAPIServer) {
    fastAPIServer.kill('SIGINT');
    fastAPIServer = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(async () => {
  startFastAPIServer();

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});
