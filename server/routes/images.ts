import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { serveImage, getCacheStats, clearCache } from '../services/imageCache.js';
import { requireNonGuest, requireAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, '../../data/uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    const name = randomBytes(16).toString('hex');
    cb(null, `${name}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.get('/cache/stats', requireAdmin, (_req: Request, res: Response) => {
  res.json(getCacheStats());
});

router.delete('/cache/clear', requireAdmin, (_req: Request, res: Response) => {
  const deleted = clearCache();
  res.json({ deleted });
});

router.get('/:hash', serveImage);

router.post('/upload', requireNonGuest, upload.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image uploaded' });
    return;
  }
  const url = `/api/images/uploads/${req.file.filename}`;
  res.json({ url });
});

router.get('/uploads/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  if (!filename || typeof filename !== 'string') {
    res.status(400).send('Invalid filename');
    return;
  }
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');

  if (!safeName || safeName.includes('..') || safeName.startsWith('.')) {
    res.status(400).send('Invalid filename');
    return;
  }

  const filePath = join(uploadsDir, safeName);
  const resolvedPath = resolve(filePath);

  if (!resolvedPath.startsWith(resolve(uploadsDir))) {
    res.status(400).send('Invalid path');
    return;
  }

  if (!existsSync(filePath)) {
    res.status(404).send('Image not found');
    return;
  }
  res.set('Cache-Control', 'public, max-age=31536000');
  res.sendFile(filePath);
});

export default router;
