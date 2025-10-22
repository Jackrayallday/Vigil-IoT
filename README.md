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

Running Kevin's updated version with MySQL server (only login functionallity works so far)
1. Clone the repo from KevinBranch:
    git clone --branch KevinBranch --single-branch https://github.com/Jackrayallday/Vigil-IoT.git

2. cd cd vigil-iot

3. Install dependancies for both frontend and backend:
    npm install
    cd backend
    npm install

4. Install MySQL if you don't have it and create the database:
    CREATE DATABASE vigil_iot;
    USE vigil_iot;

    CREATE TABLE users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE scan_reports (
        report_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        vulnerabilities TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    INSERT INTO users (username, password_hash)
    VALUES ('test_user', 'hashed_password_123');

5. Edit MySQL credentials in backend/server.js to match your own:
   const db = mysql.createConnection({
       host: 'localhost',
       user: 'your_mysql_user',
       password: 'your_mysql_password',
       database: 'vigil_iot'
   });

6. Run backend:
       cd backend
       node server.js

7. Run frontend:
    npm run dev:electron

8. Test login with test user you created in step 4
