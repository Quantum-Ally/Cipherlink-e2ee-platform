import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logAuthAttempt } from '../utils/logger.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password, publicKey } = req.body;

    console.log(`[AUTH] Registration attempt for username: ${username}`);

    if (!username || !password || !publicKey) {
      console.log(`[AUTH] Missing fields - username: ${!!username}, password: ${!!password}, publicKey: ${!!publicKey}`);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (mongoose.connection.readyState !== 1) {
      console.error('[AUTH] Database not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database connection unavailable. Please try again.' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log(`[AUTH] Username already exists: ${username}`);
      return res.status(400).json({ error: 'Username already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = new User({
      username,
      passwordHash,
      publicKey
    });

    await user.save();

    console.log(`[AUTH] User registered successfully: ${username} (ID: ${user._id})`);

    logAuthAttempt(username, true, req.ip);

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        publicKey: user.publicKey
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log(`[AUTH] Login attempt for username: ${username}`);

    if (!username || !password) {
      console.log(`[AUTH] Missing credentials - username: ${!!username}, password: ${!!password}`);
      return res.status(400).json({ error: 'Missing credentials' });
    }

    if (mongoose.connection.readyState !== 1) {
      console.error('[AUTH] Database not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database connection unavailable. Please try again.' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      console.log(`[AUTH] User not found: ${username}`);
      logAuthAttempt(username, false, req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      console.log(`[AUTH] Invalid password for user: ${username}`);
      logAuthAttempt(username, false, req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[AUTH] Login successful for user: ${username} (ID: ${user._id})`);
    logAuthAttempt(username, true, req.ip);

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        publicKey: user.publicKey
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;


