export function isMovieNightArchived(date, time = '20:00') {
  const now = new Date();
  const nightDateTime = new Date(`${date}T${time}:00`);
  const archivedAfter = new Date(nightDateTime.getTime() + 2 * 60 * 60 * 1000);
  return now >= archivedAfter;
}
