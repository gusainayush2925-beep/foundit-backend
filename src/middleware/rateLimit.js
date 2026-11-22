// backend/src/middleware/rateLimit.js
// Simple in-memory rate limiter (no external dependencies)

const attempts = new Map();

// Cleanup old entries every 10 minutes (prevents memory leak)
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, rec] of attempts) {
        if (rec.firstAttempt < cutoff) attempts.delete(key);
    }
}, 10 * 60 * 1000).unref();

const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many attempts' } = {}) => {
    return (req, res, next) => {
        const identifier = req.body?.email || req.body?.username || 'anon';
        const key = `${req.ip}:${identifier}`;
        const now = Date.now();
        const record = attempts.get(key);

        if (!record || now - record.firstAttempt > windowMs) {
            attempts.set(key, { count: 1, firstAttempt: now });
            return next();
        }

        if (record.count >= max) {
            const remaining = Math.ceil((windowMs - (now - record.firstAttempt)) / 60000);
            return res.status(429).json({
                success: false,
                message: `${message}. Try again in ${remaining} minute(s).`
            });
        }

        record.count += 1;
        next();
    };
};

module.exports = rateLimit;