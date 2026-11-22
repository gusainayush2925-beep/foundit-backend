const Item = require('../models/Item');
const ItemView = require('../models/ItemView');
const Notification = require('../models/Notification');
const { findMatches } = require('../utils/aiMatcher');

const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const PUBLIC_USER_FIELDS = 'name branch';

// ============ CREATE ITEM ============
exports.createItem = async (req, res, next) => {
    try {
        const { title, description, category, type, location, imageUrl, date } = req.body;

        if (!title || !description || !category || !type || !location) {
            return res.status(400).json({ success: false, message: 'All fields required' });
        }

        if (!['lost', 'found'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        // ============ IMAGE VALIDATION ============
        if (imageUrl) {
            if (imageUrl.length > 2800000) {
                return res.status(400).json({ success: false, message: 'Image too large (max 2MB)' });
            }
            const isBase64Image = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(imageUrl);
            const isHttpUrl = /^https?:\/\//i.test(imageUrl);
            if (!isBase64Image && !isHttpUrl) {
                return res.status(400).json({ success: false, message: 'Invalid image format' });
            }
        }

        const item = await Item.create({
            title: title.trim().substring(0, 100),
            description: description.trim().substring(0, 500),
            category,
            type,
            location: location.trim().substring(0, 100),
            imageUrl: (imageUrl || '').substring(0, 2800000),
            date: date || Date.now(),
            userId: req.user._id
        });

        // AI Matching
        const allItems = await Item.find({ status: 'active' }).populate('userId', 'name phone');
        const matches = await findMatches(item, allItems);

        matches
            .filter(m => m.score >= 50)
            .forEach(m => {
                Notification.create({
                    userId: m.item.userId._id,
                    title: '🎯 Possible Match Found!',
                    message: `Your item "${m.item.title}" might match "${item.title}" (${m.score}%)`,
                    type: 'match',
                    relatedId: item._id
                }).catch(() => {});
            });

        res.status(201).json({
            success: true,
            message: 'Item posted!',
            item,
            matches: matches.map(m => ({ item: m.item, score: m.score }))
        });
    } catch (error) {
        next(error);
    }
};

// ============ GET ALL ITEMS (paginated, no phone) ============
exports.getAllItems = async (req, res, next) => {
    try {
        const { type, category, search, page = 1, limit = 20 } = req.query;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
        const skip = (pageNum - 1) * limitNum;

        let query = { status: 'active' };
        if (type && type !== 'all') query.type = type;
        if (category && category !== 'all') query.category = category;

        if (search) {
            const escaped = escapeRegex(search.trim());
            query.$or = [
                { title: { $regex: escaped, $options: 'i' } },
                { description: { $regex: escaped, $options: 'i' } },
                { location: { $regex: escaped, $options: 'i' } }
            ];
        }

        const total = await Item.countDocuments(query);
        const items = await Item.find(query)
            .populate('userId', PUBLIC_USER_FIELDS)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        res.json({
            success: true,
            count: items.length,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            items
        });
    } catch (error) {
        next(error);
    }
};

// ============ GET MY ITEMS ============
exports.getMyItems = async (req, res, next) => {
    try {
        const items = await Item.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, count: items.length, items });
    } catch (error) {
        next(error);
    }
};

// ============ GET ITEM BY ID (optional auth + smart view tracking) ============
exports.getItemById = async (req, res, next) => {
    try {
        const item = await Item.findById(req.params.id)
            .populate('userId', 'name branch phone');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const isOwner = req.user && item.userId._id.toString() === req.user._id.toString();

        // Smart view tracking
        if (req.user) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentView = await ItemView.findOne({
                itemId: item._id,
                userId: req.user._id,
                viewedAt: { $gte: oneHourAgo }
            });

            if (!recentView) {
                await ItemView.create({ itemId: item._id, userId: req.user._id });
                await Item.updateOne({ _id: item._id }, { $inc: { views: 1 } });
                item.views += 1;
            }
        } else {
            await Item.updateOne({ _id: item._id }, { $inc: { views: 1 } });
            item.views += 1;
        }

        // Phone privacy
        const itemObj = item.toObject();
        if (!isOwner) {
            let showPhone = false;

            if (req.user) {
                const Claim = require('../models/Claim');
                const activeClaim = await Claim.findOne({
                    itemId: item._id,
                    claimantId: req.user._id,
                    status: 'accepted'
                });
                showPhone = !!activeClaim;
            }

            if (!showPhone) {
                itemObj.userId = {
                    _id: itemObj.userId._id,
                    name: itemObj.userId.name,
                    branch: itemObj.userId.branch
                };
            }
        }

        // AI matches
        const allItems = await Item.find({ status: 'active' }).populate('userId', 'name');
        const matches = await findMatches(item, allItems);

        res.json({
            success: true,
            item: itemObj,
            matches: matches.map(m => ({ item: m.item, score: m.score }))
        });
    } catch (error) {
        next(error);
    }
};

// ============ UPDATE ITEM ============
exports.updateItem = async (req, res, next) => {
    try {
        let item = await Item.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (item.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const allowed = ['title', 'description', 'category', 'location', 'status', 'imageUrl'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (updates.status && !['active', 'claimed', 'resolved', 'archived'].includes(updates.status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        item = await Item.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true
        });

        res.json({ success: true, message: 'Updated', item });
    } catch (error) {
        next(error);
    }
};

// ============ DELETE ITEM (cascade) ============
exports.deleteItem = async (req, res, next) => {
    try {
        const item = await Item.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (item.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const Claim = require('../models/Claim');
        await Claim.deleteMany({ itemId: req.params.id });
        await Notification.deleteMany({ relatedId: req.params.id });
        await ItemView.deleteMany({ itemId: req.params.id });
        await item.deleteOne();

        res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
        next(error);
    }
};

// ============ GET STATS ============
exports.getStats = async (req, res, next) => {
    try {
        const [totalItems, totalLost, totalFound, resolved] = await Promise.all([
            Item.countDocuments({ status: { $ne: 'archived' } }),
            Item.countDocuments({ type: 'lost', status: 'active' }),
            Item.countDocuments({ type: 'found', status: 'active' }),
            Item.countDocuments({ status: 'resolved' })
        ]);

        res.json({
            success: true,
            stats: { totalItems, totalLost, totalFound, resolved }
        });
    } catch (error) {
        next(error);
    }
};