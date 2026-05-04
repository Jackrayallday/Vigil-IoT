/*File: server.js
  Programmer: Kevin Volkov
  Description: This file contains all server-side code of Vigil IoT as a single Node.js and Express
               app. It defines the database schema, creates the MySQL database itself if it doesn't
               exist yet, defines the routes that the frontend can access via GET and POST
               requests, and starts the server on the localhost.*/
//import dependencies
const express = require("express");//minimal framework for building backend APIs
const mysql = require("mysql2/promise");//for connecting to MySQL database and using promises
const cors = require("cors");//to allow cross-origin requests
const session = require("express-session");//for user session management
const MySQLStore = require("express-mysql-session")(session);//to store sessions in the database
const bcrypt = require("bcrypt");//to hash passwords before storing them in the database
const {google} = require("googleapis");//for updated email-sending functionallity with OAuth
const crypto = require("crypto");//to generate the password reset token
const fs = require("fs");//to read and modify files
const path = require("path");//to define the path of a file
const https = require("https");//for HTTPS implementation
const { spawn } = require("child_process");//run python scanner
require("dotenv").config();//to read variables from the .env file

const app = express();//create the express object to represent the server app

app.use(express.json());//parse incoming JSON request bodies and store them in req.body

app.use(express.static(path.join(__dirname, "../docs")));//serve ..//docs files as static files

app.use(cors({//configure the server's CORS policy
    origin: true,//allow cross-origin requests from any origin
    credentials: true//allow credentials to be sent in these requests
}));

const oauth2Client = new google.auth.OAuth2(//define the OAuth client that will access Gmail's API
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({refresh_token: process.env.GOOGLE_REFRESH_TOKEN});//set refresh token

const gmail = google.gmail({version: "v1", auth: oauth2Client});//create the Gmail API client

const options = {//set the SSL key and certificate for HTTPS implementation
    key: process.env.SSL_KEY.replace(/\\n/g, '\n'),
    cert: fs.readFileSync("./localhost.crt")
};

(async () => {
    const bootstrap = await mysql.createConnection({//temporary MySQL connection used to init db
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try{
        await bootstrap.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);//create db
        await bootstrap.query(`USE ${process.env.DB_NAME}`);//all future queries should apply it

        //create the users table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS users (
            user_id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(254) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            resetToken VARCHAR(255),
            resetTokenExpiry BIGINT
        )`);

        //create the scan_reports table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS scan_reports (
            scan_id INT AUTO_INCREMENT PRIMARY KEY,
            scan_name VARCHAR(100) NOT NULL,
            scanned_at DATETIME NOT NULL,
            status ENUM('PENDING','COMPLETE','FAILED') NOT NULL DEFAULT 'PENDING',
            owner_id INT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
        );`);

        //create the devices table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS devices (
            device_id INT AUTO_INCREMENT PRIMARY KEY,
            scan_id INT NOT NULL,
            ip VARCHAR(45) NOT NULL,
            hostname VARCHAR(100),
            vendor VARCHAR(100),
            type VARCHAR(100),
            risk_level ENUM('LOW','MEDIUM','HIGH','CRITICAL'),
            finding_count INT DEFAULT 0,
            status ENUM('PENDING','COMPLETE','FAILED') DEFAULT 'PENDING',
            FOREIGN KEY (scan_id) REFERENCES scan_reports(scan_id) ON DELETE CASCADE
        );`);

        //create the findings (vulnerabilities) table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS findings (
            finding_id INT AUTO_INCREMENT PRIMARY KEY,
            device_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
            description TEXT,
            impact TEXT,
            recommendation TEXT,
            source ENUM('service-map','nvd','manual'),
            protocol VARCHAR(50),
            port INT,
            service VARCHAR(100),
            state VARCHAR(50),
            cve_ids TEXT,  -- comma-separated list of CVEs
            FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
        );`);

        //create the dynamic anomaly scan session table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS dynamic_scan_sessions (
            dynamic_scan_id VARCHAR(100) PRIMARY KEY,
            device_id VARCHAR(100),
            ip VARCHAR(45),
            hostname VARCHAR(100),
            vendor VARCHAR(100),
            type VARCHAR(100),
            risk_level ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'LOW',
            finding_count INT DEFAULT 0,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME NULL
        );`);

        //create thedynamic anomaly findings table if it doesn't exist yet
        await bootstrap.query(`
            CREATE TABLE IF NOT EXISTS dynamic_scan_findings (
                finding_id VARCHAR(200) PRIMARY KEY,
                dynamic_scan_id VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
                description TEXT,
                impact TEXT,
                recommendation TEXT,
                source ENUM('ml') DEFAULT 'ml',

                -- evidence fields
                evidence_timestamp BIGINT,
                source_ip VARCHAR(45),
                destination_ip VARCHAR(45),
                packet_size INT,
                frequency INT,
                score FLOAT,

                FOREIGN KEY (dynamic_scan_id)
                    REFERENCES dynamic_scan_sessions(dynamic_scan_id)
                    ON DELETE CASCADE
            );
        `);

    }
    catch(err){//if here, error in MySQL database initialization
        console.error("Database initialization failed: ", err);//log the error to the console
    }
    finally{
        try{
            await bootstrap.end();//close the temporary connection
        }
        catch(endErr){//if here, error closing connection
            console.error("Failed to close bootstrap connection: ", endErr);//log the error
        }
    }
})();

const pool = mysql.createPool({//create the MySQL connection pool to be used for subsequent queries
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const sessionStore = new MySQLStore({}, pool);//define the session store in db using above pool

app.use(session({//configure the session management
    secret: process.env.SESSION_SECRET,//secret key to sign the session ID cookie
    resave: false,//don't resave the session unless it was modified
    saveUninitialized: false,//don't save uninitialized sessions to the session store
    store: sessionStore,//save the sessions in the sessionStore defined above
    cookie: {//configure the cookie that will be stored on the client
        maxAge: 3600000,//3600000 ms = 1 hour max age of the session (it expires after this limit)
        httpOnly: true,//prevent Javascript from reading, writing, or deleting the cookie
        sameSite: "none",//allow the cookie to be sent over non- same-site requests
        secure: true,//send the cookie over HTTPs
    },
    rolling: true,//reset the expiration countdown after every request
}));

//Jack added
// Runs the Python vulnerability scanner and returns the generated contract payload from scan_result.json.
// Frontend depends on this route to populate the "matching vulnerabilities" flow.
app.post("/run-scan", (req, res) => {
    const pythonCommand = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const projectRoot = path.join(__dirname, "..");
    const resultPath = path.join(projectRoot, "scan_result.json");
    const scanner = spawn(
        pythonCommand,
        ["-m", "frontend.Vulnerability_Scanning.Vulnerability_main"],
        { cwd: projectRoot }
    );

    let responded = false;
    let errorOutput = "";

    scanner.stderr.on("data", (data) => {
        errorOutput += data.toString();
    });

    scanner.on("error", (err) => {
        if (responded) return;
        responded = true;
        return res.status(500).json({
            success: false,
            message: "Failed to start vulnerability scan process.",
            error: err.message
        });
    });

    scanner.on("close", (code) => {
        if (responded) return;
        if (code !== 0) {
            responded = true;
            return res.status(500).json({
                success: false,
                message: "Scan failed.",
                error: errorOutput || `Scanner exited with code ${code}`
            });
        }

        try{
            const raw = fs.readFileSync(resultPath, "utf8");
            const parsed = JSON.parse(raw);
            responded = true;
            return res.json(parsed);
        }
        catch(err){
            responded = true;
            return res.status(500).json({
                success: false,
                message: "Failed to read scan results.",
                error: err.message
            });
        }
    });
});
//Jack added end

app.post("/register", async (req, res) => {//if here, client submitted registration form
    const {email, password} = req.body;//extract entered credentials from request body

    if(!email || !password)//if here, email or password missing
        return res.status(400).json({//indicate registration failure in response
            success: false,
            message: "Email or password missing!"
        });

    const hashedPassword = await bcrypt.hash(password, 10);//hash the password

    try{
        await pool.query(//insert the new user's info into the database
            "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
            [email, hashedPassword]
        );

        //if here, registration succeeded
        return res.status(201).json({success: true});//indicate success in response
    }
    catch(err){//if here, registration error was caught
        console.error("Registration error!: ", err);//log error to console

        if(err.code === "ER_DUP_ENTRY")//if here, query failed because email taken
            return res.status(400).json({//indicate registration failure in response
                success: false,
                message: "Email already taken!"
            });
                
        //if here, some other error occured
        return res.status(500).json({//indicate registration failure in response
            success: false,
            message: "Server error in registration!"
        });
    }
});

app.post("/login", async (req, res) => {//if here, client submitted login form
    const {email, password} = req.body;//extract entered credentials from request body

    if(!email || !password)//if here, email or password missing
        return res.status(400).json({//indicate login failure in response
            success: false,
            message: "Email or password missing!"
        });

    try{  
        const [users] = await pool.query(//search for entered email in database
            "SELECT * FROM users WHERE email = ?", [email]
        );

        if(users.length === 0)//if here, entered email not found
            return res.status(400).json({//indicate login failure in response
                success: false,
                message: "Email not found!"
            });
                
        //if here, email was found. Proceed with password check
        if(!await bcrypt.compare(password, users[0].hashed_password))//if here, wrong pass
            return res.status(400).json({//indicate login failure in response
                success: false,
                message: "Wrong Password!"
            });

        //if here, passwords match
        const sessionUser = {user_id: users[0].user_id, email: users[0].email};//user info
        req.session.user = sessionUser;//store user info in session

        return res.json({//indicate login success in response and return user info
            success: true,
            user: sessionUser
        });
    }
    catch (err){//if here, login error was caught
        console.error("Server error in login!: ", err);//log the error to the console
        return res.status(500).json({//indicate login failure response
            success: false,
            message: "Server error in login!"
        });
    }
});

app.post("/logout", (req, res) => {//if here, client submitted logout request
    req.session.destroy(err => {//destroy the user's session
        if(err){//if here, error in logging out
            return res.status(500).json({//indicate logout failure in response
                success: false,
                message: "Server error in logout!"
            });
        }
                
        //if here, logout succeeded
        res.clearCookie("connect.sid");//tell the client to delete the session cookie
        return res.json({success: true});//indicate logout success in response
    });
});

app.get("/check_login", (req, res) => {//if here, client requested login status
    if(req.session.user)//if here, user is logged in
        res.json({//return true and user info
            loggedIn: true,
            user: req.session.user
        });
    else//if here, user not logged in
        res.json({loggedIn: false});//return false  
});

app.post("/save-scan", async (req, res) => {//if here, client requested to save scan report
    const user_id = req.session?.user?.user_id ?? null;//get user ID from session

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate report-saving failure in response
            success: false,
            message: "You must be logged in to save scan reports!"
        });

    const {scanName, scannedAt, status, devices} = req.body;//extract scan data from request body

    if(!scanName || !scannedAt || !status)//if here, required fields missing
        return res.status(400).json({//indicate scan saving failure in response
            success: false,
            message: "Missing required fields!"
        });

    try{
        const [scanResult] = await pool.query(//insert scan report into database
            `INSERT INTO scan_reports (
                scan_name,
                scanned_at,
                status,
                owner_id
            ) VALUES (?, ?, ?, ?)`,
            [scanName, scannedAt, status, user_id]
        );

        const scan_id = scanResult.insertId;//get id of the previously inserted report

        if(Array.isArray(devices) && devices.length > 0){//if here, devices provided
            for(const device of devices){//iterate through the devices array
                const {//get the device data
                    ip,
                    hostname,
                    vendor,
                    type,
                    riskLevel,
                    status,
                    findings
                } = device;

                const [deviceResult] = await pool.query(//insert device into database
                    `INSERT INTO devices (
                        scan_id,
                        ip,
                        hostname,
                        vendor,
                        type,
                        risk_level,
                        finding_count,
                        status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        scan_id,
                        ip || null,
                        hostname || null,
                        vendor || null,
                        type || null,
                        riskLevel || null,
                        Array.isArray(findings) ? findings.length : 0,
                        status || "COMPLETE"
                    ]
                );

                const device_id = deviceResult.insertId;//get the ID of previously inserted device

                if(Array.isArray(findings) && findings.length > 0){//if here, findings provided
                    for(const f of findings){//iterate through the array of findings
                        const {//get the finding data
                            title,
                            severity,
                            description,
                            impact,
                            recommendation,
                            source,
                            protocol,
                            port,
                            service,
                            state,
                            cveIds
                        } = f;

                        await pool.query(//insert finding info into database
                            `INSERT INTO findings (
                                device_id,
                                title,
                                severity,
                                description,
                                impact,
                                recommendation,
                                source,
                                protocol,
                                port,
                                service,
                                state,
                                cve_ids
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                device_id,
                                title,
                                severity,
                                description || null,
                                impact || null,
                                recommendation || null,
                                source || null,
                                protocol || null,
                                port || null,
                                service || null,
                                state || null,
                                Array.isArray(cveIds) ? cveIds.join(",") : null
                            ]
                        );
                    }
                }
            }
        }

        return res.status(201).json({//if here, scan report successfully saved
            success: true,
            scan_id
        });

    }
    catch(err){//if here, error caught while trying to save scan
        console.error("Server error in saving report!: ", err);
        return res.status(500).json({//indicate failure in saving report
            success: false,
            message: "Server error in saving report!"
        });
    }
});

app.post("/save-dynamic-scan", async (req, res) => {//if here, client requested save dynamic scan
    const user_id = req.session?.user?.user_id ?? null;//get user ID from session

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate report-saving failure in response
            success: false,
            message: "You must be logged in to save scan reports!"
        });

    const {schemaVersion, deviceDetailsResponse} = req.body;//extract scan data from request body

    if(!deviceDetailsResponse)//if here, required fields missing
        return res.status(400).json({//indicate scan saving failure in response
            success: false,
            message: "Missing dynamic scan data!"
        });

    const {//extract data from device details response
        scanId,
        deviceId,
        ip,
        hostname,
        vendor,
        type,
        riskLevel,
        findingCount,
        findings
    } = deviceDetailsResponse;

    if(!scanId || !findings)//if here, missing required fields
        return res.status(400).json({//indicate scan saving failure in response
            success: false,
            message: "Missing required fields!"
        });

    try{
        await pool.query(//insert dynamic scan data into database
            `INSERT INTO dynamic_scan_sessions (
                dynamic_scan_id,
                device_id,
                ip,
                hostname,
                vendor,
                type,
                risk_level,
                finding_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                scanId,
                deviceId || null,
                ip || null,
                hostname || null,
                vendor || null,
                type || null,
                riskLevel || "LOW",
                findingCount || 0
            ]
        );

        if(Array.isArray(findings) && findings.length > 0){//if here, findings provided
            for(const f of findings){//iterate through the findings array
                const evidence = f.evidence || {};//extract the finding evidence

                await pool.query(//insert the finding into the database
                    `INSERT INTO dynamic_scan_findings (
                        finding_id,
                        dynamic_scan_id,
                        title,
                        severity,
                        description,
                        impact,
                        recommendation,
                        source,
                        evidence_timestamp,
                        source_ip,
                        destination_ip,
                        packet_size,
                        frequency,
                        score
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        f.findingId,
                        scanId,
                        f.title || "Untitled Finding",
                        f.severity || "LOW",
                        f.description || null,
                        f.impact || null,
                        f.recommendation || null,
                        f.source || "ml",

                        evidence.timestamp || null,
                        evidence.sourceIp || null,
                        evidence.destinationIp || null,
                        evidence.packetSize || null,
                        evidence.frequency || null,
                        evidence.score || null
                    ]
                );
            }
        }

        return res.status(201).json({//if here, save successful
            success: true,
            report_id: scanId
        });
    }
    catch(err){//if here, error in saving report
        console.error("Server error in saving report!: ", err);
        return res.status(500).send({
            success: false,
            message: "Server error in saving report!"
        });
    }
});

//Jack added
// Updated the existing delete route to use the new schema key (scan_id) instead of legacy report_id.
// This keeps delete behavior working after schema migration.
app.delete("/delete-scan/:id", async (req, res) =>{//if here, report deletion requested
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID
    const scanId = req.params.id;//get the scan id from the URL

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate deletion failure in response
            success: false,
            message: "You must be logged in to delete scan reports!"
        });

    try{
        const [result] = await pool.query(//delete the report only if the user owns it
            "DELETE FROM scan_reports WHERE scan_id = ? AND owner_id = ?",
            [scanId, user_id]
        );

        if(result.affectedRows === 0)//if here, scan not found or belongs to someone else
            return res.status(404).json({//indicate deletion failure in response
                success: false,
                message: "Scan not found or belongs to someone else!"});
                
        //if here, deletion succeeded
        res.json({success: true});//indicate deletion success in response
    } 
    catch(err){//if here, error was caught in deletion
        console.error("Server error in deleting report!: ", err);//log the error
        res.status(500).json({//indicate deletion failure in response
            success: false,
            message: "Server error in deleting report!"
        });
    }
});//Jack added end

app.delete("/dynamic-scan/:id", async (req, res) => {// if here, dynamic scan deletion requested
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID
    const scanId = req.params.id; //dynamic_scan_id from URL

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate failure in saving
            success: false,
            message: "You must be logged in to delete scan reports!"
        });

    try{
        const [result] = await pool.query(//delete the dynamic scan
            "DELETE FROM dynamic_scan_sessions WHERE dynamic_scan_id = ?",
            [scanId]
        );

        if(result.affectedRows === 0)//if here, scan not found
            return res.status(404).json({
                success: false,
                message: "Scan not found or belongs to someone else!"
            });

        return res.json({success: true});//if here, deletion successful
    }
    catch(err){ // if here, error caught in deletion
        console.error("Server error in deleting report!: ", err);
        return res.status(500).json({//indicate failure
            success: false,
            message: "Server error in deleting report!"
        });
    }
});

app.get("/scan-reports", async (req, res) => {//if here, client requested scan reports list
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate retrieval failure in response
            success: false,
            message: "You must be logged in to view your scan reports!"
        });

    try{
        //get scan reports from database
        const [rows] = await pool.query(`
            SELECT 
                sr.scan_id,
                sr.scan_name,
                sr.scanned_at,
                sr.status,
                COUNT(DISTINCT d.device_id) AS deviceCount,
                COUNT(f.finding_id) AS totalFindingCount,
                SUM(CASE WHEN f.severity = 'LOW' THEN 1 ELSE 0 END) AS lowCount,
                SUM(CASE WHEN f.severity = 'MEDIUM' THEN 1 ELSE 0 END) AS mediumCount,
                SUM(CASE WHEN f.severity = 'HIGH' THEN 1 ELSE 0 END) AS highCount,
                SUM(CASE WHEN f.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS criticalCount
            FROM scan_reports sr
            LEFT JOIN devices d ON d.scan_id = sr.scan_id
            LEFT JOIN findings f ON f.device_id = d.device_id
            WHERE sr.owner_id = ?
            GROUP BY sr.scan_id
            ORDER BY sr.scanned_at DESC
        `, [user_id]);

        const scans = rows.map(row => ({//extract data from response
            scanId: row.scan_id,
            scanName: row.scan_name,
            scannedAt: row.scanned_at,
            status: row.status,
            deviceCount: row.deviceCount || 0,
            totalFindingCount: row.totalFindingCount || 0,
            riskCounts: {
                LOW: row.lowCount || 0,
                MEDIUM: row.mediumCount || 0,
                HIGH: row.highCount || 0,
                CRITICAL: row.criticalCount || 0
            }
        }));

        return res.json({//if here, retrieval successful
            success: true,
            scans
        });
    }
    catch(err){//if here, error in getting scan reports
        console.error("Server error in getting scan reports!: ", err);
        return res.status(500).json({//indicate failure
            success: false,
            message: "Server error in getting scan reports!"
        });
    }
});

app.get("/dynamic-scans", async (req, res) => {//if here, client requested dynamic scans list
    const user_id = req.session?.user?.user_id ?? null;//get the user's ID

    if(!user_id)//if here, user not logged in
        return res.status(401).json({
            success: false,
            message: "You must be logged in to view your scan reports!"
        });

    try{
        //retrieve dynamic scan reports
        const [reports] = await pool.query(`
            SELECT 
                dynamic_scan_id AS scanId,
                device_id AS deviceId,
                ip,
                hostname,
                vendor,
                type,
                risk_level AS riskLevel,
                finding_count AS findingCount,
                started_at AS startedAt,
                finished_at AS finishedAt
            FROM dynamic_scan_sessions
            ORDER BY started_at DESC
        `);

        return res.json({//if here, retrieval successful
            success: true,
            reports
        });
    }
    catch(err){//if here, error in getting dynamic scans
        console.error("Server error in getting scan reports!: ", err);
        return res.status(500).json({//indicate failure
            success: false,
            message: "Server error in getting scan reports!"
        });
    }
});

app.get("/scan-reports/:scan_id/devices", async (req, res) => {//if here, devices list requested
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID
    const scan_id = req.params.scan_id;//get the report id from the URL

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate failure
            success: false,
            message: "You must be logged in to view your scanned devices!"
        });

    try{
        const [scanRows] = await pool.query(//verify reports belong to logged-in user
            `SELECT scan_id, scan_name, scanned_at, status
             FROM scan_reports
             WHERE scan_id = ? AND owner_id = ?`,
            [scan_id, user_id]
        );

        if(scanRows.length === 0){//if here, no report found or it belongs to someone else
            return res.status(404).json({//indicate failure
                success: false,
                message: "Scan not found or belongs to someone else!"
            });
        }

        const scan = scanRows[0];

        const [deviceRows] = await pool.query(//retrieve devices for this scan
            `SELECT 
                d.device_id,
                d.ip,
                d.hostname,
                d.vendor,
                d.type,
                d.risk_level,
                d.finding_count,
                d.status
             FROM devices d
             WHERE d.scan_id = ?
             ORDER BY d.device_id ASC`,
            [scan_id]
        );

        //Jack added
        // Hydrate each device with full finding records so previous scans can render CVE/recommendation details.
        // Without this block, history view only has top-level device metadata and the bottom detail section is empty.
        const findingsByDevice = new Map();
        const deviceIds = deviceRows.map((d) => d.device_id);

        if (deviceIds.length > 0) {
            const placeholders = deviceIds.map(() => "?").join(",");
            const [findingRows] = await pool.query(
                `SELECT
                    finding_id,
                    device_id,
                    title,
                    severity,
                    description,
                    impact,
                    recommendation,
                    source,
                    protocol,
                    port,
                    service,
                    state,
                    cve_ids
                 FROM findings
                 WHERE device_id IN (${placeholders})
                 ORDER BY finding_id ASC`,
                deviceIds
            );

            for (const f of findingRows) {
                const cveIds = typeof f.cve_ids === "string" && f.cve_ids.trim()
                    ? f.cve_ids.split(",").map((id) => id.trim()).filter(Boolean)
                    : [];

                const normalizedFinding = {
                    findingId: f.finding_id,
                    title: f.title,
                    severity: f.severity,
                    description: f.description,
                    impact: f.impact,
                    recommendation: f.recommendation,
                    source: f.source,
                    cveIds,
                    evidence: {
                        protocol: f.protocol,
                        port: f.port,
                        service: f.service,
                        state: f.state
                    }
                };

                const existing = findingsByDevice.get(f.device_id) || [];
                existing.push(normalizedFinding);
                findingsByDevice.set(f.device_id, existing);
            }
        }

        const devices = deviceRows.map(d => ({
            deviceId: d.device_id,
            ip: d.ip,
            hostname: d.hostname,
            vendor: d.vendor,
            type: d.type,
            riskLevel: d.risk_level,
            findingCount: d.finding_count,
            status: d.status,
            findings: findingsByDevice.get(d.device_id) || []
        }));
        //Jack added end

        return res.json({//if here, retrieval successful
            success: true,//indicate success
            scanDetails: {
                scanId: scan.scan_id,
                scanName: scan.scan_name,
                scannedAt: scan.scanned_at,
                status: scan.status,
                devices
            }
        });

    }
    catch(err){//if here, retrieval failed
        console.error("Server error retrieving devices!: ", err);
        return res.status(500).json({//indicate failure
            success: false,
            message: "Server error in retrieving devices!"
        });
    }
});

app.get("/dynamic-scans/:scan_id/findings", async (req, res) => {//if here, findings requested
    const user_id = req.session?.user?.user_id ?? null;//get user ID
    const scan_id = req.params.scan_id; //get scan ID

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate failure
            success: false,
            message: "You must be logged in to view your scanned devices!"
        });

    try{
        //retrieve all findings for this dynamic scan
        const [findings] = await pool.query(`
            SELECT
                finding_id AS findingId,
                dynamic_scan_id AS scanId,
                title,
                severity,
                description,
                impact,
                recommendation,
                source,
                evidence_timestamp AS timestamp,
                source_ip AS sourceIp,
                destination_ip AS destinationIp,
                packet_size AS packetSize,
                frequency,
                score
            FROM dynamic_scan_findings
            WHERE dynamic_scan_id = ?
            ORDER BY evidence_timestamp ASC
        `, [scan_id]);

        if (findings.length === 0)//if here, report not found for logged-in user
            return res.status(404).json({//indicate failure
                success: false,
                message: "Report not found or belongs to someone else!"
            });

        return res.json({//if here retrieval successful
            success: true,
            findings
        });
    }
    catch(err){//if here, retrieval error
        console.error("Server error retrieving devices!: ", err);
        return res.status(500).json({//indicate failure
            success: false,
            message: "Server error in retrieving devices!"
        });
    }
});

app.get("/", (req, res) => {//if here, client requested the website home page
    try{
        const homePage = fs.readFileSync(
            path.join(__dirname, "views", "index.html"),
            "utf8"
        );

        return res.send(homePage);
    }
    catch (err){
        console.error("Error loading home page:", err);
        return res.status(500).send("Error loading home page.");
    }
});

app.post("/send-email", async (req, res) => {//if here, client requested email to be sent 
    const {email} = req.body;//extract entered email address from request body
            
    if(!email)//if here, email missing
        return res.status(400).json({//indicate email-sending failure in response
            success: false,
            message: "Email address missing!"
        });

    const token = crypto.randomBytes(32).toString("hex");//generate the reset token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");//hash it

    try{
        const [result] = await pool.query(//insert the new reset token into the database
            "UPDATE users SET resetToken = ?, resetTokenExpiry = ? WHERE email = ?", [
                hashedToken,
                Date.now() + 3600000,//1 hour expiry
                email
            ]
        );

        if(result.affectedRows === 0)//if here, email not found
            return res.status(404).json({//indicate email-sending failure in response
                success: false,
                message: "Email address not found!"
            });
                
        const resetURL = `http://localhost:3000/get-reset-page?token=${token}`;//reset URL
                
        const messageParts = [//define the message to be sent
            `To: ${email}`,
            "Subject: Password Reset Requested",
            "Content-Type: text/html; charset=UTF-8",
            "",
            `<p>Click the following link to reset your password:</p>
            <p><a href="${resetURL}">Reset Password</a></p>`
        ];

        const encodedMessage = Buffer.from(messageParts.join("\n"))
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        await gmail.users.messages.send({//send the email through Gmail's API
            userId: "me",
            requestBody: {
                raw: encodedMessage
            }
        });
                
        //if here, email successfully sent
        return res.json({success: true});//indicate email-sending success in response
    }
    catch(err){//if here, email-sending error caught
        console.error("Server error sending email!: ", err);//log the error
        res.status(500).json({//indicate email-sending failure in response
            success: false,
            message: "Server error in sending email!"
        });
    }
});

app.get("/get-reset-page", async (req, res) => {//if here, password reset page requested
    const {token} = req.query;//extract the reset token from the request

    if(!token)//if here, token missing
        return res.status(400).send("Missing reset token!");//indicate failure in response
  
    try{
        // Hash the token (since we store hashed values in DB)
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const [results] = await pool.query(//search for user with matching token
            "SELECT * FROM users WHERE resetToken = ? AND resetTokenExpiry > ?",
            [hashedToken, Date.now()]
        );
        if(results.length === 0)//if here, invalid reset token: indicate failure 
                    return res.status(400).send("Invalid or expired reset link!");

        //define the reset page HTML file that will be sent to the client's browser
        let resetPage = fs.readFileSync(
            path.join(__dirname, "../docs/reset-page.html"),
            "utf8"
        );
        resetPage = resetPage.replace("__TOKEN__", token);//inject the token into the file
    
        return res.send(resetPage);//return the reset page in the response
    }
    catch(err){//if here, error caught in page retrieval
        console.error("Server error in retrieving password reset form!: ", err);//log error
        return res.status(500).send("Server error in retrieving password reset form!");
    }
});
       
app.post("/reset-password", async (req, res) => {//if here, user wants to reset password
    const {token, newPassword} = req.body;//extract the token and new password from req body

    if(!token || !newPassword)//if here, token or password missing
                return res.status(400).send("Missing token or new password!");//indicate failure

    try{
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");//hash
        const hashedPassword = await bcrypt.hash(newPassword, 10);//hash the new password

        const [result] = await pool.query(//update the password and reset tokewn in db
            `UPDATE users
            SET hashed_password = ?,
            resetToken = NULL,
            resetTokenExpiry = NULL WHERE resetToken = ? AND resetTokenExpiry > ?`,
            [hashedPassword, hashedToken, Date.now()]
        );

        if(result.affectedRows === 0)//if here, token invalid or expired
            return res.status(400).send("Invalid or expired reset token!");//indicate fail
                
        //if here, password updated succeeded
        return res.send("Password reset successful!");//indicate success in response
    }
    catch(err){//if here, error caught in reseting password
        console.error("Server error in resetting password!: ", err);//log the error
        return res.status(500).send("Server error in resetting password!");//indicate fail
    }
});

(async () => {
    try {
        https.createServer(options, app).listen(443, () => {
            console.log('HTTPS server running on https://localhost');
        });
    } 
    catch (err) {
        console.error("Failed to start server: ", err);
    }
})();