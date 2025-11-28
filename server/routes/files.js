import express from 'express';
import File from '../models/File.js';
import { authenticate } from '../middleware/auth.js';
import { logSecurityEvent } from '../utils/logger.js';

const router = express.Router();

router.post('/upload', authenticate, async (req, res) => {
  try {
    const { recipientId, fileName, fileSize, mimeType, chunks } = req.body;

    if (!recipientId || !fileName || !chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const file = new File({
      senderId: req.userId,
      recipientId,
      fileName,
      fileSize,
      mimeType,
      chunks,
    });

    await file.save();

    logSecurityEvent('file_uploaded', {
      userId: req.userId,
      recipientId,
      fileId: file._id,
      fileName,
    });

    res.status(201).json({
      fileId: file._id,
      uploadedAt: file.uploadedAt,
    });
  } catch (error) {
    console.error('Upload file error:', error);
    logSecurityEvent('file_upload_failed', {
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.get('/:fileId', authenticate, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      $or: [
        { senderId: req.userId },
        { recipientId: req.userId }
      ]
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    logSecurityEvent('file_accessed', {
      userId: req.userId,
      fileId: file._id,
    });

    res.json(file);
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

router.get('/conversation/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const files = await File.find({
      $or: [
        { senderId: req.userId, recipientId: userId },
        { senderId: userId, recipientId: req.userId }
      ]
    }).sort({ uploadedAt: -1 });

    res.json(files);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

export default router;


