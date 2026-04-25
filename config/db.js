const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'kavin2006',
  database: 'bankingapp',
});

module.exports = pool;