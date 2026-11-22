const mongoose = require('mongoose');

const itemViewSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    viewedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Compound index for fast lookup + TTL auto-delete after 1 hour
itemViewSchema.index({ itemId: 1, userId: 1, viewedAt: 1 });
itemViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('ItemView', itemViewSchema);