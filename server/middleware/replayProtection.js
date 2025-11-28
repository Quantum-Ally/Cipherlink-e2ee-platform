import Message from '../models/Message.js';

const nonceCache = new Map();
const MAX_NONCE_AGE = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of nonceCache.entries()) {
    if (now - timestamp > MAX_NONCE_AGE) {
      nonceCache.delete(nonce);
    }
  }
}, 60000);

export const replayProtection = async (req, res, next) => {
  try {
    const { nonce, timestamp, sequenceNumber } = req.body;

    if (!nonce || !timestamp || sequenceNumber === undefined) {
      return res.status(400).json({ error: 'Missing replay protection fields' });
    }

    const now = Date.now();
    const timeDiff = Math.abs(now - timestamp);

    if (timeDiff > MAX_NONCE_AGE) {
      return res.status(400).json({ error: 'Message timestamp too old or too far in future' });
    }

    if (nonceCache.has(nonce)) {
      return res.status(400).json({ error: 'Replay attack detected: duplicate nonce' });
    }

    const { senderId, recipientId } = req.body;
    if (senderId && recipientId) {
      const lastMessage = await Message.findOne({
        $or: [
          { senderId, recipientId },
          { senderId: recipientId, recipientId: senderId }
        ]
      }).sort({ sequenceNumber: -1 });

      if (lastMessage && sequenceNumber <= lastMessage.sequenceNumber) {
        return res.status(400).json({ error: 'Replay attack detected: invalid sequence number' });
      }
    }

    nonceCache.set(nonce, timestamp);
    next();
  } catch (error) {
    console.error('Replay protection error:', error);
    res.status(500).json({ error: 'Replay protection check failed' });
  }
};


