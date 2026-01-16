import cron from 'node-cron';
import db from '../db/index.js';

export function initScheduler() {
  generateUpcomingMovieNights();

  cron.schedule('0 0 * * 0', () => {
    generateUpcomingMovieNights();
  });

  cron.schedule('0 12 * * 0', () => {
    sendVotingOpenNotifications();
  });

  cron.schedule('0 18 * * 2', () => {
    sendVotingReminderNotifications();
  });

  cron.schedule('0 20 * * 2', () => {
    sendHostReminderNotifications();
  });

  cron.schedule('0 12 * * 3', () => {
    announceWinners();
  });

  console.log('Scheduler initialized');
}

function generateUpcomingMovieNights() {
  const schedules = db.prepare(`
    SELECT * FROM schedules WHERE recurrence_type != 'none'
  `).all();

  for (const schedule of schedules) {
    const advanceCount = schedule.advance_count || 1;
    
    for (let i = 0; i < advanceCount; i++) {
      const nextDate = getNextDateForRecurrence(schedule.day_of_week, schedule.recurrence_type, i);
      
      const existing = db.prepare(`
        SELECT id FROM movie_nights 
        WHERE schedule_id = ? AND date = ?
      `).get(schedule.id, nextDate);

      if (!existing) {
        db.prepare(`
          INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
          VALUES (?, ?, ?, ?, 'voting')
        `).run(schedule.group_id, schedule.id, nextDate, schedule.time);
        
        console.log(`Created movie night for ${nextDate}`);
      }
    }
  }
}

function getNextDateForRecurrence(dayOfWeek, recurrenceType, instanceOffset = 0) {
  const today = new Date();
  const currentDay = today.getDay();
  const targetDay = Number(dayOfWeek);
  let daysUntil = targetDay - currentDay;
  
  if (daysUntil <= 0) {
    daysUntil += 7;
  }

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + daysUntil);

  if (recurrenceType === 'weekly') {
    nextDate.setDate(nextDate.getDate() + (instanceOffset * 7));
  } else if (recurrenceType === 'biweekly') {
    nextDate.setDate(nextDate.getDate() + (instanceOffset * 14));
  } else if (recurrenceType === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + instanceOffset);
  }
  
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const day = String(nextDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sendVotingOpenNotifications() {
  console.log('Sending voting open notifications...');
}

function sendVotingReminderNotifications() {
  const upcomingNights = db.prepare(`
    SELECT mn.*, g.name as group_name
    FROM movie_nights mn
    JOIN groups g ON mn.group_id = g.id
    WHERE mn.date = date('now', '+1 day')
    AND mn.status = 'voting'
    AND mn.is_cancelled = 0
  `).all();

  for (const night of upcomingNights) {
    const voters = db.prepare(`
      SELECT DISTINCT v.user_id
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ?
    `).all(night.id);

    const voterIds = new Set(voters.map(v => v.user_id));

    const members = db.prepare(`
      SELECT user_id FROM group_members WHERE group_id = ?
    `).all(night.group_id);

    const nonVoters = members.filter(m => !voterIds.has(m.user_id));

    console.log(`Movie night ${night.id}: ${nonVoters.length} members haven't voted yet`);
  }
}

function sendHostReminderNotifications() {
  const nightsWithoutHost = db.prepare(`
    SELECT mn.*, g.name as group_name
    FROM movie_nights mn
    JOIN groups g ON mn.group_id = g.id
    WHERE mn.date = date('now', '+1 day')
    AND mn.host_id IS NULL
    AND mn.is_cancelled = 0
  `).all();

  for (const night of nightsWithoutHost) {
    console.log(`Movie night ${night.id} needs a host!`);
  }
}

function announceWinners() {
  const todaysNights = db.prepare(`
    SELECT mn.*, g.name as group_name
    FROM movie_nights mn
    JOIN groups g ON mn.group_id = g.id
    WHERE mn.date = date('now')
    AND mn.status = 'voting'
    AND mn.is_cancelled = 0
  `).all();

  for (const night of todaysNights) {
    const winner = db.prepare(`
      SELECT n.*, COUNT(v.id) as vote_count
      FROM nominations n
      LEFT JOIN votes v ON n.id = v.nomination_id
      WHERE n.movie_night_id = ?
      GROUP BY n.id
      ORDER BY vote_count DESC
      LIMIT 1
    `).get(night.id);

    if (winner) {
      db.prepare(`
        UPDATE movie_nights 
        SET winning_movie_id = ?, status = 'decided'
        WHERE id = ?
      `).run(winner.id, night.id);

      console.log(`Winner for ${night.group_name}: ${winner.title}`);
    }
  }
}
