import db from '../db/index.js';

export function getAttendance(movieNightId) {
  const attending = db.prepare(`
    SELECT user_id FROM attendance 
    WHERE movie_night_id = ? AND status = 'attending'
  `).all(movieNightId).map(a => a.user_id);
  
  const absent = db.prepare(`
    SELECT user_id FROM attendance 
    WHERE movie_night_id = ? AND status = 'absent'
  `).all(movieNightId).map(a => a.user_id);
  
  return { 
    attending: new Set(attending), 
    absent: new Set(absent) 
  };
}
