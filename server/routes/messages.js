import express from 'express';
import Message from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';
import { replayProtection } from '../middleware/replayProtection.js';
import { logSecurityEvent, logFailedDecryption } from '../utils/logger.js';

const router = express.Router();

router.post('/send', authenticate, replayProtection, async (req, res) => {
  try {
    const { recipientId, ciphertext, iv, tag, timestamp, sequenceNumber, nonce } = req.body;

    console.log(`[MESSAGE] Send request from user ${req.userId} to ${recipientId}`);

    if (!recipientId || !ciphertext || !iv || !tag || !nonce) {
      console.log(`[MESSAGE] Missing fields - recipientId: ${!!recipientId}, ciphertext: ${!!ciphertext}, iv: ${!!iv}, tag: ${!!tag}, nonce: ${!!nonce}`);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const message = new Message({
      senderId: req.userId,
      recipientId,
      ciphertext,
      iv,
      tag,
      timestamp: new Date(timestamp),
      sequenceNumber,
      nonce,
    });

    await message.save();

    console.log(`[MESSAGE] Message ${message._id} saved successfully`);

    logSecurityEvent('message_sent', {
      userId: req.userId,
      recipientId,
      messageId: message._id,
      sequenceNumber,
      nonce,
    });

    res.status(201).json({
      messageId: message._id,
      timestamp: message.timestamp,
    });
  } catch (error) {
    if (error.code === 11000) {
      console.log(`[MESSAGE] Replay attack detected - duplicate nonce: ${req.body.nonce}`);
      logSecurityEvent('replay_attack_detected', {
        userId: req.userId,
        nonce: req.body.nonce,
      });
      return res.status(400).json({ error: 'Replay attack detected: duplicate nonce' });
    }

    console.error('[MESSAGE] Send error:', error);
    logSecurityEvent('message_send_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.get('/conversation/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    logSecurityEvent('message_access', {
      userId: req.userId,
      conversationWith: userId,
    });

    const messages = await Message.find({
      $or: [
        { senderId: req.userId, recipientId: userId },
        { senderId: userId, recipientId: req.userId }
      ]
    }).sort({ createdAt: 1 }).limit(100);

    logSecurityEvent('messages_retrieved', {
      userId: req.userId,
      conversationWith: userId,
      messageCount: messages.length,
    });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    logSecurityEvent('message_access_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

router.get('/conversations', authenticate, async (req, res) => {
  try {
    logSecurityEvent('conversations_list_access', {
      userId: req.userId,
    });

    // Get all unique user IDs that the current user has messaged with
    const messages = await Message.find({
      $or: [
        { senderId: req.userId },
        { recipientId: req.userId }
      ]
    }).select('senderId recipientId').lean();

    // Extract unique user IDs
    const userIds = new Set();
    messages.forEach(msg => {
      if (msg.senderId.toString() === req.userId.toString()) {
        userIds.add(msg.recipientId.toString());
      } else {
        userIds.add(msg.senderId.toString());
      }
    });

    logSecurityEvent('conversations_retrieved', {
      userId: req.userId,
      conversationCount: userIds.size,
    });

    res.json(Array.from(userIds));
  } catch (error) {
    console.error('Get conversations error:', error);
    logSecurityEvent('conversations_access_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

router.get('/:messageId', authenticate, async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      $or: [
        { senderId: req.userId },
        { recipientId: req.userId }
      ]
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ error: 'Failed to get message' });
  }
});

export default router;

