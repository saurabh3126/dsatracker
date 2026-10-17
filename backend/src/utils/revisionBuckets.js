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
  // Weekly reset boundary is Sunday 05:30 AM IST (Sunday 00:00 UTC).
  // We store dueAt as the instant *just before* the boundary.
  const now = new Date(value);
  if (Number.isNaN(now.getTime())) throw new Error('Invalid date');

  // Use UTC-based day start logic (00:00 UTC = 05:30 IST)
  const baseMs = startOfUtcDay(now).getTime();
  
  // In UTC time, we want the next Sunday 00:00
  const day = now.getUTCDay(); // 0 = Sun
  const daysUntilSunday = (7 - day) % 7;

  let sundayStartMs = baseMs + daysUntilSunday * 24 * 60 * 60 * 1000;
  // If we are already past the boundary today (e.g. it's Sunday 10:00 UTC),
  // then the "upcoming" Sunday is next week.
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
    // Weekly reset boundary is Sunday 5:30 AM IST (Sunday 00:00 UTC).
    // The "Friday Cutoff" rule for *scheduling* next Sunday stays based on IST days.
    const d = new Date(now);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
    
    // Check day in IST for the "Friday Cutoff" logic
    // We still want "Friday IST" work to push to *next* week.
    // Sunday (before 5:30 AM IST) counts as "late Saturday" -> also Friday/Sat bucket logic if user wants?
    // User requested "If completed before 5:30 AM... counts as THIS week... due immediately".
    // My logic: istDay=0 (Sun) -> afterFridayCutoff=false -> getUpcomingSunday -> Sunday 05:30 IST. Correct.
    const istDate = new Date(d.getTime() + IST_OFFSET_MS);
    const istDay = istDate.getUTCDay(); // 0 = Sun ... 5 = Fri, 6 = Sat
    
    // Friday/Saturday tasks are pushed to NEXT Sunday.
    // User requested "after Thursday" logic -> Friday (5), Saturday (6), and Sunday (0) join the next batch.
    const afterFridayCutoff = istDay === 5 || istDay === 6 || istDay === 0; 
    
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
