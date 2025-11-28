import express from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { logMetadataAccess } from '../utils/logger.js';

const router = express.Router();

router.get('/:userId/public-key', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('publicKey username');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    logMetadataAccess(req.userId, 'public_key', req.params.userId);
    res.json({ publicKey: user.publicKey, username: user.username });
  } catch (error) {
    console.error('Get public key error:', error);
    res.status(500).json({ error: 'Failed to get public key' });
  }
});

router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.userId }
    }).select('username publicKey _id').limit(10);

    logMetadataAccess(req.userId, 'user_search', q);
    res.json(users);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
