const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Optional auth: if valid token present, set req.user. Otherwise continue as guest.
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId).select('-password');
                if (user) req.user = user;
            } catch (err) {
                // Invalid/expired token — continue as guest
            }
        }
        next();
    } catch (err) {
        next();
    }
};

module.exports = optionalAuth;