import { Router } from 'express';
import db from '../db/index.js';
import { isSetupComplete, setSettings, getAllSettings } from '../services/settings.js';
import { getPlexUser } from '../services/plex.js';

const router = Router();

const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || 'voterr';

router.get('/status', (req, res) => {
  const complete = isSetupComplete();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  
  res.json({
    setupComplete: complete,
    hasUsers: userCount > 0
  });
});

router.post('/plex-auth', async (req, res) => {
  if (isSetupComplete()) {
    return res.status(403).json({ error: 'Setup already complete' });
  }
  
  try {
    const response = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
        'X-Plex-Product': 'Voterr',
        'X-Plex-Version': '1.0.0',
        'X-Plex-Platform': 'Web'
      },
      body: JSON.stringify({ strong: true })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Plex pin error:', response.status, text);
      throw new Error('Failed to create Plex pin');
    }

    const data = await response.json();
    
    req.session.setupPlexPinId = data.id;
    req.session.setupPlexCode = data.code;

    const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${data.code}&context%5Bdevice%5D%5Bproduct%5D=Voterr&context%5Bdevice%5D%5Bplatform%5D=Web&context%5Bdevice%5D%5Bdevice%5D=Voterr`;

    res.json({
      pinId: data.id,
      code: data.code,
      authUrl
    });
  } catch (error) {
    console.error('Setup Plex auth error:', error);
    res.status(500).json({ error: 'Failed to initiate Plex authentication' });
  }
});

router.get('/plex-auth/check', async (req, res) => {
  if (isSetupComplete()) {
    return res.status(403).json({ error: 'Setup already complete' });
  }
  
  try {
    const pinId = req.session.setupPlexPinId;
    
    if (!pinId) {
      return res.status(400).json({ error: 'No pending authentication' });
    }

    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID
      }
    });

    if (!response.ok) {
      throw new Error('Failed to check Plex pin');
    }

    const data = await response.json();
    
    if (!data.authToken) {
      return res.json({ authenticated: false });
    }

    const plexUser = await getPlexUser(data.authToken);

    req.session.setupPlexToken = data.authToken;
    req.session.setupPlexUser = {
      id: plexUser.id,
      username: plexUser.username,
      email: plexUser.email,
      thumb: plexUser.thumb
    };

    res.json({
      authenticated: true,
      user: {
        username: plexUser.username,
        email: plexUser.email,
        thumb: plexUser.thumb
      }
    });
  } catch (error) {
    console.error('Setup Plex check error:', error);
    res.status(500).json({ error: 'Failed to check authentication' });
  }
});

router.post('/complete', async (req, res) => {
  if (isSetupComplete()) {
    return res.status(403).json({ error: 'Setup already complete' });
  }
  
  try {
    const { overseerrUrl, overseerrApiKey, tautulliUrl, tautulliApiKey } = req.body;
    const plexToken = req.session.setupPlexToken;
    const plexUser = req.session.setupPlexUser;

    if (!plexToken || !plexUser) {
      return res.status(400).json({ error: 'Plex authentication required' });
    }

    if (overseerrUrl && overseerrApiKey) {
      try {
        const overseerrTest = await fetch(`${overseerrUrl}/api/v1/status`, {
          headers: { 'X-Api-Key': overseerrApiKey }
        });
        if (!overseerrTest.ok) {
          return res.status(400).json({ error: 'Failed to connect to Overseerr. Check URL and API key.' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Failed to connect to Overseerr. Check URL.' });
      }
    }

    if (tautulliUrl && tautulliApiKey) {
      try {
        const tautulliTest = await fetch(`${tautulliUrl}/api/v2?apikey=${tautulliApiKey}&cmd=arnold`);
        if (!tautulliTest.ok) {
          return res.status(400).json({ error: 'Failed to connect to Tautulli. Check URL and API key.' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Failed to connect to Tautulli. Check URL.' });
      }
    }

    const settings = {
      plex_token: plexToken
    };

    if (overseerrUrl) settings.overseerr_url = overseerrUrl;
    if (overseerrApiKey) settings.overseerr_api_key = overseerrApiKey;
    if (tautulliUrl) settings.tautulli_url = tautulliUrl;
    if (tautulliApiKey) settings.tautulli_api_key = tautulliApiKey;

    setSettings(settings);

    let user = db.prepare('SELECT * FROM users WHERE plex_id = ?').get(plexUser.id.toString());

    if (!user) {
      const result = db.prepare(`
        INSERT INTO users (plex_id, plex_token, username, email, avatar_url, is_admin)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        plexUser.id.toString(),
        plexToken,
        plexUser.username,
        plexUser.email,
        plexUser.thumb
      );

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else {
      db.prepare(`
        UPDATE users SET plex_token = ?, is_admin = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(plexToken, user.id);
    }

    req.session.userId = user.id;
    req.session.isAdmin = true;

    delete req.session.setupPlexPinId;
    delete req.session.setupPlexCode;
    delete req.session.setupPlexToken;
    delete req.session.setupPlexUser;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        isAdmin: true
      }
    });
  } catch (error) {
    console.error('Setup complete error:', error);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

router.get('/settings', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const settings = getAllSettings();
  
  const safeSettings = {
    radarr_url: settings.radarr_url || '',
    radarr_api_key: settings.radarr_api_key ? '••••••••' : '',
    tautulli_url: settings.tautulli_url || '',
    tautulli_api_key: settings.tautulli_api_key ? '••••••••' : '',
    plex_configured: !!settings.plex_token
  };

  res.json(safeSettings);
});

router.patch('/settings', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { radarrUrl, radarrApiKey, tautulliUrl, tautulliApiKey } = req.body;
  const updates = {};

  if (radarrUrl) updates.radarr_url = radarrUrl;
  if (radarrApiKey && radarrApiKey !== '••••••••') updates.radarr_api_key = radarrApiKey;
  if (tautulliUrl !== undefined) updates.tautulli_url = tautulliUrl;
  if (tautulliApiKey && tautulliApiKey !== '••••••••') updates.tautulli_api_key = tautulliApiKey;

  if (Object.keys(updates).length > 0) {
    setSettings(updates);
  }

  res.json({ success: true });
});

export default router;
