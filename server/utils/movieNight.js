export function isMovieNightArchived(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nightDate = new Date(`${date}T00:00:00`);
  return nightDate < today;
}

export function getTodayDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
