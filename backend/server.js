const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({//set this to your own MySQL credentials before running
  host: 'localhost',
  user: 'root',
  password: 'comp440',
  database: 'vigil_iot'
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query(
    'SELECT * FROM users WHERE username = ? AND password_hash = ?',
    [username, password],
    (err, results) => {
      if (err) return res.status(500).send('Server error');
      if (results.length > 0) return res.send({ success: true });
      else return res.send({ success: false });
    }
  );
});

app.listen(3001, () => console.log('Server running on port 3001'));