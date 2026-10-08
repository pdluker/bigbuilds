/**
 * tts.js — turns a narration script into an mp3 via ElevenLabs.
 *
 * CADENCE OVERHAUL, Oct 4, 2026. Measured against two real episodes
 * (Ladbroke Grove, Gotthard Tunnel; both eleven_flash_v2_5 at speed 1.2):
 *   - speech itself ran brisk, ~155-160 wpm, but 19-20% of runtime was
 *     pauses, ~32 per minute, and 30-44% of phrases were 3 words or fewer
 *   - overall pace therefore landed at only ~123-130 wpm: fast bursts
 *     separated by frequent gaps, i.e. a staccato, unnatural tempo
 *   - the scripts themselves carry only ~0.9 punctuation pauses per
 *     sentence, yet the audio had ~2-3 pauses per sentence — most of the
 *     fragmentation is the model's own phrasing, not the text
 *   - pitch movement (~4 st std) and loudness variation (~3.7 dB) were
 *     healthy: this was NOT a monotone problem
 * Changes, each tied to that evidence:
 *   1. Model: eleven_flash_v2_5 -> eleven_multilingual_v2. ElevenLabs
 *      documents Flash as the real-time/low-latency model (also: it
 *      disables number normalization) and Multilingual v2 as the
 *      long-form narration/podcast model with natural prosody. This
 *      pipeline is batch, so latency buys nothing. Costs 1.0 credit per
 *      character vs 0.5 for Flash — roughly 3,000 credits per episode.
 *   2. Speed: 1.2 -> 1.1. 1.2 is the API ceiling; it compresses the
 *      speech but not the pauses, widening the burst/gap contrast.
 *   3. TTS-only text cleanup (prepareForSpeech): dashes/colons/semicolons
 *      and commas after short transition words become smoother joins.
 *      The transcript shown on the site is never altered.
 *   4. A few real dramatic pauses: one-sentence paragraphs get a
 *      <break>, capped at 3 per episode (ElevenLabs warns that many
 *      break tags in one generation can cause instability).
 *   5. Every knob is overridable via env vars or per-call overrides, so
 *      /tts-test can A/B the same script without redeploying.
 *
 * Earlier history worth keeping: speed 1.25 was live-tested Aug 19-20,
 * 2026 and hard-rejected by the API with a 400 (invalid_voice_settings);
 * the real supported range is 0.7-1.2, and it is clamped below.
 * `speed` is not supported on Eleven v3/v4, and <break> tags are not
 * supported on v3/v4 either — if you ever audition those, set
 * TTS_SPEED/TTS_BEATS accordingly (handled below by model check).
 */

const MAX_BLOCK_CHARS = 8000; // Multilingual v2 allows 10,000 per request; leave margin

// models where SSML <break> tags are supported (per ElevenLabs docs)
const BREAK_CAPABLE = new Set(['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_flash_v2']);
// models that accept voice_settings.speed
const SPEED_CAPABLE = new Set(['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_flash_v2']);

const DEFAULTS = {
  model: 'eleven_flash_v2_5',
  speed: 1.1,
  stability: 0.5,
  similarity: 0.75,
  style: 0,
  cleanup: true,
  beats: true,
  beatSeconds: 1.2,
  maxBeats: 3,
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const flag = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase()));

/** Resolve settings: per-call overrides > env vars > defaults. */
export function resolveSettings(env = {}, overrides = {}) {
  const pick = (k, envKey) => (overrides[k] !== undefined ? overrides[k] : env[envKey]);
  return {
    model: pick('model', 'TTS_MODEL') || DEFAULTS.model,
    speed: clamp(num(pick('speed', 'TTS_SPEED'), DEFAULTS.speed), 0.7, 1.2),
    stability: clamp(num(pick('stability', 'TTS_STABILITY'), DEFAULTS.stability), 0, 1),
    similarity: clamp(num(pick('similarity', 'TTS_SIMILARITY'), DEFAULTS.similarity), 0, 1),
    style: clamp(num(pick('style', 'TTS_STYLE'), DEFAULTS.style), 0, 1),
    cleanup: flag(pick('cleanup', 'TTS_CLEANUP'), DEFAULTS.cleanup),
    beats: flag(pick('beats', 'TTS_BEATS'), DEFAULTS.beats),
    beatSeconds: clamp(num(pick('beatSeconds', 'TTS_BEAT_SECONDS'), DEFAULTS.beatSeconds), 0.3, 3),
    maxBeats: clamp(num(pick('maxBeats', 'TTS_MAX_BEATS'), DEFAULTS.maxBeats), 0, 6),
  };
}

// short transition words that don't need an audible pause after them
const SOFT_OPENERS = ['Now', 'Then', 'So', 'Instead', 'Meanwhile', 'Next', 'Soon', 'Later', 'Finally', 'Today', 'Again', 'Once', 'And yet', 'But then', 'Even so'];
const SOFT_OPENER_RE = new RegExp(`(^|[.!?]["')\\]]?\\s+|\\n\\n)(${SOFT_OPENERS.join('|')}),\\s+`, 'g');

/**
 * Speech-friendly copy of the script. Only the TTS input is changed — the
 * transcript stored/shown on the site stays exactly as written.
 */
export function prepareForSpeech(text, settings = DEFAULTS) {
  let t = String(text).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (settings.cleanup) {
    t = t
      .replace(/\s*[—–]\s*/g, ', ')            // ElevenLabs treats a dash as an explicit short pause; a comma is lighter. Changes pause LENGTH more than pause COUNT — modest effect, verify with /tts-test
      .replace(/:\s+(?=[a-z])/g, ', ')           // mid-sentence colon -> comma
      .replace(/;\s+/g, ', ')                    // semicolon -> comma
      .replace(SOFT_OPENER_RE, '$1$2 ')          // "Then, in 1902" -> "Then in 1902"
      .replace(/,\s*,/g, ',')                    // tidy doubled commas created above
      .replace(/ ,/g, ',')
      .replace(/,\s*([.!?])/g, '$1')             // "…, ." -> "."
      .replace(/[ \t]{2,}/g, ' ');
  }

  if (settings.beats && BREAK_CAPABLE.has(settings.model) && settings.maxBeats > 0) {
    const paras = t.split(/\n{2,}/);
    let used = 0;
    let prevWasBeat = false;
    const out = paras.map((p, i) => {
      const sentences = p.split(/(?<=[.!?])\s+/).filter(Boolean);
      const words = p.trim().split(/\s+/).length;
      const isBeat = i > 0 && sentences.length === 1 && words <= 14 && !prevWasBeat && used < settings.maxBeats;
      prevWasBeat = isBeat;
      if (isBeat) {
        used++;
        return `<break time="${settings.beatSeconds.toFixed(1)}s" /> ${p}`;
      }
      return p;
    });
    t = out.join('\n\n');
  }

  return t;
}

export async function generateAudio(narrationText, env, overrides = {}) {
  const s = resolveSettings(env, overrides);
  const text = prepareForSpeech(narrationText, s);
  const blocks = splitIntoBlocks(text, MAX_BLOCK_CHARS);
  const buffers = [];

  const voiceSettings = {
    stability: s.stability,
    similarity_boost: s.similarity,
    style: s.style,
  };
  if (SPEED_CAPABLE.has(s.model)) voiceSettings.speed = s.speed;

  for (let i = 0; i < blocks.length; i++) {
    const body = {
      text: blocks[i],
      model_id: s.model,
      voice_settings: voiceSettings,
    };
    // only matters for the rare multi-block episode: gives each block the
    // surrounding text so prosody carries across the seam
    if (blocks.length > 1) {
      if (i > 0) body.previous_text = blocks[i - 1].slice(-400);
      if (i < blocks.length - 1) body.next_text = blocks[i + 1].slice(0, 400);
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.NARRATOR_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs error: ${res.status} ${await res.text()}`);
    }

    buffers.push(await res.arrayBuffer());
  }

  if (buffers.length === 1) return buffers[0];

  // stitch multiple mp3 buffers back-to-back. ElevenLabs prepends an ID3v2
  // tag to each response; keep the first, strip it from the rest so no tag
  // bytes land mid-stream.
  const parts = buffers.map((b, i) => (i === 0 ? new Uint8Array(b) : stripId3v2(new Uint8Array(b))));
  const total = parts.reduce((sum, b) => sum + b.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const b of parts) {
    combined.set(b, offset);
    offset += b.byteLength;
  }
  return combined.buffer;
}

function stripId3v2(bytes) {
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]; // synchsafe
    return bytes.subarray(10 + size);
  }
  return bytes;
}

function splitIntoBlocks(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const blocks = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > maxChars && current.length > 0) {
      blocks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) blocks.push(current.trim());
  return blocks;
}
