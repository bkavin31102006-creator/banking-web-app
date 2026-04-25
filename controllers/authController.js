const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'mysupersecretkey123';

function genAccNo(){
  return 'BANK '+Math.floor(1000+Math.random()*9000)+' '+Math.floor(1000+Math.random()*9000);
}

exports.register = async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;
    if(!mobile||mobile.length!==10||!/^[0-9]+$/.test(mobile)) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ message: 'Email already in use' });
    const [mobExist] = await pool.query('SELECT id FROM users WHERE mobile = ?', [mobile]);
    if (mobExist.length > 0) return res.status(400).json({ message: 'Mobile number already in use' });
    const hashed = await bcrypt.hash(password, 10);
    const account_number = genAccNo();
    const [result] = await pool.query('INSERT INTO users (name, email, password, mobile, account_number) VALUES (?, ?, ?, ?, ?)', [name, email, hashed, mobile, account_number]);
    res.status(201).json({ message: 'User registered', userId: result.insertId });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Wrong password' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, balance: user.balance, account_number: user.account_number } });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.profile = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, balance, account_number, mobile, created_at FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];
    const acc = user.account_number;
    user.account_number_hidden = acc ? acc.slice(0,5)+'****' : 'N/A';
    res.json(user);
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.deposit = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    await pool.query('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, req.userId]);
    await pool.query('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [req.userId, 'deposit', amount, 'Deposit']);
    const [rows] = await pool.query('SELECT balance FROM users WHERE id = ?', [req.userId]);
    res.json({ message: 'Deposit successful', balance: rows[0].balance });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    const [rows] = await pool.query('SELECT balance FROM users WHERE id = ?', [req.userId]);
    if (rows[0].balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    await pool.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.userId]);
    await pool.query('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [req.userId, 'withdrawal', amount, 'Withdrawal']);
    const [updated] = await pool.query('SELECT balance FROM users WHERE id = ?', [req.userId]);
    res.json({ message: 'Withdrawal successful', balance: updated[0].balance });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.transfer = async (req, res) => {
  try {
    const { mobile, amount } = req.body;
    if (!mobile||mobile.length!==10||!/^[0-9]+$/.test(mobile)) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    const [sender] = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (sender[0].balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    if (sender[0].mobile === mobile) return res.status(400).json({ message: 'Cannot transfer to yourself' });
    const [receiver] = await pool.query('SELECT * FROM users WHERE mobile = ?', [mobile]);
    if (receiver.length === 0) return res.status(404).json({ message: 'No user found with that mobile number' });
    await pool.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.userId]);
    await pool.query('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, receiver[0].id]);
    await pool.query('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [req.userId, 'transfer_out', amount, 'Transfer to '+receiver[0].name]);
    await pool.query('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [receiver[0].id, 'transfer_in', amount, 'Transfer from '+sender[0].name]);
    const [updated] = await pool.query('SELECT balance FROM users WHERE id = ?', [req.userId]);
    res.json({ message: 'Transfer successful to '+receiver[0].name, balance: updated[0].balance });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.transactions = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.userId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.stats = async (req, res) => {
  try {
    const [dep] = await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND type = ?', [req.userId, 'deposit']);
    const [with2] = await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND type = ?', [req.userId, 'withdrawal']);
    const [tout] = await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND type = ?', [req.userId, 'transfer_out']);
    res.json({ totalDeposited: dep[0].total, totalWithdrawn: with2[0].total, totalTransferred: tout[0].total });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};

exports.changepassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    const match = await bcrypt.compare(oldPassword, rows[0].password);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.userId]);
    res.json({ message: 'Password updated' });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
};