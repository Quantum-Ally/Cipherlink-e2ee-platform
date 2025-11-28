# MongoDB Setup Guide

## Issue: MongoDB Connection Timeout

Your server is trying to connect to MongoDB but timing out. Here are solutions:

## Option 1: Use Local MongoDB (Recommended for Development)

1. **Install MongoDB locally:**
   - Download from: https://www.mongodb.com/try/download/community
   - Or use MongoDB via Docker

2. **Update `server/.env`:**
   ```env
   MONGODB_URI=mongodb://localhost:27017/cipherlink
   PORT=5000
   JWT_SECRET=your-secret-key-change-this-in-production
   NODE_ENV=development
   ```

3. **Start MongoDB:**
   - Windows: MongoDB should start as a service automatically
   - Or run: `mongod` in a terminal

## Option 2: Fix MongoDB Atlas Connection

If using MongoDB Atlas (cloud), check:

1. **IP Whitelist:**
   - Go to MongoDB Atlas Dashboard
   - Network Access → Add IP Address
   - Add `0.0.0.0/0` (all IPs) for development, or your specific IP

2. **Database User:**
   - Go to Database Access
   - Ensure user exists and has correct password
   - User should have read/write permissions

3. **Connection String:**
   - Get connection string from Atlas
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/cipherlink?retryWrites=true&w=majority`
   - Update `server/.env` with correct URI

4. **Check Firewall:**
   - Ensure your firewall allows MongoDB connections
   - Port 27017 (local) or 27017+ (Atlas)

## Quick Test

After updating `.env`, restart the server:
```bash
cd server
npm start
```

You should see: `MongoDB connected: [hostname]`

If still failing, check:
- MongoDB service is running (if local)
- Internet connection (if Atlas)
- `.env` file exists and has correct MONGODB_URI

