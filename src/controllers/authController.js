const User = require('../models/User');
const OTPAttempt = require('../models/OTPAttempt');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const generateOTP = require('../utils/generateOTP');

const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESEND_ATTEMPTS = 3;
const MAX_RESET_ATTEMPTS = 3;
const MAX_RESET_VERIFY_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// ============ ATOMIC RATE LIMIT ============
async function checkAndIncrementRateLimit(email, action, maxAttempts) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    const normalizedEmail = email.toLowerCase();

    // Step 1: Reset expired window (atomic)
    await OTPAttempt.updateOne(
        { email: normalizedEmail, action, firstAttempt: { $lt: windowStart } },
        { $set: { count: 0, firstAttempt: now } }
    );

    // Step 2: Atomic increment with upsert
    const attempt = await OTPAttempt.findOneAndUpdate(
        { email: normalizedEmail, action },
        {
            $inc: { count: 1 },
            $set: { lastAttempt: now },
            $setOnInsert: { firstAttempt: now }
        },
        { upsert: true, new: true }
    );

    if (attempt.count > maxAttempts) {
        const remainingMs = WINDOW_MS - (now - attempt.firstAttempt.getTime());
        return {
            allowed: false,
            remainingMinutes: Math.max(1, Math.ceil(remainingMs / 60000))
        };
    }

    return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - attempt.count)
    };
}

async function clearRateLimit(email, action) {
    await OTPAttempt.deleteOne({ email: email.toLowerCase(), action });
}

// ============ REGISTER ============
exports.register = async (req, res, next) => {
    try {
        const { name, email, password, rollNumber, phone, branch, adminCode } = req.body;

        if (!name || !email || !password || !rollNumber || !phone || !branch) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        if (!/^[0-9]{10}$/.test(phone)) {
            return res.status(400).json({ success: false, message: 'Phone must be 10 digits' });
        }

        if (name.trim().length < 2 || name.trim().length > 50) {
            return res.status(400).json({ success: false, message: 'Name must be 2-50 characters' });
        }

        let finalRole = 'student';
        if (adminCode) {
            if (adminCode !== process.env.ADMIN_SECRET_CODE) {
                return res.status(403).json({ success: false, message: '❌ Invalid Admin Code' });
            }
            finalRole = 'admin';
            console.log('👑 Creating admin account:', email);
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanRoll = rollNumber.trim().toUpperCase();
        const cleanName = name.trim();
        const cleanBranch = branch.trim();

        const existingByEmail = await User.findOne({ email: cleanEmail });
        const existingByRoll = await User.findOne({ rollNumber: cleanRoll });

        if (existingByEmail) {
            if (existingByEmail.isVerified) {
                return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });
            }

            const rateCheck = await checkAndIncrementRateLimit(existingByEmail.email, 'resend', MAX_RESEND_ATTEMPTS);
            if (!rateCheck.allowed) {
                return res.status(429).json({
                    success: false,
                    message: `Too many resends. Try again in ${rateCheck.remainingMinutes} minutes.`
                });
            }

            const otp = generateOTP();
            existingByEmail.otp = otp;
            existingByEmail.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
            await existingByEmail.save();

            try {
                await sendEmail({
                    email: existingByEmail.email,
                    subject: 'FoundIt - New OTP',
                    html: `<div style="font-family:Arial;max-width:600px;margin:auto;padding:30px;">
                        <h2 style="color:#667eea;">FoundIt - Verify Email</h2>
                        <p>Your new verification code:</p>
                        <div style="font-size:42px;font-weight:800;color:#667eea;letter-spacing:8px;padding:20px;background:#f8fafc;border-radius:12px;text-align:center;">${otp}</div>
                        <p style="color:#64748b;font-size:14px;">Expires in 10 minutes.</p>
                    </div>`
                });
                return res.status(200).json({
                    success: true,
                    message: 'OTP resent to your email!',
                    email: existingByEmail.email,
                    userId: existingByEmail._id
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: 'Email failed. Try again.' });
            }
        }

        if (existingByRoll && existingByRoll.isVerified) {
            return res.status(400).json({ success: false, message: 'This roll number is already registered.' });
        }

        if (existingByRoll && !existingByRoll.isVerified && existingByRoll.email !== cleanEmail) {
            await User.findByIdAndDelete(existingByRoll._id);
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        const user = await User.create({
            name: cleanName,
            email: cleanEmail,
            password,
            rollNumber: cleanRoll,
            phone,
            branch: cleanBranch,
            otp,
            otpExpires,
            isVerified: false,
            role: finalRole
        });

        try {
            await sendEmail({
                email: user.email,
                subject: 'FoundIt - Verify Your Email',
                html: `<div style="font-family:Arial;max-width:600px;margin:auto;padding:30px;background:#f8fafc;border-radius:16px;">
                    <div style="text-align:center;margin-bottom:30px;">
                        <div style="display:inline-block;width:70px;height:70px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:20px;line-height:70px;font-size:36px;">🎒</div>
                        <h1 style="color:#667eea;margin-top:15px;">FoundIt</h1>
                    </div>
                    <h2 style="color:#0f172a;text-align:center;">Verify Your Email</h2>
                    <p style="color:#64748b;text-align:center;">Hi <b>${user.name}</b>, welcome!</p>
                    <div style="text-align:center;margin:30px 0;">
                        <div style="display:inline-block;font-size:42px;font-weight:800;color:#667eea;letter-spacing:8px;padding:20px 30px;background:white;border-radius:12px;">${otp}</div>
                    </div>
                    <p style="color:#64748b;font-size:14px;text-align:center;">Expires in 10 minutes.</p>
                </div>`
            });
        } catch (emailError) {
            await User.findByIdAndDelete(user._id);
            return res.status(500).json({ success: false, message: 'Email could not be sent. Try again.' });
        }

        res.status(201).json({
            success: true,
            message: finalRole === 'admin' ? '👑 Admin account created! Verify OTP.' : 'OTP sent to your email!',
            email: user.email,
            userId: user._id,
            role: finalRole
        });
    } catch (error) {
        next(error);
    }
};

// ============ VERIFY OTP ============
exports.verifyOTP = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP required' });
        }

        if (!/^[0-9]{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: 'OTP must be 6 digits' });
        }

        const rateCheck = await checkAndIncrementRateLimit(email, 'verify', MAX_VERIFY_ATTEMPTS);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                success: false,
                message: `Too many attempts. Try again in ${rateCheck.remainingMinutes} minutes.`
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+otp +otpExpires');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Email already verified' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: `Invalid OTP. ${rateCheck.remaining} attempts left.`
            });
        }

        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: 'OTP expired. Please resend.' });
        }

        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        await clearRateLimit(email, 'verify');

        const token = generateToken(user._id, user.role);

        res.json({
            success: true,
            message: 'Email verified!',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                rollNumber: user.rollNumber,
                phone: user.phone,
                branch: user.branch,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
};

// ============ RESEND OTP (Registration) ============
exports.resendOTP = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email required' });
        }

        const rateCheck = await checkAndIncrementRateLimit(email, 'resend', MAX_RESEND_ATTEMPTS);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                success: false,
                message: `Too many resends. Try again in ${rateCheck.remainingMinutes} minutes.`
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Already verified' });
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        try {
            await sendEmail({
                email: user.email,
                subject: 'FoundIt - New OTP',
                html: `<div style="font-family:Arial;max-width:600px;margin:auto;padding:30px;">
                    <h2 style="color:#667eea;">FoundIt - New OTP</h2>
                    <div style="font-size:42px;font-weight:800;color:#667eea;letter-spacing:8px;padding:20px;background:#f8fafc;border-radius:12px;text-align:center;">${otp}</div>
                    <p style="color:#64748b;font-size:14px;">Expires in 10 minutes.</p>
                </div>`
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Email failed. Try again.' });
        }

        res.json({ success: true, message: 'New OTP sent!' });
    } catch (error) {
        next(error);
    }
};

// ============ LOGIN ============
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (!user.isVerified) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email first',
                needsVerification: true,
                email: user.email
            });
        }

        const token = generateToken(user._id, user.role);

        res.json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                rollNumber: user.rollNumber,
                phone: user.phone,
                branch: user.branch,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
};

// ============ FORGOT PASSWORD (Step 1 — send OTP) ============
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email required' });
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        const rateCheck = await checkAndIncrementRateLimit(email, 'reset', MAX_RESET_ATTEMPTS);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                success: false,
                message: `Too many reset attempts. Try again in ${rateCheck.remainingMinutes} minutes.`
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        // Security: don't reveal if email exists (prevents user enumeration)
        if (!user) {
            return res.json({
                success: true,
                message: 'If this email is registered, an OTP has been sent.'
            });
        }

        if (!user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Please verify your email first. Check your registration email.'
            });
        }

        const otp = generateOTP();
        user.passwordResetOtp = otp;
        user.passwordResetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        try {
            await sendEmail({
                email: user.email,
                subject: 'FoundIt - Password Reset OTP',
                html: `<div style="font-family:Arial;max-width:600px;margin:auto;padding:30px;background:#f8fafc;border-radius:16px;">
                    <div style="text-align:center;margin-bottom:30px;">
                        <div style="display:inline-block;width:70px;height:70px;background:linear-gradient(135deg,#ef4444,#dc2626);border-radius:20px;line-height:70px;font-size:36px;">🔐</div>
                        <h1 style="color:#667eea;margin-top:15px;">FoundIt</h1>
                    </div>
                    <h2 style="color:#0f172a;text-align:center;">Password Reset Request</h2>
                    <p style="color:#64748b;text-align:center;">Hi <b>${user.name}</b>,</p>
                    <p style="color:#64748b;text-align:center;">Use this OTP to reset your password:</p>
                    <div style="text-align:center;margin:30px 0;">
                        <div style="display:inline-block;font-size:42px;font-weight:800;color:#ef4444;letter-spacing:8px;padding:20px 30px;background:white;border-radius:12px;border:2px dashed #ef4444;">${otp}</div>
                    </div>
                    <p style="color:#64748b;font-size:14px;text-align:center;">Expires in <b>10 minutes</b>.</p>
                    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:30px;">If you didn't request this, ignore this email. Your password won't change.</p>
                </div>`
            });
        } catch (err) {
            // Rollback OTP if email failed
            user.passwordResetOtp = undefined;
            user.passwordResetOtpExpires = undefined;
            await user.save();
            return res.status(500).json({ success: false, message: 'Email failed. Try again.' });
        }

        res.json({
            success: true,
            message: 'OTP sent to your email!',
            email: user.email
        });
    } catch (error) {
        next(error);
    }
};

// ============ RESET PASSWORD (Step 2 — verify OTP + new password) ============
exports.resetPassword = async (req, res, next) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email, OTP, and new password required' });
        }

        if (!/^[0-9]{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: 'OTP must be 6 digits' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const rateCheck = await checkAndIncrementRateLimit(email, 'reset-verify', MAX_RESET_VERIFY_ATTEMPTS);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                success: false,
                message: `Too many attempts. Try again in ${rateCheck.remainingMinutes} minutes.`
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() })
            .select('+passwordResetOtp +passwordResetOtpExpires');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.passwordResetOtp || !user.passwordResetOtpExpires) {
            return res.status(400).json({
                success: false,
                message: 'No reset request found. Please request a new OTP.'
            });
        }

        if (user.passwordResetOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: `Invalid OTP. ${rateCheck.remaining} attempts left.`
            });
        }

        if (user.passwordResetOtpExpires < Date.now()) {
            user.passwordResetOtp = undefined;
            user.passwordResetOtpExpires = undefined;
            await user.save();
            return res.status(400).json({
                success: false,
                message: 'OTP expired. Please request a new one.'
            });
        }

        // Update password (will be hashed by pre-save hook)
        user.password = newPassword;
        user.passwordResetOtp = undefined;
        user.passwordResetOtpExpires = undefined;
        await user.save();

        // Clear rate limits
        await clearRateLimit(email, 'reset');
        await clearRateLimit(email, 'reset-verify');

        res.json({
            success: true,
            message: 'Password reset successful! Please login with your new password.'
        });
    } catch (error) {
        next(error);
    }
};