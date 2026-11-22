const User = require('../models/User');
const Item = require('../models/Item');
const Claim = require('../models/Claim');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const ItemView = require('../models/ItemView');
const OTPAttempt = require('../models/OTPAttempt');

exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, count: users.length, users });
    } catch (error) {
        next(error);
    }
};

// Delete user + cascade cleanup
exports.deleteUser = async (req, res, next) => {
    try {
        const userId = req.params.id;

        // Prevent admin from deleting themselves
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userItems = await Item.find({ userId }).select('_id');
        const itemIds = userItems.map(i => i._id);

        await Promise.all([
            User.findByIdAndDelete(userId),
            Item.deleteMany({ userId }),
            Claim.deleteMany({
                $or: [
                    { claimantId: userId },
                    { ownerId: userId },
                    { itemId: { $in: itemIds } }
                ]
            }),
            Notification.deleteMany({
                $or: [
                    { userId },
                    { relatedId: { $in: itemIds } }
                ]
            }),
            Message.deleteMany({
                $or: [{ senderId: userId }, { receiverId: userId }]
            }),
            ItemView.deleteMany({
                $or: [{ userId }, { itemId: { $in: itemIds } }]
            }),
            OTPAttempt.deleteMany({ email: user.email })
        ]);

        res.json({ success: true, message: 'User and all data deleted' });
    } catch (error) {
        next(error);
    }
};

exports.getStats = async (req, res, next) => {
    try {
        const [totalUsers, totalItems, totalLost, totalFound, resolved, pendingClaims] = await Promise.all([
            User.countDocuments(),
            Item.countDocuments(),
            Item.countDocuments({ type: 'lost' }),
            Item.countDocuments({ type: 'found' }),
            Item.countDocuments({ status: 'resolved' }),
            Claim.countDocuments({ status: 'pending' })
        ]);

        const categoryStats = await Item.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers, totalItems, totalLost, totalFound,
                resolved, pendingClaims, categoryStats
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getAllItems = async (req, res, next) => {
    try {
        const items = await Item.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });
        res.json({ success: true, count: items.length, items });
    } catch (error) {
        next(error);
    }
};