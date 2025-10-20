# Vigil IoT

Vite + React UI for exploring discovered IoT devices, their services, and associated risks.

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/Jackrayallday/Vigil-IoT.git
   cd vigil-iot
   ```
2. **Open the project in your editor.**
3. **Install dependencies**  
   `npm install` (npm may warn about peer dependencies; that's expected. If this doesn't work, confirm Node is installed with `node --version`.)
4. **Run the Electron app**
   ```bash
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
