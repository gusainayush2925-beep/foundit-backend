const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    // Duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({
            success: false,
            message: `${field} already exists`
        });
    }

    // Validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: messages.join(', ')
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired' });
    }

    // Don't leak internal errors in production
    const isDev = process.env.NODE_ENV === 'development';
    res.status(err.statusCode || 500).json({
        success: false,
        message: isDev ? err.message : 'Something went wrong. Please try again.'
    });
};

module.exports = errorHandler;