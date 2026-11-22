const mongoose = require('mongoose');
const Claim = require('../models/Claim');
const Item = require('../models/Item');
const Notification = require('../models/Notification');

// ============ CREATE CLAIM ============
exports.createClaim = async (req, res, next) => {
    try {
        const { itemId, message, proofDescription } = req.body;

        if (!itemId || !message) {
            return res.status(400).json({ success: false, message: 'Item ID and message required' });
        }

        if (message.length > 500 || (proofDescription && proofDescription.length > 500)) {
            return res.status(400).json({ success: false, message: 'Message too long (max 500 chars)' });
        }

        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (item.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Item already resolved' });
        }

        if (item.userId.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot claim your own item' });
        }

        const existing = await Claim.findOne({ itemId, claimantId: req.user._id });

        if (existing) {
            if (existing.status === 'rejected') {
                existing.message = message.substring(0, 500);
                existing.proofDescription = (proofDescription || '').substring(0, 500);
                existing.status = 'pending';
                existing.respondedAt = null;
                await existing.save();

                Notification.create({
                    userId: item.userId,
                    title: '🔔 New Claim Request',
                    message: `${req.user.name} resubmitted claim for "${item.title}"`,
                    type: 'claim',
                    relatedId: existing._id
                }).catch(() => {});

                return res.json({ success: true, message: 'Claim resubmitted!', claim: existing });
            }
            return res.status(400).json({ success: false, message: 'Already claimed this item' });
        }

        const claim = await Claim.create({
            itemId,
            claimantId: req.user._id,
            ownerId: item.userId,
            message: message.substring(0, 500),
            proofDescription: (proofDescription || '').substring(0, 500)
        });

        Notification.create({
            userId: item.userId,
            title: '🔔 New Claim Request',
            message: `${req.user.name} claims your item "${item.title}"`,
            type: 'claim',
            relatedId: claim._id
        }).catch(() => {});

        res.status(201).json({ success: true, message: 'Claim submitted!', claim });
    } catch (error) {
        next(error);
    }
};

// ============ GET RECEIVED CLAIMS ============
exports.getReceivedClaims = async (req, res, next) => {
    try {
        const claims = await Claim.find({ ownerId: req.user._id })
            .populate('claimantId', 'name phone branch')
            .populate('itemId', 'title description imageUrl type')
            .sort({ createdAt: -1 });
        res.json({ success: true, claims });
    } catch (error) {
        next(error);
    }
};

// ============ GET MY CLAIMS ============
exports.getMyClaims = async (req, res, next) => {
    try {
        const claims = await Claim.find({ claimantId: req.user._id })
            .populate('ownerId', 'name phone')
            .populate('itemId', 'title description imageUrl type')
            .sort({ createdAt: -1 });
        res.json({ success: true, claims });
    } catch (error) {
        next(error);
    }
};

// ============ RESPOND TO CLAIM (with transaction) ============
exports.respondToClaim = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { status } = req.body;

        if (!['accepted', 'rejected'].includes(status)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const claim = await Claim.findById(req.params.id).session(session);
        if (!claim) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Claim not found' });
        }

        if (claim.ownerId.toString() !== req.user._id.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (claim.status !== 'pending') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: `Claim already ${claim.status}`
            });
        }

        if (status === 'accepted') {
            // Atomically update item status
            const item = await Item.findOneAndUpdate(
                { _id: claim.itemId, status: 'active' },
                { status: 'resolved' },
                { new: true, session }
            );

            if (!item) {
                await session.abortTransaction();
                session.endSession();
                return res.status(409).json({
                    success: false,
                    message: 'Item was resolved by another claim'
                });
            }

            // Reject all other pending claims
            await Claim.updateMany(
                { itemId: claim.itemId, _id: { $ne: claim._id }, status: 'pending' },
                { status: 'rejected', respondedAt: Date.now() },
                { session }
            );
        }

        claim.status = status;
        claim.respondedAt = Date.now();
        await claim.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Notification (outside transaction)
        Notification.create({
            userId: claim.claimantId,
            title: status === 'accepted' ? '✅ Claim Accepted!' : '❌ Claim Rejected',
            message: `Your claim has been ${status}`,
            type: 'claim_response',
            relatedId: claim._id
        }).catch(() => {});

        res.json({ success: true, message: `Claim ${status}`, claim });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};