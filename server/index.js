import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));

import { initDatabase } from './db/index.js';
import { initScheduler } from './services/scheduler.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import groupsRoutes from './routes/groups.js';
import schedulesRoutes from './routes/schedules.js';
import moviesRoutes from './routes/movies.js';
import votesRoutes from './routes/votes.js';
import invitesRoutes from './routes/invites.js';
import setupRoutes from './routes/setup.js';
import settingsRoutes from './routes/settings.js';
import imagesRoutes from './routes/images.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5056;

if (process.env.NODE_ENV === 'production') {
  const clientDist = join(process.cwd(), 'client', 'dist');
  app.use(express.static(clientDist));
}

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/votes', votesRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/images', imagesRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: pkg.version, timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const clientDist = join(process.cwd(), 'client', 'dist');
    res.sendFile(join(clientDist, 'index.html'));
  });
}

async function start() {
  try {
    await initDatabase();
    initScheduler();
    
    app.listen(PORT, () => {
      console.log(`Voterr running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
