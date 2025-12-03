import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  ciphertext: {
    type: String,
    required: true
  },
  iv: {
    type: String,
    required: true
  },
  tag: {
    type: String,
    required: true
  },
  // Timestamp from client (for replay protection)
  timestamp: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        // Timestamp must be within reasonable range (not too old, not from future)
        const now = Date.now();
        const diff = now - v.getTime();
        return diff >= -60000 && diff <= 5 * 60 * 1000; // -1 min to +5 min
      },
      message: 'Timestamp must be recent'
    }
  },
  // Sequence number for replay protection (must increase monotonically per conversation)
  sequenceNumber: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: function(v) {
        return Number.isInteger(v) && v > 0;
      },
      message: 'Sequence number must be a positive integer'
    }
  },
  // Unique nonce for replay protection (cryptographically random)
  nonce: {
    type: String,
    required: true,
    unique: true,  // Database-level uniqueness constraint
    minlength: 16,  // Minimum length for security
    validate: {
      validator: function(v) {
        // Nonce must be base64 encoded (alphanumeric + / + =)
        return /^[A-Za-z0-9+/]+=*$/.test(v);
      },
      message: 'Nonce must be valid base64 string'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound indexes for efficient querying
messageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, recipientId: 1, sequenceNumber: -1 });
messageSchema.index({ recipientId: 1, senderId: 1, sequenceNumber: -1 });

// Index for replay protection (nonce uniqueness)
messageSchema.index({ nonce: 1 }, { unique: true });

// Index for timestamp-based cleanup
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days TTL

// Pre-save middleware to validate sequence number monotonicity
messageSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Check if sequence number is valid for this conversation
    const lastMessage = await mongoose.model('Message').findOne({
      $or: [
        { senderId: this.senderId, recipientId: this.recipientId },
        { senderId: this.recipientId, recipientId: this.senderId }
      ]
    }).sort({ sequenceNumber: -1 }).select('sequenceNumber');
    
    if (lastMessage && this.sequenceNumber <= lastMessage.sequenceNumber) {
      const error = new Error('Sequence number must be greater than previous message');
      error.name = 'ValidationError';
      return next(error);
    }
  }
  next();
});

export default mongoose.model('Message', messageSchema);

