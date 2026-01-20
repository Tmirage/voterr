import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));

import crypto from 'crypto';
import { initDatabase } from './db/index.js';
import db from './db/index.js';
import { getSetting, setSetting } from './services/settings.js';
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
import dashboardRoutes from './routes/dashboard.js';
import { generateCsrfToken, csrfProtection } from './middleware/csrf.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5056;

const clientDist = join(process.cwd(), 'client', 'dist');
const hasBuiltClient = existsSync(join(clientDist, 'index.html'));

// Serve static files if client/dist exists (production build)
if (hasBuiltClient) {
  app.use(express.static(clientDist, { index: 'index.html' }));
}

app.use(cors({
  origin: hasBuiltClient ? false : true,
  credentials: true
}));

app.use(express.json());

// Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) for reverse proxy setups
app.set('trust proxy', 1);

// Session secret: use env var, or auto-generate and store in database

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  
  // Check if we have a stored secret
  let secret = getSetting('session_secret');
  if (!secret) {
    // Generate and store a new secret
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('session_secret', secret);
    console.log('Generated new session secret');
  }
  return secret;
}

app.use(session({
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

app.get('/api/csrf-token', (req, res) => {
  res.json({ token: generateCsrfToken(req) });
});

app.use('/api', csrfProtection);

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
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: pkg.version, timestamp: new Date().toISOString() });
});

app.get('/join/:token', (req, res) => {
  const { token } = req.params;
  
  const invite = db.prepare(`
    SELECT gi.*, mn.date, mn.time, mn.is_cancelled, mn.cancel_reason,
           g.name as group_name, g.image_url as group_image_url
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.token = ?
  `).get(token);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  let title = 'Voterr - Movie Night Voting';
  let description = "You're invited to vote for movie night!";
  let imageUrl = `${baseUrl}/favicon.svg`;

  if (invite) {
    const dateStr = new Date(invite.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    
    if (invite.is_cancelled === 1) {
      title = `CANCELLED: ${invite.group_name} Movie Night`;
      description = invite.cancel_reason 
        ? `Movie night on ${dateStr} has been cancelled: "${invite.cancel_reason}"`
        : `Movie night on ${dateStr} has been cancelled`;
    } else {
      title = `Vote for ${invite.group_name} Movie Night!`;
      description = `Join us on ${dateStr} at ${invite.time}. Cast your vote now!`;
    }
    
    if (invite.group_image_url) {
      imageUrl = invite.group_image_url.startsWith('http') 
        ? invite.group_image_url 
        : `${baseUrl}${invite.group_image_url}`;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    const indexPath = join(clientDist, 'index.html');
    if (existsSync(indexPath)) {
      let html = readFileSync(indexPath, 'utf-8');
      const ogTags = `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${baseUrl}/join/${token}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />`;
      html = html.replace('</head>', `${ogTags}\n  </head>`);
      html = html.replace('<title>Voterr - Movie Night Voting</title>', `<title>${title}</title>`);
      return res.send(html);
    }
  }
  
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${baseUrl}/join/${token}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
  </head>
  <body class="bg-gray-900 text-gray-100">
    <div id="root"></div>
    <script>window.location.href = window.location.href;</script>
  </body>
</html>`);
});

if (hasBuiltClient) {
  app.get('*', (req, res) => {
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
