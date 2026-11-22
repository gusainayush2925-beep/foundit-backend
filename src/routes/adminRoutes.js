const express = require('express');
const router = express.Router();
const {
    getAllUsers, deleteUser, getStats, getAllItems
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);
router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.get('/stats', getStats);
router.get('/items', getAllItems);

module.exports = router;