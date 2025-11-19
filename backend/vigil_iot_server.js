/*File: server.js
  Programmer: Kevin Volkov
  File Description: This file contains all the server-side code of the Vigil-IoT Node.js express
                    app. It defines the database schema, creates the MySQL database itself if it
                    doesn't exist yet, defines the routes that the frontend can access via GET and
                    POST requests, and starts the server on the localhost.*/
//import dependencies
const express = require("express");//Express is the minimal app framework of Node.js
const mysql = require("mysql2/promise");//library for connecting JS to MySQL database with promises
const bodyParser = require("body-parser");//Body Parser middleware to read from POST requests
const cors = require("cors");//CORS middleware to allow cross-origin requests
const session = require("express-session");//middleware for tracking user sessions and login status.
const bcrypt = require("bcrypt");//to store passwords as salted hashes

const app = express();//create Express app instance defining routes, middleware, server behavior

//configure the middleware
app.use(cors({
    origin: true,//reflect the request origin for dev servers
    credentials: true//allow session cookies cross-origin
}));//tell express to allow cross-origin requests
app.use(bodyParser.json());//tell express to parse JSON requests through req.body
app.use(session//configure the session management
({
    secret: "your-secret-key",//strong secret key to sign the session ID cookie
    resave: false,//prevent session from being saved back to store if it wan't modified
    saveUninitialized: false,//don't save inmodified sessions
    cookie:
    {
        maxAge: 1000 * 60 * 60,//1 hour max age
        httpOnly: true,//https may not be used yet
        secure: false //Set to true if using HTTPS
    }
}));

const MYSQL_CONFIG = //specify the MySQL connection configuration (replace the user and password
{                    //values with your own)
    host: "localhost",//specify the host
    user: "jackray1",//set the username
    password: "donthack"//set the password
};

async function initDatabase()//function to initialize the database
{
    const connection = await mysql.createConnection(MYSQL_CONFIG);//connect to MySQL database
    await connection.query(`CREATE DATABASE IF NOT EXISTS vigil_iot`);//create db if non-existent
    await connection.query(`USE vigil_iot`);//use that db in this program

    //create the users table if it doesn't exist yet
    await connection.query(`CREATE TABLE IF NOT EXISTS users
    (
        user_id INT AUTO_INCREMENT PRIMARY KEY, -- user ID field: auto-increment from previous user
        email VARCHAR(100) UNIQUE NOT NULL, -- email field: max 100 chars, unique and non-empty
        hashed_password VARCHAR(255) NOT NULL -- hashed password field: max 255 chars and non-empty
    )`);

    //create scan_reports table if it doesn't exist yet
    await connection.query(`CREATE TABLE IF NOT EXISTS scan_reports
    (
        report_id INT AUTO_INCREMENT PRIMARY KEY, -- report ID field: auto-increment from previous
        title VARCHAR(100) NOT NULL, -- title of the scan report
        scanned_at DATETIME NOT NULL, -- time at which the scan was performed
        targets TEXT NOT NULL, -- IPs or hostnames targeted in the scan
        exclusions TEXT, -- IPs or hostnames excluded from the scan (optional)
        detection_options TEXT, -- options used during scan (e.g., host discovery, service detection)
        user_id INT NOT NULL, -- ID of user who owns this report
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE -- define as foreign key
    )`);

    //create devices table if it doesn't exist yet
    await connection.query(`CREATE TABLE IF NOT EXISTS devices
    (
        device_id INT AUTO_INCREMENT PRIMARY KEY, -- device ID field: auto-increment from previous
        device_name VARCHAR(100), -- name of the device
        protocol_warnings TEXT, -- protocol warnings field for vulnerability type
        services TEXT, -- lists the services used in device discovery
        ip_address VARCHAR(45), -- IP address of the device
        notes TEXT, -- additional notes
        remediation_tips TEXT, -- explains tips to manage vulnerability
        report_id INT NOT NULL, -- ID of report that lists this device
        FOREIGN KEY (report_id) REFERENCES scan_reports(report_id) ON DELETE CASCADE -- foreign key
    )`);

  return connection;//return the connection to the MySQL server
}//end function initDatabase

(async () => //the below try-catch sequence is asynchronous, meaning "await" can be used in it
{
    try
    {
        const db = await initDatabase();//define var to represent database using above function
    
        //set the routes that send responses according to client requests
        app.get("/check_login", (req, res) =>//client requested login status
        {//if here, client requested login status
            if(req.session.user)
                res.send({loggedIn: true, user: req.session.user});//user logged in: return true
            else 
                res.send({loggedIn: false});//user logged out: return false  
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
        app.post("/register", async (req, res) =>
        {//if here, user wants to register: validate credentials.
            const {email, password} = req.body;//get credentials from request body

            try
            {
                //check if entered email already exists in database
                const [existingUsers] =
                    await db.query("SELECT * FROM users WHERE email = ?", [email]);
                if(existingUsers.length > 0)//if email taken, return false
                    return res.send({success: false, message: "email already taken"});

                //if here, email not taken: proceed with registration
                const hashedPassword = await bcrypt.hash(password, 10);//hash the password

                await db.query//query database to insert new user
                (
                    "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
                    [email, hashedPassword]
                );

                return res.send({ success: true });//indicate successful registration to client
            }
            catch (err)
            {//if here, registration error
                console.error("Registration error:", err);//log error to console
                return res.status(500).send("Server error");//indicate error to frontend
            }
        });
        app.post("/login", async (req, res) => {
            const { email, password } = req.body;

            try
            {   //find email in database
                const [results] = await db.query("SELECT * FROM users WHERE email = ?",[email]);

                if(results.length === 0)//email not found: return false
                    return res.send({ success: false, message: "Invalid credentials" });

                const user = results[0];//save the email

                //Compare entered password with stored hash
                const passwordMatch = await bcrypt.compare(password, user.hashed_password);

                if(passwordMatch) 
                {//passwords match: return true and create session
                    const sessionUser = { user_id: user.user_id, email: user.email };
                    req.session.user = sessionUser;
                    return res.send({ success: true, user: sessionUser });
                } 
                else//passwords don't match: return false
                    return res.send({ success: false, message: "Invalid credentials" });
    
            }
            catch (err)
            {//if here, database error
                console.error("Login query error:", err);//log the error
                return res.status(500).send("Server error");//return status 500 to client
            }
        });
        app.post("/logout", (req, res) =>
        {//if here, user wants to log out
            req.session.destroy(err =>//destroy the session
            {
                if(err) 
                    return res.status(500).send("Logout failed");//logout error: inform client
                res.send({success: true});//logout sucessful: inform client
            });
        });
        app.post("/save-scan", async (req, res) =>
		{//if here, user wants to save scan report
            const sessionUserId = req.session?.user?.user_id || null;
            const {
                user_id: userIdFromBody,
                title,
                scanned_at,
                targets,
                exclusions,
                detection_options,
                devices
            } = req.body;
            const user_id = userIdFromBody || sessionUserId;

            if(!user_id || !title || !scanned_at || !targets)//check required fields  
		        return res.status(400).send({success: false, message: "Missing required fields!"});
    
            try
			{
                const [reportResult] = await db.query
				(
                    `INSERT INTO scan_reports 
                    (user_id, title, scanned_at, targets, exclusions, detection_options) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [user_id, title, scanned_at, targets, exclusions || null, detection_options || null]
                );

                const report_id = reportResult.insertId;//get the auto-generated report_id

                if(Array.isArray(devices) && devices.length > 0)//insert devices if provided
		        {
                    for (const device of devices)
			        {
                        const {device_name,ip_address,services,protocol_warnings,notes,remediation_tips} = device;

                        await db.query
				        (
                            `INSERT INTO devices 
                            (report_id, device_name, ip_address, services, protocol_warnings, notes, remediation_tips) 
                            VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [
                                report_id,
                                device_name || null,
                                ip_address || null,
                                services || null,
                                protocol_warnings || null,
                                notes || null,
                                remediation_tips || null
                            ]
                        );
                    }
                }
		
                res.send({ success: true, report_id });
            }
	        catch (err)
	        {
                console.error("Error saving scan report:", err);
                res.status(500).send({ success: false, message: "Server error" });
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
   
        app.listen(3001, () => console.log("Server running on port 3001"));//start server: prt 3001
    } 
    catch (err)
    {//if here, error in MySQL database initialization
        console.error("Database initialization failed:", err);//log the error to the console
    }
})();
