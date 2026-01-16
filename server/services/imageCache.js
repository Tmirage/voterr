import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSetting } from './settings.js';

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'images');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getHash(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function isCachingEnabled() {
  return getSetting('cache_plex_images') === 'true';
}

export async function serveImage(req, res) {
  const { hash } = req.params;
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).send('Missing url parameter');
  }

  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, hash);

  if (fs.existsSync(cachePath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    return res.send(fs.readFileSync(cachePath));
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.redirect(url);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(cachePath, buffer);
    
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (error) {
    res.redirect(url);
  }
}

export function getProxiedImageUrl(originalUrl) {
  if (!originalUrl || !isCachingEnabled()) {
    return originalUrl;
  }
  const hash = getHash(originalUrl);
  return `/api/images/${hash}?url=${encodeURIComponent(originalUrl)}`;
}

export function getCacheStats() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  let totalSize = 0;
  for (const file of files) {
    totalSize += fs.statSync(path.join(CACHE_DIR, file)).size;
  }
  return { count: files.length, sizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100 };
}

export function clearCache() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  files.forEach(f => fs.unlinkSync(path.join(CACHE_DIR, f)));
  return files.length;
}
