export function getNextDateForRecurrence(dayOfWeek, recurrenceType, instanceOffset = 0) {
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
