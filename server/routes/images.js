import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { serveImage, getCacheStats, clearCache } from '../services/imageCache.js';
import { requireNonGuestOrInvite, requireNonGuest, requireAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, '../../data/uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    const name = randomBytes(16).toString('hex');
    cb(null, `${name}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const router = Router();

router.get('/cache/stats', requireAdmin, (req, res) => {
  res.json(getCacheStats());
});

router.delete('/cache/clear', requireAdmin, (req, res) => {
  const deleted = clearCache();
  res.json({ deleted });
});

router.get('/:hash', serveImage);

router.post('/upload', requireNonGuest, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  const url = `/api/images/uploads/${req.file.filename}`;
  res.json({ url });
});

router.get('/uploads/:filename', requireNonGuestOrInvite, (req, res) => {
  const { filename } = req.params;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const filePath = join(uploadsDir, safeName);
  if (!existsSync(filePath)) {
    return res.status(404).send('Image not found');
  }
  res.set('Cache-Control', 'public, max-age=31536000');
  res.sendFile(filePath);
});

export default router;
