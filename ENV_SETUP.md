# Environment Variables Setup

## Backend Environment Variables

Create a `.env` file in the `server/` directory with the following:

```env
MONGODB_URI=mongodb://localhost:27017/cipherlink
PORT=5000
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

### Explanation:
- **MONGODB_URI**: Your MongoDB connection string. If MongoDB is running locally, use `mongodb://localhost:27017/cipherlink`
- **PORT**: The port where the backend server will run (default: 5000)
- **JWT_SECRET**: A secret key for signing JWT tokens. Use a strong random string in production
- **NODE_ENV**: Set to `development` for development, `production` for production

## Frontend Environment Variables

Create a `.env` file in the `client/` directory with the following:

```env
VITE_API_URL=http://localhost:5000/api
```

### Explanation:
- **VITE_API_URL**: The base URL for your backend API. This is the **single point** where you change the backend URL.
  - For local development: `http://localhost:5000/api`
  - For production: `https://your-domain.com/api`
  - The frontend uses this value from `client/src/config/api.ts`

## Quick Setup

1. **Backend**: Copy `server/.env.example` to `server/.env` and update values
2. **Frontend**: Copy `client/.env.example` to `client/.env` and update `VITE_API_URL` if needed

## Important Notes

- Never commit `.env` files to git (they're in `.gitignore`)
- Change `JWT_SECRET` to a strong random string in production
- Update `VITE_API_URL` when deploying to production
- Make sure MongoDB is running before starting the backend


