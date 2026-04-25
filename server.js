const express = require('express');
const pool = require('./config/db');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

pool.getConnection()
  .then(conn => {
    console.log('MySQL connected');
    conn.release();
  })
  .catch(err => console.error('DB error:', err));

app.use('/api/auth', require('./routes/auth'));

const PORT = 5000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));