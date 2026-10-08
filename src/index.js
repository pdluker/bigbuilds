/**
 * Big Builds — twice-weekly kids' history/engineering podcast
 * Cloudflare Worker: fetch (site + feed + episodes) + scheduled (episode generation)
 *
 * Same shape as pokepod's index.js: export default { fetch, scheduled },
 * R2 for storage, cron for the schedule. See README.md for deploy steps.
 */

import { EVENTS } from './events.js';
import { buildEpisodeScript } from './script.js';
import { generateAudio, prepareForSpeech, resolveSettings } from './tts.js';
import { generateCoverArt } from './poster.js';
import { buildFeed } from './rss.js';
import { pickWithCalendarPreference } from './calendar.js';

const USED_EVENTS_KEY = 'used-events.json';
const EPISODES_KEY = 'episodes.json';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/feed.xml') {
      const episodes = await getEpisodes(env);
      const xml = buildFeed(episodes, env);
      return new Response(xml, {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
      });
    }

    if (url.pathname === '/episodes.json') {
      const episodes = await getEpisodes(env);
      return new Response(JSON.stringify(episodes, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // manual trigger, Bearer-auth like every other Worker in the stack.
    // ?asOf=YYYY-MM-DD lets you test what the calendar picker would choose
    // on any date without waiting for the real cron — e.g. ?asOf=2026-12-27
    // to confirm the Tay Bridge anniversary tier actually fires. Omit it
    // for a real, live-dated episode.
    if (url.pathname === '/refresh') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.REFRESH_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const asOf = url.searchParams.get('asOf');
      const now = asOf ? new Date(`${asOf}T12:00:00Z`) : new Date();
      if (isNaN(now.getTime())) {
        return new Response('Invalid asOf date — use YYYY-MM-DD', { status: 400 });
      }
      try {
        const result = await runEpisodeGeneration(env, now);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // A/B tool for narration pacing. Re-voices an EXISTING episode's stored
    // transcript with whatever settings you pass — publishes nothing, never
    // touches episodes.json or the event pool. Bearer-auth like /refresh.
    //   /tts-test?preview=1   -> JSON: the exact text that would be sent + settings
    //                            + estimated credits. No ElevenLabs call, costs nothing.
    //   /tts-test             -> mp3 of the latest episode using current defaults
    //   /tts-test?model=eleven_flash_v2_5&speed=1.2&cleanup=0&beats=0
    //                         -> reproduces the OLD (pre-Oct 4, 2026) configuration
    //   other params: episode=<id|eventId>, speed (0.7-1.2), stability (0-1),
    //                 similarity, style, beatSeconds, maxBeats
    // Save the mp3 with `curl.exe -o test.mp3 -H "Authorization: Bearer ..."`.
    if (url.pathname === '/tts-test') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.REFRESH_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const episodes = await getEpisodes(env);
      const want = url.searchParams.get('episode');
      const ep = want
        ? episodes.find((e) => e.id === want || e.eventId === want)
        : episodes.find((e) => e.transcript);
      if (!ep || !ep.transcript) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No episode with a stored transcript found (only episodes generated after Aug 17, 2026 have one).' }, null, 2),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const overrides = {};
      for (const k of ['model', 'speed', 'stability', 'similarity', 'style', 'cleanup', 'beats', 'beatSeconds', 'maxBeats']) {
        if (url.searchParams.has(k)) overrides[k] = url.searchParams.get(k);
      }
      const settings = resolveSettings(env, overrides);

      if (url.searchParams.get('preview')) {
        const spokenText = prepareForSpeech(ep.transcript, settings);
        const perChar = settings.model.includes('flash') ? 0.5 : 1.0; // credits per character
        return new Response(
          JSON.stringify({ episode: ep.id, settings, characters: spokenText.length, estimatedCredits: Math.round(spokenText.length * perChar), spokenText }, null, 2),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      try {
        const audio = await generateAudio(ep.transcript, env, overrides);
        const name = `bigbuilds-${ep.eventId}-${settings.model.replace('eleven_', '')}-speed${settings.speed}-stab${settings.stability}${settings.cleanup ? '' : '-rawtext'}${settings.beats ? '' : '-nobeats'}.mp3`;
        return new Response(audio, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': `attachment; filename="${name}"`,
            'X-TTS-Settings': JSON.stringify(settings),
            'Cache-Control': 'no-store',
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message, settings }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // audio + cover art served straight from R2, with real Range-request
    // support. This matters specifically for Apple Podcasts (AVFoundation
    // leans on byte-range streaming) — a browser <audio> tag or Overcast
    // will tolerate a flat 200/full-file response, Apple's app often won't.
    if (url.pathname.startsWith('/audio/') || url.pathname.startsWith('/art/')) {
      const key = url.pathname.slice(1);
      const range = parseRange(request.headers.get('range'));
      const object = await env.PODCAST_BUCKET.get(key, range ? { range } : undefined);
      if (!object) return new Response('Not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Accept-Ranges', 'bytes'); // tells clients range requests are supported at all

      if (range) {
        const end = range.length != null ? range.offset + range.length - 1 : object.size - 1;
        headers.set('Content-Range', `bytes ${range.offset}-${end}/${object.size}`);
      }

      const status = range ? 206 : 200;
      return new Response(object.body, { headers, status });
    }

    // everything else -> static assets (public/)
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runEpisodeGeneration(env, new Date(event.scheduledTime)));
  },
};

// Parses an incoming "Range: bytes=start-end" header into R2's {offset, length}
// shape. Returns undefined for no/unparseable range — the caller treats that
// as "serve the whole file, status 200" rather than throwing. Handles the
// open-ended case ("bytes=500-", no end given) by omitting length so R2
// serves to the end of the object.
function parseRange(header) {
  if (!header) return undefined;
  const match = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return undefined;
  const offset = Number(match[1]);
  const end = match[2] === '' ? undefined : Number(match[2]);
  return { offset, length: end != null ? end - offset + 1 : undefined };
}

async function getEpisodes(env) {
  const obj = await env.PODCAST_BUCKET.get(EPISODES_KEY);
  if (!obj) return [];
  const episodes = await obj.json();
  // backfill topicType for episodes published before this field existed —
  // derived live from events.js by eventId, no R2 migration needed. Falls
  // back to 'other' only if the source event was somehow removed from the pool.
  return episodes.map((ep) => ({
    ...ep,
    topicType: ep.topicType || EVENTS.find((e) => e.id === ep.eventId)?.topicType || 'other',
  }));
}

async function getUsedEventIds(env) {
  const obj = await env.PODCAST_BUCKET.get(USED_EVENTS_KEY);
  if (!obj) return [];
  return await obj.json();
}

function pickNextEvent(usedIds, now) {
  const unused = EVENTS.filter((e) => !usedIds.includes(e.id));
  const pool = unused.length > 0 ? unused : EVENTS; // cycle back through once the pool is exhausted
  return pickWithCalendarPreference(pool, now);
}

async function runEpisodeGeneration(env, now = new Date()) {
  const usedIds = await getUsedEventIds(env);
  const { event, tier } = pickNextEvent(usedIds, now);

  const script = await buildEpisodeScript(event, env);
  const audio = await generateAudio(script.narration, env);

  const episodeId = `${Date.now()}-${event.id}`;
  const audioKey = `audio/${episodeId}.mp3`;
  await env.PODCAST_BUCKET.put(audioKey, audio, {
    httpMetadata: { contentType: 'audio/mpeg' },
  });
  const audioSizeBytes = audio.byteLength; // needed for RSS <enclosure length="..."> — Apple Podcasts validates this

  // cover art is best-effort — never let it block an episode from shipping
  let artKey = null;
  try {
    const art = await generateCoverArt(event, env);
    if (art) {
      artKey = `art/${episodeId}.png`;
      await env.PODCAST_BUCKET.put(artKey, art, {
        httpMetadata: { contentType: 'image/png' },
      });
    }
  } catch (err) {
    console.error('poster generation failed (continuing audio-only):', err.message);
  }

  const episodes = await getEpisodes(env);
  const newEpisode = {
    id: episodeId,
    eventId: event.id,
    title: `${event.title} (${event.year > 0 ? event.year : Math.abs(event.year) + ' BCE'})`,
    summary: script.summary,
    transcript: script.narration,
    audioUrl: `${env.SHOW_SITE_URL}/${audioKey}`,
    audioSizeBytes,
    artUrl: artKey ? `${env.SHOW_SITE_URL}/${artKey}` : null,
    // exact, not estimated: ElevenLabs returns constant-bitrate 128 kbps mp3,
    // so bytes*8/128000 matches ffprobe to within ~0.03s (verified on two
    // real episodes). The old word-count estimate ran ~10% short, which put
    // a wrong itunes:duration in the RSS feed.
    durationSeconds: Math.round((audioSizeBytes * 8) / 128000),
    topicType: event.topicType || 'other',
    publishedAt: new Date().toISOString(),
    // 'anniversary' | 'month' | 'season' | 'fallback' — which calendar tier
    // picked this event; kept on the episode record so you can eyeball how
    // often real alignment is happening once this has run for a while
    selectionTier: tier,
  };
  episodes.unshift(newEpisode);

  await env.PODCAST_BUCKET.put(EPISODES_KEY, JSON.stringify(episodes.slice(0, 200)));

  const nextUsed = [...usedIds, event.id];
  const usedToStore = nextUsed.length >= EVENTS.length ? [] : nextUsed;
  await env.PODCAST_BUCKET.put(USED_EVENTS_KEY, JSON.stringify(usedToStore));

  return { ok: true, episode: newEpisode };
}
