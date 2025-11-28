import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  chunks: [{
    chunkIndex: Number,
    ciphertext: String,
    iv: String,
    tag: String
  }],
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

fileSchema.index({ senderId: 1, recipientId: 1 });

export default mongoose.model('File', fileSchema);


