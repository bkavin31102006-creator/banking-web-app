const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => {
    res.json({ message: 'Auth route works' });
});

const { register, login, profile, deposit, withdraw, transfer, transactions } = require('../controllers/authController');

const protect = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, profile);
router.post('/deposit', protect, deposit);
router.post('/withdraw', protect, withdraw);
router.post('/transfer', protect, transfer);
router.get('/transactions', protect, transactions);

module.exports = router;
