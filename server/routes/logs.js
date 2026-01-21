import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getLogs, getLogStats, clearLogs } from '../services/logger.js';

const router = Router();

router.get('/', requireAdmin, (req, res) => {
  const { level, category, limit, offset } = req.query;
  
  const logs = getLogs({
    level,
    category,
    limit: Math.min(parseInt(limit) || 100, 500),
    offset: parseInt(offset) || 0
  });
  
  res.json(logs.map(l => ({
    id: l.id,
    level: l.level,
    category: l.category,
    message: l.message,
    details: l.details ? JSON.parse(l.details) : null,
    ip: l.ip,
    userId: l.user_id,
    username: l.username,
    createdAt: l.created_at
  })));
});

router.get('/stats', requireAdmin, (req, res) => {
  res.json(getLogStats());
});

router.delete('/clear', requireAdmin, (req, res) => {
  const deleted = clearLogs();
  res.json({ deleted });
});

export default router;
