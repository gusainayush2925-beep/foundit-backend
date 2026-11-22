const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        maxlength: 500
    },
    category: {
        type: String,
        required: true,
        enum: ['Electronics', 'Wallet', 'ID Card', 'Books', 'Clothing', 'Accessories', 'Other']
    },
    type: {
        type: String,
        required: true,
        enum: ['lost', 'found']
    },
    location: {
        type: String,
        required: [true, 'Location is required']
    },
    date: {
        type: Date,
        default: Date.now
    },
    imageUrl: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['active', 'claimed', 'resolved', 'archived'],
        default: 'active'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    views: {
        type: Number,
        default: 0
    }
    // NOTE: 'viewers' map removed — using separate ItemView collection for scalability
}, { timestamps: true });

// Index for text search
itemSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Item', itemSchema);