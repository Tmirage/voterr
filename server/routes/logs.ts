import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getLogs, getLogStats, clearLogs } from '../services/logger.js';

const router = Router();

router.get('/', requireAdmin, (req: Request, res: Response) => {
  const { level, category, limit, offset } = req.query;

  const logs = getLogs({
    level: typeof level === 'string' ? level : undefined,
    category: typeof category === 'string' ? category : undefined,
    limit: Math.min(parseInt(String(limit)) || 100, 500),
    offset: parseInt(String(offset)) || 0,
  });

  res.json(
    logs.map((l) => ({
      id: l.id,
      level: l.level,
      category: l.category,
      message: l.message,
      details: l.details ? (JSON.parse(l.details) as Record<string, unknown>) : null,
      ip: l.ip,
      userId: l.user_id,
      username: l.username,
      createdAt: l.created_at,
    }))
  );
});

router.get('/stats', requireAdmin, (_req: Request, res: Response) => {
  res.json(getLogStats());
});

router.delete('/clear', requireAdmin, (_req: Request, res: Response) => {
  const deleted = clearLogs();
  res.json({ deleted });
});

export default router;
