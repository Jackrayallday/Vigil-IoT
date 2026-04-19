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

oauth2Client.setCredentials({//set the refresh token of this client
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const gmail = google.gmail({version: "v1", auth: oauth2Client});//create the Gmail API client

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

        ///////////////////////////////////////////////////////////////////////////////////////////
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS scan_reports (
            scan_id INT AUTO_INCREMENT PRIMARY KEY,
            scan_name VARCHAR(100) NOT NULL,
            scanned_at DATETIME NOT NULL,
            status ENUM('PENDING','COMPLETE','FAILED') NOT NULL DEFAULT 'PENDING',
            owner_id INT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
        );`);

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
        ///////////////////////////////////////////////////////////////////////////////////////////
        
        /*//create the scan_reports table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS scan_reports (
            report_id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(100) NOT NULL,
            scanned_at DATETIME NOT NULL,
            targets TEXT NOT NULL,
            exclusions TEXT,
            detection_options TEXT,
            owner_id INT NOT NULL,
            FOREIGN KEY (owner_id)
                REFERENCES users(user_id)
                ON DELETE CASCADE
        )`);

        //create the devices table if it doesn't exist yet
        await bootstrap.query(`CREATE TABLE IF NOT EXISTS devices (
            device_id INT AUTO_INCREMENT PRIMARY KEY,
            device_name VARCHAR(100),
            protocol_warnings TEXT,
            services TEXT,
            ip_address VARCHAR(45),
            notes TEXT,
            remediation_tips TEXT,
            associated_report INT NOT NULL,
            FOREIGN KEY (associated_report)
                REFERENCES scan_reports(report_id)
                ON DELETE CASCADE
        )`);*/
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
        sameSite: "lax",//send the cookie only on same-site requests
        secure: false,//send the cookie over HTTP for now, not HTTPS
    },
    rolling: true,//reset the expiration countdown after every request
}));

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

    const {//get the scan report info from request body
        title,
        scanned_at,
        targets,
        exclusions,
        detection_options,
        devices
    } = req.body;
            
    if(!title || !scanned_at || !targets)//if here, required fields missing
		return res.status(400).json({//indicate scan saving failure in response
            success: false, 
            message: "Missing required fields!"
        });
    
    try{
        const [reportResult] = await pool.query(//insert scan report into database
            `INSERT INTO scan_reports (
                owner_id,
                title,
                scanned_at,
                targets,
                exclusions,
                detection_options
            ) VALUES (?, ?, ?, ?, ?, ?)`, [
                user_id,
                title,
                scanned_at,
                targets,
                exclusions || null,
                detection_options || null
            ]
        );

        const report_id = reportResult.insertId;//get id of the previously inserted report

        if(Array.isArray(devices) && devices.length > 0){//if here, devices provided
            for(const device of devices){//iterate through the devices array
                const {//get the device data
                    deviceName,
                    ipAddress,
                    services,
                    protocolWarnings,
                    notes,
                    remediationTips
                } = device;

                await pool.query(//insert device into database
                    `INSERT INTO devices  (
                        associated_report,
                        device_name,
                        ip_address,
                        services,
                        protocol_warnings,
                        notes,
                        remediation_tips
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                        report_id,
                        deviceName || null,
                        ipAddress || null,
                        services || null,
                        protocolWarnings || null,
                        notes || null,
                        remediationTips || null
                    ]
                );
            }
        }
		        
        //if here, scan report successfully saved
        return res.status(201).json({//indicate success in response
            success: true,
            report_id
        });
    }
	catch (err){//if here, error caught while trying to save scan
        console.error("Server error in saving report!: ", err);//log the error
        res.status(500).send({//indicate failure in saving report
            success: false,
            message: "Server error in saving report!"});
    }
});

app.delete("/delete-scan/:id", async (req, res) =>{//if here, report deletion requested
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID
    const reportId = req.params.id;//get the report id from the URL

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate deletion failure in response
            success: false,
            message: "You must be logged in to delete scan reports!"
        });

    try{
        const [result] = await pool.query(//delete the report only if the user owns it
            "DELETE FROM scan_reports WHERE report_id = ? AND owner_id = ?",
            [reportId, user_id]
        );

        if(result.affectedRows === 0)//if here, report not found or belongs to someone else
            return res.status(404).json({//indicate deletion failure in response
                success: false,
                message: "Report not found or belongs to someone else!"});
                
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
});

app.get("/scan-reports", async (req, res) => {//if here, client requested scan reports list
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate retrieval failure in response
            success: false,
            message: "You must be logged in to view your scan reports!"
        });

    try{
        const [reports] = await pool.query(//get the scan reports from the database
            `SELECT report_id, title, scanned_at, targets, exclusions, detection_options
            FROM scan_reports
            WHERE owner_id = ?
            ORDER BY scanned_at DESC`,
            [user_id]
        );
                
        //if here, retrieval successful
        return res.json({//indicate retrieval success in resposne
            success: true,
            reports
        });
    }
    catch(err){//if here, retrieval error was caught
        console.error("Server error in getting scan reports!: ", err);//log the error
        return res.status(500).json({//indicate retrieval failure in response
            success: false,
            message: "Server error in getting scan reports!"
        });
    }
});

app.get("/scan-reports/:report_id/devices", async (req, res) =>{//if here, devices request
    const user_id = req.session?.user?.user_id ?? null;//get the logged-in user's ID
    const report_id = req.params.report_id;//get the report id from the URL

    if(!user_id)//if here, user not logged in
        return res.status(401).json({//indicate retrieval failure in response
            success: false,
            message: "You must be logged in to view your scanned devices!"
        });

    try{
        const [devices] = await pool.query(//get devices from report of the logged-in user
            `SELECT d.device_id, d.device_name, d.ip_address, d.services,
                d.protocol_warnings, d.notes, d.remediation_tips
            FROM devices d
            JOIN scan_reports r ON r.report_id = d.associated_report
            WHERE d.associated_report = ? AND r.owner_id = ?
            ORDER BY d.device_id ASC`,
            [report_id, user_id]
        );

        if(devices.length === 0)//if here, no report found or it belongs to someone else
            return res.status(404).json({//indicate retrieval failure in response
                success: false,
                message: "Report not found or belongs to someone else!"
            });
                
        //if here, devices successfullt retrieved
        return res.json({//indicate retrieval success in response
            success: true,
            devices
        });
    } 
    catch(err){//if here, error caught in retrieving devices
        console.error("Server error retrieving devices!: ", err);//log the error
        res.status(500).json({//indicate retrieval failure in response
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
    try{
        app.listen(3000, () => console.log("Server running on port 3000"));//start server: prt 3000
    } 
    catch (err){//if here, error server startup
        console.error("Failed to start server: ", err);//log the error to the console
    }
})();