function startOfDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfUtcDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  d.setHours(23, 59, 59, 999);
  return d;
}

function endOfUtcDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function startOfUtcDayMs(value = new Date()) {
  return startOfUtcDay(value).getTime();
}

function getUpcomingSunday(value = new Date()) {
  // Weekly reset boundary is Sunday 5:30 AM IST, which is Sunday 00:00 UTC.
  // We store dueAt as the instant *just before* the boundary, i.e. end of the
  // previous UTC day.
  const now = new Date(value);
  if (Number.isNaN(now.getTime())) throw new Error('Invalid date');

  const baseMs = startOfUtcDayMs(now);
  const base = new Date(baseMs);
  const day = base.getUTCDay(); // 0 = Sun
  const daysUntilSunday = (7 - day) % 7;

  let sundayStartMs = baseMs + daysUntilSunday * 24 * 60 * 60 * 1000;
  if (sundayStartMs <= now.getTime()) sundayStartMs += 7 * 24 * 60 * 60 * 1000;

  return new Date(sundayStartMs - 1);
}

function getNextSunday(value = new Date()) {
  const upcomingDueAt = getUpcomingSunday(value);
  const upcomingStartMs = upcomingDueAt.getTime() + 1;
  const nextStartMs = upcomingStartMs + 7 * 24 * 60 * 60 * 1000;
  return new Date(nextStartMs - 1);
}

function getEndOfMonth(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return endOfDay(end);
}

function computeBucketDueAt(bucket, now = new Date()) {
  // "Today" resets at 5:30 AM IST, which is midnight UTC.
  if (bucket === 'today') return endOfUtcDay(now);
  if (bucket === 'week') return getUpcomingSunday(now);
  if (bucket === 'month') return getEndOfMonth(now);
  return null;
}

module.exports = {
  startOfDay,
  startOfUtcDay,
  endOfDay,
  endOfUtcDay,
  getUpcomingSunday,
  getNextSunday,
  getEndOfMonth,
  computeBucketDueAt,
};
