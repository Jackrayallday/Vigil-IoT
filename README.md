# Vigil IoT

Vite + React UI for exploring discovered IoT devices, their services, and associated risks.

## Getting Started

1. **Clone the repository.**
   ```bash
   git clone --branch main --single-branch https://github.com/Jackrayallday/Vigil-IoT.git
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
3. **In MySQL Workbench, test the connection to the database by doing the following:**
   - Go to Database → Manage Connections
   - Select the connection or click New Connection
   - Enter:
         Hostname: localhost
         Port: 3306 (default)
        Username: the password you set when installing MySQL
         Password: click “Store in Vault” and enter it
   Then click Test Connection — it should say “Connection successful.”
4. **Install backend dependencies and run the server program.**
   ```bash
   cd frontend
   npm install
   node server.js
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
