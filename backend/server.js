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
const bcrypt = require("bcrypt");//to hash passwords before storing them in the database
const nodemailer = require("nodemailer");//for email-sending functionallity
const crypto = require("crypto");//to generate the password reset token////////////////////////////

const app = express();//create the express object to represent the server app

app.use(express.json());//parse incoming JSON request bodies and store them in req.body

app.use(cors({//configure the server's CORS policy
    origin: "http://localhost:5173",//allow cross-origin requests from only our frontend
    credentials: true//allow credentials to be sent in these requests
}));

app.use(session({//configure the session management
    secret: "d50b70c9e0ceb011db93c851cdfc365128995575ae25dcb87cc838e6afc34b0a",//secret key to sign
    resave: false,//don't resave the session unless it was modified            //session ID cookie
    saveUninitialized: false,//don't save uninitialized sessions to the session store
    cookie: {//configure the cookie that will be stored on the client
        maxAge: 3600000,//3600000 ms = 1 hour max age of the session (it expires after this limit)
        httpOnly: true,//prevent Javascript from reading, writing, or deleting the cookie
        secure: false//send the cookie over HTTP for now, not HTTPS
    },
    rolling: true,//reset the expiration countdown after every request
}));

const transporter = nodemailer.createTransport({//configure the mail transporter
    service: "gmail",//Use Gmail’s SMTP servers
    auth: {//set the sender's credentials
        user: "vigil.iot.app@gmail.com",//sender email address
        pass: "bkdohtklsmilwbym"//app password to access the gmail account through an app
    },
    tls: {rejectUnauthorized: false}//to fix recent bug with cerification (temporary)//////////////
});

async function initDatabase(){//function to initialize the database
    const connection = await mysql.createConnection({//configure the MySQL connection
        host: "localhost",//process.env.DB_HOST || 'localhost',////////////////////////////////////
        user: "root",//process.env.DB_USER || 'root',//////////////////////////////////////////////
        password: "comp440"//process.env.DB_PASSWORD || '',////////////////////////////////////////
        //database: process.env.DB_NAME || 'vigil_iot',////////////////////////////////////////////
        //port: process.env.DB_PORT || 3306,*//////////////////////////////////////////////////////
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS vigil_iot`);//create db if not exists
    await connection.query(`USE vigil_iot`);//all future queries should apply to this db

    await connection.query(`CREATE TABLE IF NOT EXISTS users ( -- create users table if not exists
        user_id INT AUTO_INCREMENT PRIMARY KEY, -- user ID: integer auto-incremented from previous
        email VARCHAR(100) UNIQUE NOT NULL,     -- email address: <= 100 char unique non-null str
        hashed_password VARCHAR(255) NOT NULL,  -- hashed password: <=255 char non-null string
        resetToken VARCHAR(255),                -- reset token: <=255 char string//////////////////
        resetTokenExpiry BIGINT                 -- reset token expiration time: large integer//////
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS scan_reports ( -- create scan_reports table
        report_id INT AUTO_INCREMENT PRIMARY KEY, -- report ID: int auto-incremented from previous
        title VARCHAR(100) NOT NULL,              -- title: <= 100 char non-null string
        scanned_at DATETIME NOT NULL,             -- timestamp of scan: non-null time and date
        targets TEXT NOT NULL,                    -- target IPs or hostnames: non-null string
        exclusions TEXT,                          -- excluded IPs or hostnames: string (optional)
        detection_options TEXT,                   -- selected detection options: string
        owner_id INT NOT NULL,                    -- report owner's user ID: integer
        FOREIGN KEY (owner_id)                    -- define owner_id as a foregin key
            REFERENCES users(user_id) -- reference user_id field in users table
            ON DELETE CASCADE         -- delete this report when the corresponding user is deleted
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS devices ( -- create devices table
        device_id INT AUTO_INCREMENT PRIMARY KEY, -- device ID: int auto-incremented from previous
        device_name VARCHAR(100),                 -- device name: <= 100 char string
        protocol_warnings TEXT,                   -- protocol warnings list: string
        services TEXT,                            -- services list: string
        ip_address VARCHAR(45),                   -- IP address: <=45 char string
        notes TEXT,                               -- additional notes: string
        remediation_tips TEXT,                    -- remediation tips: string
        associated_report INT NOT NULL,           -- associated report: ID of report listing device
        FOREIGN KEY (associated_report)                   -- define associated_report as a foregin key
            REFERENCES scan_reports(report_id) -- reference report_id field in reports table 
            ON DELETE CASCADE                  -- delete device when corresponding report deleted
    )`);

    return connection;//return the MySQL connection
}

(async () => {
    try{
        const db = await initDatabase();//call the method to initialize the database

        app.post("/register", async (req, res) => {//if here, client submitted registration form
            const {email, password} = req.body;//extract entered credentials from request body

            try{
                const [existingUsers] = await db.query(//search for entered email in database
                    "SELECT * FROM users WHERE email = ?", [email]
                );                             

                if(existingUsers.length > 0)//if here, entered email exists in database
                    return res.status(400).json({//indicate unsucessful registration in response
                        success: false,
                        message: "Invalid Input: Email already taken!"
                    });

                //if here, email not taken: proceed with registration
                const hashedPassword = await bcrypt.hash(password, 10);//hash the password

                await db.query(//insert the new user's info into the database
                    "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
                    [email, hashedPassword]
                );

                return res.status(201).json({success: true});//indicate successful registration
            }
            catch(err){//if here, registration error was caught
                console.error("Server error in registration!: ", err);//log error to console
                return res.status(500).json({//indicate the error in response to client
                    success: false,
                    message: "Server error in registration!"
                });
            }
        });

        app.post("/login", async (req, res) => {//if here, client submitted login form
            const {email, password} = req.body;//extract entered credentials from request body

            try{  
                const [users] = await db.query(//search for entered email in database
                    "SELECT * FROM users WHERE email = ?", [email]
                );

                if(users.length === 0)//if here, entered email not found
                    return res.status(400).json({//indicate unsucessful login in response
                        success: false,
                        message: "Invalid Input: Email not found!"
                    });
                
                //if here, email was found. Proceed with password check
                //hash the entered password and compare it with the hash in the database
                const passwordMatch = await bcrypt.compare(password, users[0].hashed_password);

                if(passwordMatch){//if here, passwords match: login sucessful
                    const sessionUser = {user_id: users[0].user_id, email: users[0].email};
                    req.session.user = sessionUser;//store user info in session
                    return res.json({success: true, user: sessionUser});//indicate login success
                } 
                else//if here, passwords don't match
                    return res.status(400).json({//indicate unsucessful login in response
                        success: false,
                        message: "Invalid Input: Wrong Password!"
                    });
            }
            catch (err)
            {//if here, login error was caught
                console.error("Server error in login!: ", err);//log the error to the console
                return res.status(500).json({//indicate the error in response to client
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
            if(req.session.user)//if here, user logged in
                res.json({loggedIn: true, user: req.session.user});//return true and user info
            else//if here, user not logged in
                res.json({loggedIn: false});//return false  
        });

        app.post("/save-scan", async (req, res) => {//if here, client requested to save scan report
            const sessionUserId = req.session?.user?.user_id ?? null;//get user ID from session
            const {//get the scan report info from request body
                user_id: userIdFromBody,//rename this variable to userIdFromBody
                title,
                scanned_at,
                targets,
                exclusions,
                detection_options,
                devices
            } = req.body;
            const user_id = userIdFromBody || sessionUserId;//if no body user ID, use session

            if(!user_id || !title || !scanned_at || !targets)//check required fields  
		        return res.status(400).json({success: false, message: "Missing required fields!"});
    
            try{
                const [reportResult] = await db.query(//inser scan report into database
                    `INSERT INTO scan_reports 
                    (user_id, title, scanned_at, targets, exclusions, detection_options) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [user_id, title, scanned_at, targets, exclusions || null, detection_options || null]
                );

                const report_id = reportResult.insertId;//get id of the previously inserted report

                if(Array.isArray(devices) && devices.length > 0){//insert devices if provided
                    for(const device of devices){//for each device
                        const {//get the device data
                            deviceName,
                            ipAddress,
                            services,
                            protocolWarnings,
                            notes,
                            remediationTips
                        } = device;

                        await db.query(//insert device into database
                            `INSERT INTO devices 
                            (report_id, device_name, ip_address, services, protocol_warnings, notes, remediation_tips) 
                            VALUES (?, ?, ?, ?, ?, ?, ?)`, [
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
		
                res.status(201).json({success: true, report_id});//inform client of success
            }
	        catch (err)
	        {//if here, error occured
                console.error("Error saving scan report!: ", err);
                res.status(500).send({success: false, message: "Server error!"});
            }
        });


    /////////////////////////////////////////////////////////////////////////////////////
        //set the routes that send responses according to client requests
        app.get("/get-reset-page", async (req, res) => {
            const {token} = req.query;
            if(!token)
                return res.status(400).send("Missing token.");
  
            try
            {
                // Hash the token (since we store hashed values in DB)
                const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

                // Look up user with matching token
                const [results] = await db.query
                (
                    "SELECT * FROM users WHERE resetToken = ? AND resetTokenExpiry > ?",
                    [hashedToken, Date.now()]
                );
                if(results.length === 0) 
                    return res.status(400).send("Invalid or expired reset link.");
    
                res.send
                (`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <title>Reset Password</title>
                        </head>
                        <body>
                            <h2>Reset Your Password</h2>

                            <label for="new-password">New Password:</label>
                            <input type="password" id="new-password" required />

                            <button id="reset-btn">Reset Password</button>

                            <p id="message"></p>

                            <script>
                                document.getElementById("reset-btn").addEventListener("click", async () => {
                                    const newPassword = document.getElementById("new-password").value;

                                    const response = await fetch("/reset-password", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            token: "${token}",
                                            newPassword
                                        })
                                    });

                                    const text = await response.text();
                                    document.getElementById("message").innerText = text;
                                });
                            </script>
                        </body>
                    </html>
                `);
            }
            catch(err)
            {
                console.error("Error validating token:", err);
                res.status(500).send("Server error.");
            }
        });
        app.get("/scan-reports/:user_id", async (req, res) =>
        {//if here, client requested all the logged-in user's scan reports
            const {user_id} = req.params;//get the user's id

            if(!user_id)//if here, no user ID: inform client
                return res.status(400).send({success: false, message: "Missing user ID!"});

            try
            {
                const [reports] = await db.query//get the scan reports from the database
                (
                    `SELECT report_id, title, scanned_at, targets, exclusions, detection_options
                    FROM scan_reports
                    WHERE user_id = ?
                    ORDER BY scanned_at DESC`,
                    [user_id]
                );
                res.send({success: true, reports});//send reports to the client
            }
            catch(err)
            {//if here, error occured
                console.error("Error retrieving scan reports:", err);//log the error
                res.status(500).send({ success: false, message: "Server error!" });//inform client
            }
        });
        app.get("/scan-reports/:report_id/devices", async (req, res) =>
        {//if here, client requested devices from scan report
            const {report_id} = req.params;

            if(!report_id)//if here, no report ID: inform client
                return res.status(400).send({success: false, message: "Missing report_id"});

            try
            {
                const [devices] = await db.query//get the devices from the database
                (
                    `SELECT device_id, device_name, ip_address, services, protocol_warnings, notes, remediation_tips
                    FROM devices
                    WHERE report_id = ?
                    ORDER BY device_id ASC`,
                    [report_id]
                );
                res.send({success: true, devices});//send the devices to the client
            } 
            catch(err)
            {//if here, error in retrieving devices
                console.error("Error retrieving devices:", err);//log the error
                res.status(500).send({ success: false, message: "Server error!" });//inform client
            }
        });
        app.post("/send-email", async (req, res) =>
        { 
            const {email} = req.body;//get the recipiant's email from the request body
            
            if(!email)//no recipient email: return false
                return res.status(400).send({success: false, message: "Recipient email required!"});

            const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);//find email in database
            if(results.length === 0) 
                return res.status(404).send({success: false, message: "Email address not found!"});

            const token = crypto.randomBytes(32).toString("hex");//generate the token
            const hashedToken = crypto.createHash("sha256").update(token).digest("hex");//hash the token

            await db.query("UPDATE users SET resetToken = ?, resetTokenExpiry = ? WHERE email = ?",
            [//store the token
                hashedToken,
                Date.now() + 3600000,//1 hour expiry
                email,
            ]);
            
            try
            {
                const info = await transporter.sendMail//send the email through the transporter 
                ({
                    from: "vigil.iot.app@gmail.com",//sender address
                    to: email,//recipient address
                    subject: "Password Reset Requested",
                    html: `<p>Click the following link to reset your password:</p>
                           <p>
                               <a href="http://localhost:3000/get-reset-page?token=${token}">
                                   Reset Password
                            </a>
                        </p>`,
                    text: "Visit the following URL to reset your password:\n\n" +
                          `http://localhost:3000/get-reset-page?token=${token}`//plain text fallback
                }); 
                
                console.log("Email sent:", info.messageId);//log the email
                res.send({success: true});//return true
            }
            catch(err)
            {//if here, error in sending email
                console.error("Error sending email:", err);//log the error
                res.status(500).send({success: false, message: "Server error"});//return false
            }
        });
        app.post("/reset-password", async (req, res) =>
        {
            const {token, newPassword} = req.body;
            if(!token || !newPassword)
                return res.status(400).send("Missing token or new password."); 

            try
            {
                // Hash the token (since we store hashed tokens in DB)
                const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

                // Look up user with matching token and valid expiry
                const [results] = await db.query
                (
                    "SELECT * FROM users WHERE resetToken = ? AND resetTokenExpiry > ?",
                    [hashedToken, Date.now()]
                );

                if(results.length === 0)
                    return res.status(400).send("Invalid or expired reset token.");
    
                const user = results[0];

                // Hash the new password securely
                const hashedPassword = await bcrypt.hash(newPassword, 10);

                 // Update user’s password and clear reset token fields
                await db.query(
                    "UPDATE users SET hashed_password = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE user_id = ?",
                    [hashedPassword, user.user_id]
                );

                res.send("Password has been successfully reset.");
            }
            catch (err)
            {
                console.error("Error resetting password:", err);
                res.status(500).send("Server error.");
            }
        });
        app.delete("/delete-scan/:id", async (req, res) =>
        {//if here, user wants to delete a scan report
            const reportId = req.params.id;//get the report id from the request

            try
            {
                const [result] = //delete the report from the database
                    await db.query("DELETE FROM scan_reports WHERE report_id = ?",[reportId]);

                if(result.affectedRows === 0) //no rows affected (deletion failed): inform client
                    return res.status(404).send({success: false, message: "Report not found"});
                res.send({success: true});//deletion successful: inform client
            } 
            catch (err)
            {//if here, error in deletion
                console.error("Error deleting scan report:", err);//log the error
                res.status(500).send({success: false, message: "Server error"});//inform client
            }
        });
   
        app.listen(3000, () => console.log("Server running on port 3000"));//start server: prt 3000
    } 
    catch (err)
    {//if here, error in MySQL database initialization
        console.error("Database initialization failed:", err);//log the error to the console
    }
})();