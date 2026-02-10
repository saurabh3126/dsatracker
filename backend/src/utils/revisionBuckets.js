const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function startOfIstDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

function endOfIstDay(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(23, 59, 59, 999);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

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
  // Weekly reset boundary is Sunday 00:00 IST (Saturday 18:30 UTC).
  // We store dueAt as the instant *just before* the boundary.
  const now = new Date(value);
  if (Number.isNaN(now.getTime())) throw new Error('Invalid date');

  // Use IST-based day start logic
  const baseMs = startOfIstDay(now).getTime();
  const baseShifted = new Date(baseMs + IST_OFFSET_MS);
  
  // In shifted-to-UTC time, we want the next Sunday 00:00
  const day = baseShifted.getUTCDay(); // 0 = Sun
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
  // "Today" resets at 12:00 AM IST.
  if (bucket === 'today') return endOfIstDay(now);

  if (bucket === 'week') {
    // Weekly reset boundary is Sunday 12:00 AM IST.
    // To keep the "weekly" scope meaningful, any Week item created
    // after Friday 12:00 AM IST is scheduled for *next* Sunday
    // instead of the immediate upcoming Sunday.
    const d = new Date(now);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
    
    // Check day in IST
    const istDate = new Date(d.getTime() + IST_OFFSET_MS);
    const istDay = istDate.getUTCDay(); // 0 = Sun ... 5 = Fri, 6 = Sat
    
    const afterFridayCutoff = istDay === 5 || istDay === 6; // Fri/Sat task-days
    return afterFridayCutoff ? getNextSunday(d) : getUpcomingSunday(d);
  }
  if (bucket === 'month') return getEndOfMonth(now);
  return null;
}

module.exports = {
  startOfIstDay,
  endOfIstDay,
  startOfDay,
  startOfUtcDay,
  endOfDay,
  endOfUtcDay,
  getUpcomingSunday,
  getNextSunday,
  getEndOfMonth,
  computeBucketDueAt,
};
