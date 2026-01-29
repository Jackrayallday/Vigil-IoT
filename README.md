# Vigil IoT
Vite + React UI for exploring discovered IoT devices, their services, and associated risks.
## Getting Started
1. **Clone the repository.**
   ```bash
   git clone --branch KevinWinterWork --single-branch https://github.com/Jackrayallday/Vigil-IoT.git
   cd vigil-iot
   ```
2. **Install dependencies and run the server program.**
   ```bash
   cd backend
   npm install
   node server.js
   ```
3. **In another terminal instance, install networking dependencies needed for device discovery.**
   ```bash
   cd deviceDiscovery
   pip install scapy zeroconf psutil ifaddr requests netaddr fastapi uvicorn[standard]
   ```
4. **Install frontend dependencies and run the client program.**
   ```bash
   cd frontend
   npm install
   npm run dev:electron
   ```
   - For browser-only development, use:
     ```bash
     npm run dev
     ```
   - To stop use 'control c' - > 'Y' -> 'Enter Key

## Notes

- Please add your name at the top of any file you edit where a contributor list is expected.
- The "Previous scans" button appears only after you create your first scan.
- All scan data is stored locally.
- Many files in this repo come from Electron/React boilerplate, so you don't need to worry about cleaning them up right now.
- I used Vite to generate the format of this file structure
