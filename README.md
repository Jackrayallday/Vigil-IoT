# Vigil IoT

Vite + React UI for exploring discovered IoT devices, their services, and associated risks.

## Getting Started

1. **Clone the repository.**
   ```bash
   git clone --branch Backend-Initialized --single-branch https://github.com/Jackrayallday/Vigil-IoT.git
   cd vigil-iot
   ```
2. **Replace the MySQL credentials with your own in the following section of server.js:**
   ```bash
   const MYSQL_CONFIG = {
       host: 'localhost',
       user: 'root',
       password: 'passowrd' 
   };
   ```
3. **Open the project in your editor.**
4. **Install dependencies on both frontend and backend.**  
   a. `npm install` (npm may warn about peer dependencies; that's expected. If this doesn't work, confirm Node is installed with `node --version`.)
   b. switch to the backend directory and do the same on there.
   ```bash
   cd backend
   npm install
   ```
5. **Run the backend server app.**
   ```bash
   node server.js
   ```
6. **Run the frontend Electron app.**
   ```bash
   cd ..
   npm run dev:electron
   ```
   - For browser-only development, use:
     ```bash
     npm run dev
     ```
   - To stop use 'control c' - > 'Y' -> 'Enter Key'

## Notes

- Please add your name at the top of any file you edit where a contributor list is expected.
- The "Previous scans" button appears only after you create your first scan.
- All scan data is stored locally.
- Many files in this repo come from Electron/React boilerplate, so you don't need to worry about cleaning them up right now.
- I used Vite to generate the format of this file structure