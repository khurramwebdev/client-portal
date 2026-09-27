# Client Portal

A full-stack client portal demo for small agencies. Clients can follow project progress, review milestones, exchange messages, and share project files with the admin team.

## Features

- Separate admin and client workspaces
- Secure sign-up and sign-in with JSON Web Tokens
- Password hashing with bcrypt
- Project status and progress tracking
- Project milestones and updates
- Client and admin messaging
- Change requests
- Shared file uploads
- Responsive interface for desktop and mobile

## Technology

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Authentication: JSON Web Tokens and bcrypt

## Project Structure

```text
client/   React frontend
server/   Express API and MongoDB models
```

## Run Locally

### 1. Start the backend

Open a terminal in the project folder and run:

```bash
cd server
npm install
```

Create a file named `.env` inside the `server` folder:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
```

Add your own MongoDB connection string and a private random secret. Do not upload the `.env` file.

Then start the backend:

```bash
npm run dev
```

### 2. Start the frontend

Open a second terminal in the project folder and run:

```bash
cd client
npm install
npm run dev
```

Open the local address shown in the terminal, usually:

```text
http://localhost:5173
```

## Notes

This repository is a portfolio demonstration. Use private credentials and your own database configuration when running it.
