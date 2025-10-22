const express = require('express');
const mysql = require('mysql2/promise'); // switched to promise-based API
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'comp440'
};

const DB_NAME = 'vigil_iot';

async function initializeDatabase() {
  const connection = await mysql.createConnection(MYSQL_CONFIG);

  // Create database if it doesn't exist
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
  await connection.query(`USE ${DB_NAME}`);

  // Create users table if it doesn't exist
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create scan_reports table if it doesn't exist
  await connection.query(`
    CREATE TABLE IF NOT EXISTS scan_reports (
      report_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      device_info TEXT,
      vulnerabilities TEXT,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  return connection;
}

(async () => {
  try {
    const db = await initializeDatabase();

    app.post('/login', async (req, res) => {
      const { username, password } = req.body;
      try {
        const [results] = await db.query(
          'SELECT * FROM users WHERE username = ? AND password_hash = ?',
          [username, password]
        );
        if (results.length > 0) return res.send({ success: true });
        else return res.send({ success: false });
      } catch (err) {
        console.error('Login query error:', err);
        return res.status(500).send('Server error');
      }
    });

    app.listen(3001, () => console.log('Server running on port 3001'));
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
})();