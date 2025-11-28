import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { logSecurityEvent, logKeyExchange, logInvalidSignature } from '../utils/logger.js';

const router = express.Router();

const pendingExchanges = new Map();

router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { recipientId, publicKey, signature, timestamp } = req.body;

    console.log(`[KEY EXCHANGE] Initiate request from user ${req.userId} to ${recipientId}`);

    if (!recipientId || !publicKey || !signature) {
      console.log(`[KEY EXCHANGE] Missing fields - recipientId: ${!!recipientId}, publicKey: ${!!publicKey}, signature: ${!!signature}`);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const exchangeId = `${req.userId}-${recipientId}-${Date.now()}`;
    pendingExchanges.set(exchangeId, {
      fromUserId: req.userId,
      toUserId: recipientId,
      publicKey,
      signature,
      timestamp,
      createdAt: Date.now(),
    });

    console.log(`[KEY EXCHANGE] Exchange ${exchangeId} created, will expire in 5 minutes`);

    setTimeout(() => {
      pendingExchanges.delete(exchangeId);
      console.log(`[KEY EXCHANGE] Exchange ${exchangeId} expired and removed`);
    }, 5 * 60 * 1000);

    logSecurityEvent('key_exchange_initiated', {
      userId: req.userId,
      recipientId,
      exchangeId,
    });

    console.log(`[KEY EXCHANGE] Successfully initiated exchange ${exchangeId}`);
    res.json({ exchangeId, status: 'initiated' });
  } catch (error) {
    console.error('[KEY EXCHANGE] Initiate error:', error);
    logSecurityEvent('key_exchange_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to initiate key exchange' });
  }
});

router.post('/response', authenticate, async (req, res) => {
  try {
    const { exchangeId, publicKey, signature, timestamp } = req.body;

    console.log(`[KEY EXCHANGE] Response request for exchange ${exchangeId} from user ${req.userId}`);

    if (!exchangeId || !publicKey || !signature) {
      console.log(`[KEY EXCHANGE] Missing fields in response - exchangeId: ${!!exchangeId}, publicKey: ${!!publicKey}, signature: ${!!signature}`);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const exchange = pendingExchanges.get(exchangeId);
    if (!exchange) {
      console.log(`[KEY EXCHANGE] Exchange ${exchangeId} not found or expired`);
      logSecurityEvent('key_exchange_not_found', {
        userId: req.userId,
        exchangeId,
      });
      return res.status(404).json({ error: 'Key exchange not found or expired' });
    }

    console.log(`[KEY EXCHANGE] Exchange found - from: ${exchange.fromUserId}, to: ${exchange.toUserId}, current user: ${req.userId}`);

    const isInitiator = exchange.fromUserId.toString() === req.userId.toString();
    const isRecipient = exchange.toUserId.toString() === req.userId.toString();

    if (!isInitiator && !isRecipient) {
      console.log(`[KEY EXCHANGE] Unauthorized - exchange is between ${exchange.fromUserId} and ${exchange.toUserId}, but current user is ${req.userId}`);
      logSecurityEvent('key_exchange_unauthorized', {
        userId: req.userId,
        fromUserId: exchange.fromUserId,
        toUserId: exchange.toUserId,
        exchangeId,
      });
      return res.status(403).json({ error: 'Unauthorized - you are not part of this exchange' });
    }

    if (isInitiator) {
      console.log(`[KEY EXCHANGE] User ${req.userId} is responding to their own initiation (mutual key exchange)`);
    }

    logSecurityEvent('key_exchange_response', {
      userId: req.userId,
      exchangeId,
      role: isInitiator ? 'initiator' : 'recipient',
    });

    // Store the response in the exchange object
    exchange.responsePublicKey = publicKey;
    exchange.responseSignature = signature;
    exchange.responseTimestamp = timestamp;
    exchange.respondedBy = req.userId;
    exchange.respondedAt = Date.now();

    console.log(`[KEY EXCHANGE] Response successful for exchange ${exchangeId} by ${isInitiator ? 'initiator' : 'recipient'}`);
    res.json({
      originalPublicKey: exchange.publicKey,
      originalSignature: exchange.signature,
      responsePublicKey: publicKey,
      responseSignature: signature,
      exchangeId: exchangeId,
    });
  } catch (error) {
    console.error('[KEY EXCHANGE] Response error:', error);
    logSecurityEvent('key_exchange_response_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to process key exchange response' });
  }
});

router.get('/pending/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`[KEY EXCHANGE] Checking for pending exchanges with user ${userId} for current user ${req.userId}`);

    // Find exchanges where current user is the recipient (waiting for them to respond)
    const pendingForMe = Array.from(pendingExchanges.entries())
      .filter(([exchangeId, exchange]) => {
        return exchange.toUserId.toString() === req.userId.toString() &&
               exchange.fromUserId.toString() === userId.toString() &&
               !exchange.responsePublicKey; // Only return exchanges without responses yet
      })
      .map(([exchangeId, exchange]) => ({
        exchangeId,
        fromUserId: exchange.fromUserId,
        toUserId: exchange.toUserId,
        publicKey: exchange.publicKey,
        signature: exchange.signature,
        timestamp: exchange.timestamp,
        createdAt: exchange.createdAt,
      }));

    console.log(`[KEY EXCHANGE] Found ${pendingForMe.length} pending exchanges`);

    res.json({ exchanges: pendingForMe });
  } catch (error) {
    console.error('[KEY EXCHANGE] Get pending error:', error);
    res.status(500).json({ error: 'Failed to get pending exchanges' });
  }
});

// New endpoint: Get responses to exchanges we initiated
router.get('/responses/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`[KEY EXCHANGE] Checking for responses to exchanges with user ${userId} for current user ${req.userId}`);

    // Find exchanges where current user is the initiator and recipient has responded
    // Also filter out expired exchanges
    const now = Date.now()
    const EXCHANGE_EXPIRY = 5 * 60 * 1000 // 5 minutes
    
    const responses = Array.from(pendingExchanges.entries())
      .filter(([exchangeId, exchange]) => {
        const isExpired = now - exchange.createdAt > EXCHANGE_EXPIRY
        if (isExpired) {
          // Clean up expired exchange
          pendingExchanges.delete(exchangeId)
          return false
        }
        return exchange.fromUserId.toString() === req.userId.toString() &&
               exchange.toUserId.toString() === userId.toString() &&
               exchange.responsePublicKey; // Only return exchanges with responses
      })
      .map(([exchangeId, exchange]) => ({
        exchangeId,
        originalPublicKey: exchange.publicKey,
        originalSignature: exchange.signature,
        responsePublicKey: exchange.responsePublicKey,
        responseSignature: exchange.responseSignature,
        responseTimestamp: exchange.responseTimestamp,
        fromUserId: exchange.fromUserId,
        toUserId: exchange.toUserId,
      }));

    console.log(`[KEY EXCHANGE] Found ${responses.length} responses`);

    // Return empty array instead of 404 if no responses
    res.json({ responses: responses || [] });
  } catch (error) {
    console.error('[KEY EXCHANGE] Get responses error:', error);
    res.status(500).json({ error: 'Failed to get responses', responses: [] });
  }
});

router.post('/confirm', authenticate, async (req, res) => {
  try {
    const { exchangeId, confirmationHash } = req.body;

    console.log(`[KEY EXCHANGE] Confirm request for exchange ${exchangeId} from user ${req.userId}`);

    if (!exchangeId || !confirmationHash) {
      console.log(`[KEY EXCHANGE] Missing fields in confirm - exchangeId: ${!!exchangeId}, confirmationHash: ${!!confirmationHash}`);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const exchange = pendingExchanges.get(exchangeId);
    if (!exchange) {
      console.log(`[KEY EXCHANGE] Exchange ${exchangeId} not found for confirmation`);
      return res.status(404).json({ error: 'Key exchange not found or expired' });
    }

    // Track who has confirmed
    if (!exchange.confirmedBy) {
      exchange.confirmedBy = [];
    }
    
    if (!exchange.confirmedBy.includes(req.userId.toString())) {
      exchange.confirmedBy.push(req.userId.toString());
      console.log(`[KEY EXCHANGE] User ${req.userId} confirmed exchange ${exchangeId}`);
    }

    logSecurityEvent('key_exchange_confirmed', {
      userId: req.userId,
      exchangeId,
    });

    // Only delete exchange when BOTH users have confirmed
    const bothConfirmed = exchange.confirmedBy.length >= 2 || 
                         (exchange.confirmedBy.includes(exchange.fromUserId.toString()) && 
                          exchange.confirmedBy.includes(exchange.toUserId.toString()));
    
    if (bothConfirmed) {
      pendingExchanges.delete(exchangeId);
      console.log(`[KEY EXCHANGE] Exchange ${exchangeId} confirmed by both parties and removed`);
    } else {
      console.log(`[KEY EXCHANGE] Exchange ${exchangeId} confirmed by ${exchange.confirmedBy.length} party/parties, waiting for other party`);
    }

    res.json({ status: 'confirmed', bothConfirmed });
  } catch (error) {
    console.error('[KEY EXCHANGE] Confirm error:', error);
    logSecurityEvent('key_exchange_confirm_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to confirm key exchange' });
  }
});

export default router;

