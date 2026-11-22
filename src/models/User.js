const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    rollNumber: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    branch: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    // Password Reset fields
    passwordResetOtp: { type: String, select: false },
    passwordResetOtpExpires: { type: Date, select: false }
}, { timestamps: true });

// Password hash
userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Password compare
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);