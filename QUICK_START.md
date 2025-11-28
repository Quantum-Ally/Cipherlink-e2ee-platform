# Quick Start Guide

## Prerequisites
- Node.js (v18 or higher)
- MongoDB (running locally or connection string)
- npm or yarn

## Step 1: Setup Backend

```bash
cd server
npm install
```

Create `server/.env`:
```env
MONGODB_URI=mongodb://localhost:27017/cipherlink
PORT=5000
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

Start backend:
```bash
npm run dev
```

Backend runs on: `http://localhost:5000`

## Step 2: Setup Frontend

```bash
cd client
npm install
```

Create `client/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

Start frontend:
```bash
npm run dev
```

Frontend runs on: `http://localhost:5173`

## Step 3: Access the Application

1. Open browser: `http://localhost:5173`
2. Register a new account (RSA keys will be generated automatically)
3. Login and start using the chat interface

## Changing Backend URL

**Single Point Configuration**: Edit `client/.env` file:
```env
VITE_API_URL=http://your-backend-url/api
```

The frontend automatically uses this value from `client/src/config/api.ts`

## Troubleshooting

- **Backend won't start**: Check if MongoDB is running
- **Frontend can't connect**: Verify `VITE_API_URL` in `client/.env` matches your backend URL
- **Port already in use**: Change `PORT` in `server/.env` or kill the process using the port


