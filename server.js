require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const pool = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

pool.getConnection()
  .then(conn => {
    console.log('MySQL connected');
    conn.release();
  })
  .catch(err => console.error('DB error:', err));

console.log('Loading auth routes...');
app.use('/api/auth', require('./routes/auth'));
console.log('Auth routes loaded');

app.get('/', (req, res) => {
  res.json({ message: 'Banking API is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
