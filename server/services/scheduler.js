import cron from 'node-cron';
import db from '../db/index.js';
import { getNextDateForRecurrence } from '../utils/date.js';

export function initScheduler() {
  generateUpcomingMovieNights();

  cron.schedule('0 0 * * 0', () => {
    generateUpcomingMovieNights();
  });

  console.log('Scheduler initialized');
}

function generateUpcomingMovieNights() {
  const schedules = db.prepare(`
    SELECT * FROM schedules WHERE recurrence_type != 'none'
  `).all();

  for (const schedule of schedules) {
    const advanceCount = schedule.advance_count;
    
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
