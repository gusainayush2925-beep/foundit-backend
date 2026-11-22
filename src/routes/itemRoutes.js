const express = require('express');
const router = express.Router();
const {
    createItem, getAllItems, getMyItems, getItemById,
    updateItem, deleteItem, getStats
} = require('../controllers/itemController');
const { protect } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');

router.get('/stats', getStats);
router.get('/', getAllItems);
router.get('/my', protect, getMyItems);
router.get('/:id', optionalAuth, getItemById);
router.post('/', protect, createItem);
router.put('/:id', protect, updateItem);
router.delete('/:id', protect, deleteItem);

module.exports = router;