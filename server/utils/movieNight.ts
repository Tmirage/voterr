interface MovieNight {
  is_cancelled: number;
  date: string;
  time: string;
  host_id?: number | null;
}

export function isMovieNightArchived(date: string, time = '20:00'): boolean {
  const now = new Date();
  const nightDateTime = new Date(`${date}T${time}:00`);
  const archivedAfter = new Date(nightDateTime.getTime() + 2 * 60 * 60 * 1000);
  return now >= archivedAfter;
}

export function isMovieNightLocked(night: MovieNight): boolean {
  if (night.is_cancelled === 1) return true;
  return isMovieNightArchived(night.date, night.time);
}

export function getArchivedSqlCondition(tableAlias = 'mn'): string {
  return `datetime(${tableAlias}.date || 'T' || COALESCE(${tableAlias}.time, '20:00') || ':00', '+2 hours') <= datetime('now', 'localtime')`;
}

export function getUpcomingSqlCondition(tableAlias = 'mn'): string {
  return `datetime(${tableAlias}.date || 'T' || COALESCE(${tableAlias}.time, '20:00') || ':00', '+2 hours') > datetime('now', 'localtime')`;
}
