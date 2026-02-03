import db from '../db/index.js';
import { getNextDateForRecurrence } from '../utils/date.js';

interface Schedule {
  id: number;
  group_id: number;
  day_of_week: number;
  time: string;
  recurrence_type: string;
  advance_count: number;
}

interface ExistingMovieNight {
  id: number;
}

export function initScheduler(): void {
  generateUpcomingMovieNights();
  console.log('Scheduler initialized');
}

export function generateUpcomingMovieNights(): void {
  const schedules = db
    .prepare(
      `
    SELECT * FROM schedules WHERE recurrence_type != 'none'
  `
    )
    .all() as Schedule[];

  for (const schedule of schedules) {
    const advanceCount = schedule.advance_count;

    for (let i = 0; i < advanceCount; i++) {
      const nextDate = getNextDateForRecurrence(schedule.day_of_week, schedule.recurrence_type, i);

      const existing = db
        .prepare(
          `
        SELECT id FROM movie_nights 
        WHERE schedule_id = ? AND date = ?
      `
        )
        .get(schedule.id, nextDate) as ExistingMovieNight | undefined;

      if (!existing) {
        db.prepare(
          `
          INSERT INTO movie_nights (group_id, schedule_id, date, time, status)
          VALUES (?, ?, ?, ?, 'voting')
        `
        ).run(schedule.group_id, schedule.id, nextDate, schedule.time);

        console.log(`Created movie night for ${nextDate}`);
      }
    }
  }
}
