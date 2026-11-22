const express = require('express');
const router = express.Router();
const {
    createClaim, getReceivedClaims, getMyClaims, respondToClaim
} = require('../controllers/claimController');
const { protect } = require('../middleware/auth');

router.post('/', protect, createClaim);
router.get('/received', protect, getReceivedClaims);
router.get('/my', protect, getMyClaims);
router.put('/:id', protect, respondToClaim);

module.exports = router;