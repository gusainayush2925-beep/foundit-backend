const express = require('express');
const router = express.Router();
const {
    register, login, verifyOTP, resendOTP,
    forgotPassword, resetPassword
} = require('../controllers/authController');
const rateLimit = require('../middleware/rateLimit');

router.post(
    '/register',
    rateLimit({ max: 5, windowMs: 15 * 60 * 1000, message: 'Too many registration attempts' }),
    register
);

router.post(
    '/login',
    rateLimit({ max: 10, windowMs: 15 * 60 * 1000, message: 'Too many login attempts' }),
    login
);

router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);

// ============ YEH 2 LINES MISSING THI ============
router.post(
    '/forgot-password',
    rateLimit({ max: 5, windowMs: 15 * 60 * 1000, message: 'Too many password reset requests' }),
    forgotPassword
);

router.post(
    '/reset-password',
    rateLimit({ max: 10, windowMs: 15 * 60 * 1000, message: 'Too many reset attempts' }),
    resetPassword
);
// ================================================

module.exports = router;