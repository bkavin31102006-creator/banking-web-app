const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {

  try {

    const {
      name,
      email,
      password,
      phone
    } = req.body;

    if(!name || !email || !password || !phone){

      return res.status(400).json({
        message:'All fields required'
      });

    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if(existing.length > 0){

      return res.status(400).json({
        message:'Email already in use'
      });

    }

    const hashed = await bcrypt.hash(password, 10);

    const accountNumber =
      '4519' + Math.floor(
        10000000 + Math.random() * 90000000
      );

    const [result] = await pool.query(

      'INSERT INTO users (name, email, password, phone, account_number) VALUES (?, ?, ?, ?, ?)',

      [
        name,
        email,
        hashed,
        phone,
        accountNumber
      ]

    );

    res.status(201).json({

      message:'User registered',

      userId:result.insertId

    });

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};

exports.login = async (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;

    if(!email || !password){

      return res.status(400).json({
        message:'All fields required'
      });

    }

    const [rows] = await pool.query(

      'SELECT * FROM users WHERE email = ?',

      [email]

    );

    if(rows.length === 0){

      return res.status(400).json({
        message:'Invalid credentials'
      });

    }

    const user = rows[0];

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if(!match){

      return res.status(400).json({
        message:'Invalid credentials'
      });

    }

    const token = jwt.sign(

      {
        id:user.id
      },

      process.env.JWT_SECRET,

      {
        expiresIn:'1d'
      }

    );

    res.json({

      message:'Login successful',

      token

    });

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};

exports.profile = async (req, res) => {

  try {

    const [rows] = await pool.query(

      'SELECT id, name, email, phone, balance, account_number, created_at FROM users WHERE id = ?',

      [req.user.id]

    );

    if(rows.length === 0){

      return res.status(404).json({
        message:'User not found'
      });

    }

    res.json(rows[0]);

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};

exports.deposit = async (req, res) => {

  try {

    const { amount } = req.body;

    if(!amount || amount <= 0){

      return res.status(400).json({
        message:'Enter valid amount'
      });

    }

    await pool.query(

      'UPDATE users SET balance = balance + ? WHERE id = ?',

      [amount, req.user.id]

    );

    const [rows] = await pool.query(

      'SELECT balance FROM users WHERE id = ?',

      [req.user.id]

    );

    await pool.query(

      'INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)',

      [
        req.user.id,
        'deposit',
        amount,
        rows[0].balance,
        'Deposit'
      ]

    );

    res.json({

      message:'Deposit successful',

      balance:rows[0].balance

    });

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};

exports.withdraw = async (req, res) => {

  try {

    const { amount } = req.body;

    if(!amount || amount <= 0){

      return res.status(400).json({
        message:'Enter valid amount'
      });

    }

    const [rows] = await pool.query(

      'SELECT balance FROM users WHERE id = ?',

      [req.user.id]

    );

    if(rows[0].balance < amount){

      return res.status(400).json({
        message:'Insufficient balance'
      });

    }

    await pool.query(

      'UPDATE users SET balance = balance - ? WHERE id = ?',

      [amount, req.user.id]

    );

    const [updated] = await pool.query(

      'SELECT balance FROM users WHERE id = ?',

      [req.user.id]

    );

    await pool.query(

      'INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)',

      [
        req.user.id,
        'withdrawal',
        amount,
        updated[0].balance,
        'Withdrawal'
      ]

    );

    res.json({

      message:'Withdrawal successful',

      balance:updated[0].balance

    });

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};

exports.transfer = async (req, res) => {

  try {

    const {
      recipient_phone,
      amount
    } = req.body;

    if(!recipient_phone || !amount || amount <= 0){

      return res.status(400).json({
        message:'Invalid details'
      });

    }

    const [sender] = await pool.query(

      'SELECT balance FROM users WHERE id = ?',

      [req.user.id]

    );

    if(sender[0].balance < amount){

      return res.status(400).json({
        message:'Insufficient balance'
      });

    }

    const [recipient] = await pool.query(

      'SELECT id FROM users WHERE phone = ?',

      [recipient_phone]

    );

    if(recipient.length === 0){

      return res.status(404).json({
        message:'Recipient not found'
      });

    }

    await pool.query(

      'UPDATE users SET balance = balance - ? WHERE id = ?',

      [amount, req.user.id]

    );

    await pool.query(

      'UPDATE users SET balance = balance + ? WHERE id = ?',

      [amount, recipient[0].id]

    );

    const [updated] = await pool.query(

      'SELECT balance FROM users WHERE id = ?',

      [req.user.id]

    );

    await pool.query(

      'INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)',

      [
        req.user.id,
        'transfer',
        amount,
        updated[0].balance,
        'Transfer to ' + recipient_phone
      ]

    );

    res.json({

      message:'Transfer successful',

      balance:updated[0].balance

    });

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};

exports.transactions = async (req, res) => {

  try {

    const [rows] = await pool.query(

      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',

      [req.user.id]

    );

    res.json(rows);

  } catch(err){

    res.status(500).json({

      message:'Server error',

      error:err.message

    });

  }

};
