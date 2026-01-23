import db from '../db/index.js';

interface AttendanceRow {
  user_id: number;
}

interface AttendanceResult {
  attending: Set<number>;
  absent: Set<number>;
}

export function getAttendance(movieNightId: number): AttendanceResult {
  const attending = (
    db
      .prepare(
        `
    SELECT user_id FROM attendance 
    WHERE movie_night_id = ? AND status = 'attending'
  `
      )
      .all(movieNightId) as AttendanceRow[]
  ).map((a) => a.user_id);

  const absent = (
    db
      .prepare(
        `
    SELECT user_id FROM attendance 
    WHERE movie_night_id = ? AND status = 'absent'
  `
      )
      .all(movieNightId) as AttendanceRow[]
  ).map((a) => a.user_id);

  return {
    attending: new Set(attending),
    absent: new Set(absent),
  };
}
