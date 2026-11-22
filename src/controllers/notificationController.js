const Notification = require('../models/Notification');

exports.getNotifications = async (req, res, next) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            userId: req.user._id,
            isRead: false
        });

        res.json({ success: true, unreadCount, notifications });
    } catch (error) {
        next(error);
    }
};

exports.markAsRead = async (req, res, next) => {
    try {
        const result = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, notification: result });
    } catch (error) {
        next(error);
    }
};

exports.markAllAsRead = async (req, res, next) => {
    try {
        const result = await Notification.updateMany(
            { userId: req.user._id, isRead: false },
            { isRead: true }
        );
        res.json({ success: true, modified: result.modifiedCount });
    } catch (error) {
        next(error);
    }
};