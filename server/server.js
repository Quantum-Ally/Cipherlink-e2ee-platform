import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import messageRoutes from './routes/messages.js';
import fileRoutes from './routes/files.js';
import keyExchangeRoutes from './routes/keyExchange.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let isConnected = false;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority',
    });
    isConnected = true;
    console.log('✅ MongoDB connected:', conn.connection.host);
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
      isConnected = false;
      setTimeout(connectDB, 5000);
    });
  } catch (error) {
    isConnected = false;
    console.error('❌ MongoDB connection error:', error.message);
    console.error('\n⚠️  MongoDB Connection Failed!');
    console.error('Please check:');
    console.error('1. MongoDB is running (if local)');
    console.error('2. MONGODB_URI in .env is correct');
    console.error('3. Network/firewall allows connection');
    console.error('4. For MongoDB Atlas: Check IP whitelist and credentials');
    console.error('5. Retrying connection in 5 seconds...\n');
    setTimeout(connectDB, 5000);
  }
};

connectDB();

const checkDBConnection = (req, res, next) => {
  if (!isConnected) {
    return res.status(503).json({ 
      error: 'Database connection unavailable. Please try again in a moment.' 
    });
  }
  next();
};

app.use('/api/auth', checkDBConnection, authRoutes);
app.use('/api/users', checkDBConnection, userRoutes);
app.use('/api/messages', checkDBConnection, messageRoutes);
app.use('/api/files', checkDBConnection, fileRoutes);
app.use('/api/key-exchange', checkDBConnection, keyExchangeRoutes);

app.get('/api/health', (req, res) => {
  res.json({ 
    status: isConnected ? 'ok' : 'degraded',
    message: isConnected ? 'Server is running' : 'Server running but database not connected',
    database: isConnected ? 'connected' : 'disconnected'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


