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
4. **Open your connection, select "vigil_iot" in schemas sidebar, and run the following query:**
   ```bash
  INSERT INTO users (username, password_hash)
  VALUES ('example_user', 'example_password');
   ```
   (You can replace 'example_user' and 'example_password' with any credentials you want)
   This will manually insert a user account with which you can test the login functionallity.
5. **Install dependencies on both frontend and backend.**  
   a. `npm install` (npm may warn about peer dependencies; that's expected. If this doesn't work, confirm Node is installed with `node --version`.)
   b. switch to the backend directory and do the same on there.
   ```bash
   cd backend
   npm install
   ```
6. **Run the backend server app.**
   ```bash
   node server.js
   ```
7. **Run the frontend Electron app.**
   ```bash
   cd ..
   npm run dev:electron
   ```
   - For browser-only development, use:
     ```bash
     npm run dev
     ```
   - To stop use 'control c' - > 'Y' -> 'Enter Key'

## Testing

Unit tests use [Vitest](https://vitest.dev/). Run `npm run test` from the project root to execute the suite once, or `npx vitest --watch` while iterating on components and helpers.

## Notes

- Please add your name at the top of any file you edit where a contributor list is expected.
- The "Previous scans" button appears only after you create your first scan.
- All scan data is stored locally.
- Many files in this repo come from Electron/React boilerplate, so you don't need to worry about cleaning them up right now.
- I used Vite to generate the format of this file structure
