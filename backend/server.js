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
app.use(cors());//tell express to allow cross-origin requests
app.use(bodyParser.json());//tell express to parse JSON requests through req.body
app.use(session//configure the session management
({
    secret: "your-secret-key",//strong secret key to sign the session ID cookie
    resave: false,//prevent session from being saved back to store if it wan't modified
    saveUninitialized: false,//don't save inmodified sessions
    cookie:
    {
        maxAge: 1000 * 60 * 60, //1 hour
        httpOnly: true,//https may be used too
        secure: false //Set to true if using HTTPS
    }
}));

const MYSQL_CONFIG =
{//specify the MySQL connection configuration (replace the user and password values with your own)
    host: "localhost",//specify the host
    user: "jackray1",//set the username
    password: "donthack"//set the password
};

async function initDatabase()//function to initialize the database
{
    const connection = await mysql.createConnection(MYSQL_CONFIG);//connect to MySQL server using
                                                                  //the configuration defined above
    await connection.query(`CREATE DATABASE IF NOT EXISTS vigil_iot`);//create db if non-existent
    await connection.query(`USE vigil_iot`);//use that db in this program

    //create the users table if it doesn't exist yet
    await connection.query(`CREATE TABLE IF NOT EXISTS users
    (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create scan_reports table if it doesn't exist yet
    await connection.query(`CREATE TABLE IF NOT EXISTS scan_reports
    (
        report_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        vulnerabilities TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`);

  return connection;//return the connection to the MySQL server
}//end function initDatabase

(async () => //the below try-catch sequence is asynchronous, meaning "await" can be used in it
{
    try
    {
        const db = await initDatabase();//define var to represent database using above function
    
        //set the routes that send responses according to client requests
        app.get("/session-check", (req, res) =>//client requested login status
        {//if here, client requested login status
            if(req.session.user)
                res.send({loggedIn: true, user: req.session.user});//user logged in: return true
            else 
                res.send({loggedIn: false});//user logged out: return false  
        });
        app.post("/register", async (req, res) =>
        {//if here, user wants to register: validate credentials.
            const {username, password} = req.body;//get credentials from request body

            try
            {
                //check if entered username already exists in database
                const [existingUsers] =
                    await db.query("SELECT * FROM users WHERE username = ?", [username]);
                if(existingUsers.length > 0)//if username taken, return false
                    return res.send({success: false, message: "Username already taken"});

                //if here, username not taken: proceed with registration
                const salt = await bycrypt.genSalt(10);//generate the salt
                const hashedPassword = await bcrypt.hash(password, salt);//hash password with salt

                await db.query//query database to insert new user
                (
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    [username, hashedPassword]
                );

                return res.send({ success: true });//indicate successful registration to client
            }
            catch (err)
            {//if here, registration error
                console.error("Registration error:", err);//log error to console
                return res.status(500).send("Server error");//indicate error to frontend
            }
        });
        app.post("/login", async (req, res) =>
        {//if here, user entered login credentials: validate them
            const {username, password} = req.body;//get the credentials from request body
            //encrypt password before checking it in database
            //wait for registration functionallity to be finished first
            try
            {
                const [results] = await db.query//find credentials in database
                (//below is the SQL query to do this
                    "SELECT * FROM users WHERE username = ? AND password_hash = ?",
                    [username, password]
                );
                if(results.length > 0)
                {
                    req.session.user = { username };// Store user info in session
                    return res.send({success: true});//credentials exist: return true
                }
                else
                    return res.send({success: false});//credentials invalid: return false
            } 
            catch (err) 
            {//if here, error in MySQL server
                console.error("Login query error:", err);//log the errir to the console
                return res.status(500).send("Server error");//indicate error to frontend
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
            const {user_id, device_info, vulnerabilities} = req.body;//get scan info from req body

            if(!user_id || !device_info || !vulnerabilities)//check required fields
                return res.status(400).send({success: false, message: "Missing required fields"});

            try
            {
                await db.query
                (//save scan to database
                    "INSERT INTO scan_reports (user_id, device_info, vulnerabilities) VALUES (?, ?, ?)",
                    [user_id, device_info, vulnerabilities]
                );
                res.send({success:true });
            }
            catch (err)
            {//if here, error in saving scan
                console.error("Error saving scan report:", err);//log error to console
                res.status(500).send({ success: false, message: "Server error" });//inform client
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