# Vigil IoT

Vite + React UI for exploring discovered IoT devices, their services, and associated risks.

## Getting Started

1. **Clone the repository.**
   ```bash
   git clone --branch BackendContainerized --single-branch https://github.com/Jackrayallday/Vigil-IoT.git
   cd vigil-iot
   ```
2. **Install Docker Desktop.**
- Install Docker Desktop for Windows here: https://docs.docker.com/desktop/setup/install/windows-install/
- Install Docker Desktop for Mac here: https://docs.docker.com/desktop/setup/install/mac-install/
3. **Run The Docker Desktop app (It needs to be running at the same time as the containerized backend for it to work).**
4. **Run the containerized server program.**
   ```bash
   cd backend
   docker compose up --build
   ```
   - To remove containers, networks, and volumes created by Compose, run the following:
     ```bash
     docker compose down
     ```
5. **In another terminal instance, install fronted dependencies and run the client program.**
   ```bash
   cd backend
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
