const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

// Get messages for a room (only participants can access)
router.get('/:roomId', protect, async (req, res, next) => {
    try {
        const { roomId } = req.params;

        // Verify user is part of room
        const userIds = roomId.split('_');
        if (!userIds.includes(req.user._id.toString())) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this conversation'
            });
        }

        const messages = await Message.find({ roomId })
            .populate('senderId', 'name')
            .sort({ createdAt: 1 })
            .limit(100);

        res.json({ success: true, messages });
    } catch (error) {
        next(error);
    }
});

module.exports = router;