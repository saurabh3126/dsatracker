const IST_TIME_ZONE = 'Asia/Kolkata';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BIWEEK_MS = 14 * 24 * 60 * 60 * 1000;

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedParts(date, timeZone) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });

  const parts = dtf.formatToParts(d);
  const map = Object.create(null);
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const weekdayIndex = WEEKDAY_TO_INDEX[map.weekday] ?? null;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekdayIndex,
  };
}

function addDaysYMD({ year, month, day }, days) {
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const d = new Date(date);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(d);
  const map = Object.create(null);
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  // Interpret the formatted local time as if it were UTC, then compare.
  const asUtcMs = Date.parse(
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}Z`,
  );

  return asUtcMs - d.getTime();
}

function zonedTimeToUtc({ year, month, day, hour, minute, second }, timeZone) {
  // Initial guess: treat wall-time as UTC.
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

export function formatContestStartsAtIST(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function getNextWeeklySunday8amIST(now = new Date()) {
  const parts = getZonedParts(now, IST_TIME_ZONE);
  if (!parts || parts.weekdayIndex == null) return null;

  const nowYmd = { year: parts.year, month: parts.month, day: parts.day };
  const daysUntilSunday = (7 - parts.weekdayIndex) % 7;

  let ymd = addDaysYMD(nowYmd, daysUntilSunday);
  let startsAtUtc = zonedTimeToUtc({ ...ymd, hour: 8, minute: 0, second: 0 }, IST_TIME_ZONE);

  if (startsAtUtc.getTime() <= new Date(now).getTime()) {
    ymd = addDaysYMD(ymd, 7);
    startsAtUtc = zonedTimeToUtc({ ...ymd, hour: 8, minute: 0, second: 0 }, IST_TIME_ZONE);
  }

  return {
    key: 'weekly-sun-8am-ist',
    title: 'Sunday Contest',
    startsAtUtc,
  };
}

export function getUpcomingSundayEndIST(now = new Date()) {
  const parts = getZonedParts(now, IST_TIME_ZONE);
  if (!parts || parts.weekdayIndex == null) return null;

  const nowYmd = { year: parts.year, month: parts.month, day: parts.day };
  const daysUntilSunday = (7 - parts.weekdayIndex) % 7;

  let ymd = addDaysYMD(nowYmd, daysUntilSunday);
  let endsAtUtc = zonedTimeToUtc({ ...ymd, hour: 23, minute: 59, second: 59 }, IST_TIME_ZONE);

  if (endsAtUtc.getTime() <= new Date(now).getTime()) {
    ymd = addDaysYMD(ymd, 7);
    endsAtUtc = zonedTimeToUtc({ ...ymd, hour: 23, minute: 59, second: 59 }, IST_TIME_ZONE);
  }

  return {
    key: 'weekly-sun-eod-ist',
    endsAtUtc,
  };
}

export function getNextBiweeklySaturday8pmIST(now = new Date()) {
  // Anchor: Feb 14, 2026 8:00 PM IST (nearest per requirement).
  const anchorUtc = zonedTimeToUtc(
    { year: 2026, month: 2, day: 14, hour: 20, minute: 0, second: 0 },
    IST_TIME_ZONE,
  );

  const nowMs = new Date(now).getTime();
  const anchorMs = anchorUtc.getTime();

  let nextMs = anchorMs;
  if (nowMs > anchorMs) {
    const periods = Math.floor((nowMs - anchorMs) / BIWEEK_MS) + 1;
    nextMs = anchorMs + periods * BIWEEK_MS;
  }

  return {
    key: 'biweekly-sat-8pm-ist',
    title: 'Biweekly Saturday Contest',
    startsAtUtc: new Date(nextMs),
  };
}

export function getNextContestIST(now = new Date()) {
  const a = getNextWeeklySunday8amIST(now);
  const b = getNextBiweeklySaturday8pmIST(now);

  if (!a) return b;
  if (!b) return a;

  return a.startsAtUtc.getTime() <= b.startsAtUtc.getTime() ? a : b;
}

export function isContestTomorrowIST(now = new Date(), contestStartsAtUtc) {
  const startsAt = new Date(contestStartsAtUtc);
  if (Number.isNaN(startsAt.getTime())) return false;

  const nowParts = getZonedParts(now, IST_TIME_ZONE);
  const startsParts = getZonedParts(startsAt, IST_TIME_ZONE);
  if (!nowParts || !startsParts) return false;

  const tomorrow = addDaysYMD({ year: nowParts.year, month: nowParts.month, day: nowParts.day }, 1);

  return (
    startsParts.year === tomorrow.year &&
    startsParts.month === tomorrow.month &&
    startsParts.day === tomorrow.day
  );
}

export const CONTEST_SCHEDULE_TEXT = 'Sunday 8:00 AM IST • Biweekly Saturday 8:00 PM IST';
