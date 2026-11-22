const mongoose = require('mongoose');

const otpAttemptSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    action: {
        type: String,
        enum: ['verify', 'resend', 'reset', 'reset-verify'],
        required: true
    },
    count: { type: Number, default: 1 },
    firstAttempt: { type: Date, default: Date.now },
    lastAttempt: { type: Date, default: Date.now }
}, { timestamps: true });

otpAttemptSchema.index({ email: 1, action: 1 }, { unique: true });

// TTL index - auto delete after 1 hour
otpAttemptSchema.index({ firstAttempt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('OTPAttempt', otpAttemptSchema);