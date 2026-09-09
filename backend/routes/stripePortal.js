// Legacy aliases share the same access checks and trusted return URL as billing.
const express = require('express');
const { requireFirebaseAuth, requireSelfOrAdmin } = require('../utils/firebaseAuth');
const { createStripePortalSession } = require('./payments');
const router = express.Router();
router.post('/session', requireFirebaseAuth, requireSelfOrAdmin, createStripePortalSession);
router.post('/create-stripe-portal-session', requireFirebaseAuth, requireSelfOrAdmin, createStripePortalSession);
module.exports = router;
