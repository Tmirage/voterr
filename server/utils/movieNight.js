export function isMovieNightArchived(date, time = '20:00') {
  const now = new Date();
  const nightDateTime = new Date(`${date}T${time}:00`);
  const archivedAfter = new Date(nightDateTime.getTime() + 2 * 60 * 60 * 1000);
  return now >= archivedAfter;
}

export function isMovieNightLocked(night) {
  if (night.is_cancelled === 1) return true;
  return isMovieNightArchived(night.date, night.time);
}

export function getArchivedSqlCondition(tableAlias = 'mn') {
  return `datetime(${tableAlias}.date || 'T' || COALESCE(${tableAlias}.time, '20:00') || ':00', '+2 hours') <= datetime('now', 'localtime')`;
}

export function getUpcomingSqlCondition(tableAlias = 'mn') {
  return `datetime(${tableAlias}.date || 'T' || COALESCE(${tableAlias}.time, '20:00') || ':00', '+2 hours') > datetime('now', 'localtime')`;
}
