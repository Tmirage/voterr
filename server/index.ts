import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
import crypto from 'crypto';
import SqliteStore from 'better-sqlite3-session-store';

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
import setupRoutesHandler from './routes/setup.js';
import settingsRoutes from './routes/settings.js';
import imagesRoutes from './routes/images.js';
import dashboardRoutes from './routes/dashboard.js';
import logsRoutes from './routes/logs.js';
import { generateCsrfToken, csrfProtection } from './middleware/csrf.js';
import { authLimiter } from './middleware/rateLimit.js';
import { initLogsTable } from './services/logger.js';

interface PackageJson {
  version: string;
}

interface InviteRow {
  token: string;
  movie_night_id: number;
  date: string;
  time: string;
  is_cancelled: number;
  cancel_reason: string | null;
  group_name: string;
  group_image_url: string | null;
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8')) as PackageJson;

const app = express();
const PORT = process.env.PORT || 5056;

const clientDist = join(process.cwd(), 'client', 'dist');
const hasBuiltClient = existsSync(join(clientDist, 'index.html'));

if (hasBuiltClient) {
  app.use(express.static(clientDist, { index: 'index.html' }));
}

app.use(
  cors({
    origin: hasBuiltClient ? false : true,
    credentials: true,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json());

app.set('trust proxy', 1);

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  let secret = getSetting('session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('session_secret', secret);
    console.log('Generated new session secret');
  }
  return secret;
}

function setupRoutes(): void {
  const SessionStore = SqliteStore(session);

  app.use(
    session({
      store: new SessionStore({
        client: db,
        expired: {
          clear: true,
          intervalMs: 900000,
        },
      }),
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: 'auto',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.get('/api/csrf-token', (req: Request, res: Response) => {
    res.json({ token: generateCsrfToken(req) });
  });

  app.use('/api', csrfProtection);

  app.use('/api/setup', setupRoutesHandler);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/schedules', schedulesRoutes);
  app.use('/api/movies', moviesRoutes);
  app.use('/api/votes', votesRoutes);
  app.use('/api/invites', invitesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/images', imagesRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/logs', logsRoutes);
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: pkg.version, timestamp: new Date().toISOString() });
});

app.get('/join/:token', (req: Request, res: Response) => {
  const { token } = req.params;

  const invite = db
    .prepare(
      `
    SELECT gi.*, mn.date, mn.time, mn.is_cancelled, mn.cancel_reason,
           g.name as group_name, g.image_url as group_image_url
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.token = ?
  `
    )
    .get(token) as InviteRow | undefined;

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  let title = 'Voterr - Movie Night Voting';
  let description = "You're invited to vote for movie night!";
  let imageUrl = `${baseUrl}/favicon.svg`;

  const escapeHtml = (str: string): string =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  if (invite) {
    const dateStr = new Date(invite.date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    if (invite.is_cancelled === 1) {
      title = `CANCELLED: ${escapeHtml(invite.group_name)} Movie Night`;
      description = invite.cancel_reason
        ? `Movie night on ${dateStr} has been cancelled: "${escapeHtml(invite.cancel_reason)}"`
        : `Movie night on ${dateStr} has been cancelled`;
    } else {
      title = `Vote for ${escapeHtml(invite.group_name)} Movie Night!`;
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
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${baseUrl}/join/${token}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />`;
      html = html.replace('</head>', `${ogTags}\n  </head>`);
      html = html.replace(
        '<title>Voterr - Movie Night Voting</title>',
        `<title>${escapeHtml(title)}</title>`
      );
      res.send(html);
      return;
    }
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${baseUrl}/join/${token}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
  </head>
  <body class="bg-gray-900 text-gray-100">
    <div id="root"></div>
    <script>window.location.href = window.location.href;</script>
  </body>
</html>`);
});

async function start(): Promise<void> {
  try {
    await initDatabase();
    initLogsTable();
    setupRoutes();

    if (hasBuiltClient) {
      app.get('/{*path}', (_req: Request, res: Response) => {
        res.sendFile(join(clientDist, 'index.html'));
      });
    }

    // Global error handler for URIError and other uncaught errors
    app.use((err: Error, req: Request, res: Response, _next: express.NextFunction) => {
      if (err instanceof URIError) {
        console.warn(`[URIError] Malformed URL from ${req.ip}: ${req.originalUrl}`);
        res.status(400).json({ error: 'Bad request: malformed URL' });
        return;
      }
      console.error('[Error]', err.message);
      res.status(500).json({ error: 'Internal server error' });
    });

    initScheduler();

    app.listen(PORT, () => {
      console.log(`Voterr running on http://localhost:${PORT}`);
    });
  } catch (err: unknown) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
