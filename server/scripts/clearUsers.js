import mongoose from 'mongoose';
import User from '../models/User.js';
import Message from '../models/Message.js';
import File from '../models/File.js';
import dotenv from 'dotenv';

dotenv.config();

async function clearAllData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const userCount = await User.countDocuments();
    const messageCount = await Message.countDocuments();
    const fileCount = await File.countDocuments();

    console.log(`\nCurrent data:`);
    console.log(`- Users: ${userCount}`);
    console.log(`- Messages: ${messageCount}`);
    console.log(`- Files: ${fileCount}`);

    await User.deleteMany({});
    await Message.deleteMany({});
    await File.deleteMany({});

    console.log('\n✅ All data cleared successfully!');
    console.log('You can now register new accounts with RSA-PSS keys.\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error clearing data:', error);
    process.exit(1);
  }
}

clearAllData();


