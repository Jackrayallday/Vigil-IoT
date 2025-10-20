/*
file: electron/preload.js
author: Jack Ray
===========================================
This file is loaded before other scripts in the renderer process.
It has access to Node.js and Electron APIs, but runs in an isolated context.
This is pretty much going to be a placeholder for now, as we don't need
to expose any specific APIs to the renderer process at this time.
We would use this for our scans, saving reports, connecting to devices, etc.
*/
import { contextBridge } from 'electron';

// Expose a safe, minimal API surface to the renderer if needed later.
contextBridge.exposeInMainWorld('electronAPI', {});
