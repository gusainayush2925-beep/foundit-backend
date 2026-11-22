const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true, maxlength: 100 },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: {
        type: String,
        required: true,
        maxlength: 1000,
        trim: true
    },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);