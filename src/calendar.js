/**
 * calendar.js — seasonal/anniversary-aware event selection.
 *
 * A layer on top of index.js's plain "any unused event" pool cycling:
 * when possible, prefer an event that actually happened around this time
 * of year, so the show isn't narrating a blizzard during a heat wave.
 * Never blocks a publish — every tier here is a *preference*, and
 * index.js's picker always has a guaranteed fallback below it.
 *
 * Deployed location is St. Louis (northern hemisphere), so "today's
 * season" is computed from the northern calendar. A few events happened
 * in the southern hemisphere (Sydney, New Zealand) — those are tagged
 * `hemisphere: 'southern'` in events.js and get their season flipped six
 * months so the *felt* weather still lines up with what a St. Louis
 * listener is actually experiencing outside.
 */

const NORTHERN_SEASON_BY_MONTH = {
  1: 'winter', 2: 'winter', 3: 'spring', 4: 'spring', 5: 'spring',
  6: 'summer', 7: 'summer', 8: 'summer', 9: 'fall', 10: 'fall',
  11: 'fall', 12: 'winter',
};

const FLIP_SEASON = { winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The season a listener actually feels on a given date (always northern — St. Louis). */
export function seasonForDate(date) {
  return NORTHERN_SEASON_BY_MONTH[date.getUTCMonth() + 1];
}

/** The season an event's real-world weather corresponds to, hemisphere-corrected. */
export function seasonForEvent(event) {
  if (!event.month) return null;
  const season = NORTHERN_SEASON_BY_MONTH[event.month];
  return event.hemisphere === 'southern' ? FLIP_SEASON[season] : season;
}

/** True if today is the same calendar month as the event's real anniversary. */
export function matchesMonth(event, date) {
  return event.month != null && event.month === date.getUTCMonth() + 1;
}

/**
 * True if today falls within `windowDays` of the event's real month/day,
 * wrapping correctly across a year boundary (e.g. Dec 30 is close to Jan 2).
 * This is the "actually publishing near the real anniversary" tier —
 * intentionally hemisphere-naive, since an exact-date match is a nice
 * novelty regardless of which hemisphere the weather logic points to.
 */
export function isNearAnniversary(event, date, windowDays = 5) {
  if (!event.month || !event.day) return false;
  const year = date.getUTCFullYear();
  const anniversary = Date.UTC(year, event.month - 1, event.day);
  const today = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.abs(today - anniversary) / MS_PER_DAY;
  const wraparoundDays = 365 - diffDays;
  return Math.min(diffDays, wraparoundDays) <= windowDays;
}

/**
 * Picks the next event with calendar preference, cascading through tiers
 * until one has candidates. `pool` should already be filtered to unused
 * events (or the full reset pool) by the caller.
 */
export function pickWithCalendarPreference(pool, date, rng = Math.random) {
  const pickRandom = (arr) => arr[Math.floor(rng() * arr.length)];

  const anniversaryMatches = pool.filter((e) => isNearAnniversary(e, date));
  if (anniversaryMatches.length > 0) {
    return { event: pickRandom(anniversaryMatches), tier: 'anniversary' };
  }

  const monthMatches = pool.filter((e) => matchesMonth(e, date));
  if (monthMatches.length > 0) {
    return { event: pickRandom(monthMatches), tier: 'month' };
  }

  const currentSeason = seasonForDate(date);
  const seasonMatches = pool.filter((e) => seasonForEvent(e) === currentSeason);
  if (seasonMatches.length > 0) {
    return { event: pickRandom(seasonMatches), tier: 'season' };
  }

  return { event: pickRandom(pool), tier: 'fallback' };
}
