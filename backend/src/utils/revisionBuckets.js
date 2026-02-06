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

function getUpcomingSunday(value = new Date()) {
  const d = startOfDay(value);
  const day = d.getDay(); // 0 = Sun
  const daysUntilSunday = (7 - day) % 7;
  d.setDate(d.getDate() + daysUntilSunday);
  return endOfDay(d);
}

function getNextSunday(value = new Date()) {
  const d = startOfDay(value);
  const day = d.getDay(); // 0 = Sun
  const daysUntilNextSunday = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + daysUntilNextSunday);
  return endOfDay(d);
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
