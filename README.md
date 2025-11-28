# Cipherlink - E2EE Messaging Platform

Secure End-to-End Encrypted Messaging & File-Sharing System

## Project Structure

```
Cipherlink-e2ee-platform/
├── client/          # React frontend
├── server/          # Node.js backend
└── README.md
```

## Setup Instructions

### Backend Setup

1. Navigate to server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in `server/` directory:
```env
MONGODB_URI=mongodb://localhost:27017/cipherlink
PORT=5000
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

4. Start the server:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in `client/` directory:
```env
VITE_API_URL=http://localhost:5000/api
```

4. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## Environment Variables

### Backend (.env in server/)
- `MONGODB_URI` - MongoDB connection string
- `PORT` - Server port (default: 5000)
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - Environment (development/production)

### Frontend (.env in client/)
- `VITE_API_URL` - Backend API URL (default: http://localhost:5000/api)

**Important:** Change the backend URL in the frontend `.env` file if your backend runs on a different port or domain.

## Features

- User Authentication (Register/Login)
- RSA-2048 Key Generation
- Secure Key Storage (IndexedDB)
- Modern UI with shadcn components
- Dark theme
- Responsive design

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Axios

### Backend
- Node.js
- Express
- MongoDB (Mongoose)
- bcrypt
- JWT

## Development

Run both frontend and backend in separate terminals:

**Terminal 1 (Backend):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd client
npm run dev
```

## Notes

- Make sure MongoDB is running before starting the backend
- The backend API URL is configured in `client/src/config/api.ts` and uses the `VITE_API_URL` environment variable
- Private keys are generated client-side and never sent to the server
- Public keys are stored on the server for key exchange


