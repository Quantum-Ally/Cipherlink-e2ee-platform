import Message from '../models/Message.js';
import { logSecurityEvent } from '../utils/logger.js';

// In-memory nonce cache to prevent replay attacks
// Key: nonce, Value: { timestamp, userId, recipientId }
const nonceCache = new Map();

// Maximum age for nonces and timestamps (5 minutes)
const MAX_NONCE_AGE = 5 * 60 * 1000;

// Per-conversation sequence number tracking
// Key: "senderId-recipientId", Value: lastSequenceNumber
const sequenceTracking = new Map();

// Clean up expired nonces every minute
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [nonce, data] of nonceCache.entries()) {
    if (now - data.timestamp > MAX_NONCE_AGE) {
      nonceCache.delete(nonce);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[REPLAY-PROTECTION] Cleaned ${cleaned} expired nonces`);
  }
}, 60000);

/**
 * Comprehensive Replay Attack Protection Middleware
 * 
 * Implements three layers of protection:
 * 1. NONCE: Unique random value that must not be reused
 * 2. TIMESTAMP: Message must be recent (within 5 minutes)
 * 3. SEQUENCE NUMBER: Monotonically increasing counter per conversation
 * 
 * Any violation triggers immediate rejection and logging
 */
export const replayProtection = async (req, res, next) => {
  try {
    const { nonce, timestamp, sequenceNumber, recipientId } = req.body;
    const senderId = req.userId; // From auth middleware

    // ===== VALIDATION: Check all required fields =====
    if (!nonce || !timestamp || sequenceNumber === undefined) {
      logSecurityEvent('replay_protection_missing_fields', {
        userId: senderId,
        nonce: !!nonce,
        timestamp: !!timestamp,
        sequenceNumber: sequenceNumber !== undefined,
      });
      return res.status(400).json({ 
        error: 'Missing replay protection fields',
        details: 'Nonce, timestamp, and sequenceNumber are required'
      });
    }

    // ===== LAYER 1: TIMESTAMP VALIDATION =====
    // Reject messages that are too old or from the future
    const now = Date.now();
    const timeDiff = now - timestamp;

    // Check if message is from the future (allow 1 minute clock skew)
    if (timeDiff < -60000) {
      logSecurityEvent('replay_attack_future_timestamp', {
        userId: senderId,
        recipientId,
        timestamp,
        serverTime: now,
        difference: timeDiff,
        nonce,
      });
      return res.status(400).json({ 
        error: 'Replay attack detected: message from future',
        details: 'Timestamp is ahead of server time'
      });
    }

    // Check if message is too old
    if (timeDiff > MAX_NONCE_AGE) {
      logSecurityEvent('replay_attack_old_timestamp', {
        userId: senderId,
        recipientId,
        timestamp,
        serverTime: now,
        age: timeDiff,
        maxAge: MAX_NONCE_AGE,
        nonce,
      });
      return res.status(400).json({ 
        error: 'Replay attack detected: message too old',
        details: `Message must be sent within ${MAX_NONCE_AGE / 1000} seconds`
      });
    }

    // ===== LAYER 2: NONCE VALIDATION =====
    // Check if nonce has been used before
    if (nonceCache.has(nonce)) {
      const previousUse = nonceCache.get(nonce);
      logSecurityEvent('replay_attack_duplicate_nonce', {
        userId: senderId,
        recipientId,
        nonce,
        previousUse,
        attemptedUse: {
          timestamp,
          sequenceNumber,
        },
      });
      return res.status(400).json({ 
        error: 'Replay attack detected: duplicate nonce',
        details: 'This message has already been processed'
      });
    }

    // ===== LAYER 3: SEQUENCE NUMBER VALIDATION =====
    // Check if sequence number is valid for this conversation
    if (senderId && recipientId) {
      // Create bidirectional conversation keys
      const conversationKey1 = `${senderId}-${recipientId}`;
      const conversationKey2 = `${recipientId}-${senderId}`;
      
      // Get last sequence number from in-memory cache first (faster)
      let lastSequence = sequenceTracking.get(conversationKey1);
      
      // If not in cache, fetch from database
      if (lastSequence === undefined) {
        const lastMessage = await Message.findOne({
          $or: [
            { senderId, recipientId },
            { senderId: recipientId, recipientId: senderId }
          ]
        }).sort({ sequenceNumber: -1 }).select('sequenceNumber');
        
        lastSequence = lastMessage ? lastMessage.sequenceNumber : 0;
        sequenceTracking.set(conversationKey1, lastSequence);
        sequenceTracking.set(conversationKey2, lastSequence);
      }

      // Sequence number must be strictly increasing
      if (sequenceNumber <= lastSequence) {
        logSecurityEvent('replay_attack_invalid_sequence', {
          userId: senderId,
          recipientId,
          sequenceNumber,
          expectedMinimum: lastSequence + 1,
          lastSequence,
          nonce,
          timestamp,
        });
        return res.status(400).json({ 
          error: 'Replay attack detected: invalid sequence number',
          details: `Expected sequence number > ${lastSequence}, got ${sequenceNumber}`
        });
      }

      // Check for sequence number gaps (possible indicator of attack or network issues)
      const gap = sequenceNumber - lastSequence;
      if (gap > 10) {
        logSecurityEvent('replay_protection_sequence_gap', {
          userId: senderId,
          recipientId,
          sequenceNumber,
          lastSequence,
          gap,
          nonce,
        });
        console.warn(`[REPLAY-PROTECTION] Large sequence gap detected: ${gap}`);
      }

      // Update sequence tracking
      sequenceTracking.set(conversationKey1, sequenceNumber);
      sequenceTracking.set(conversationKey2, sequenceNumber);
    }

    // ===== ALL CHECKS PASSED =====
    // Store nonce to prevent future replay
    nonceCache.set(nonce, {
      timestamp,
      userId: senderId,
      recipientId,
      sequenceNumber,
      acceptedAt: now,
    });

    // Log successful validation
    logSecurityEvent('replay_protection_passed', {
      userId: senderId,
      recipientId,
      nonce,
      timestamp,
      sequenceNumber,
      cacheSize: nonceCache.size,
    });

    console.log(`[REPLAY-PROTECTION] ✓ Message validated - Nonce: ${nonce.substring(0, 8)}..., Seq: ${sequenceNumber}, Age: ${timeDiff}ms`);

    next();
  } catch (error) {
    console.error('[REPLAY-PROTECTION] Error:', error);
    logSecurityEvent('replay_protection_error', {
      userId: req.userId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Replay protection check failed' });
  }
};

/**
 * Get replay protection statistics (for monitoring)
 */
export const getReplayProtectionStats = () => {
  return {
    nonceCacheSize: nonceCache.size,
    sequenceTrackingSize: sequenceTracking.size,
    maxNonceAge: MAX_NONCE_AGE,
  };
};


