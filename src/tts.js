/**
 * tts.js — turns a narration script into an mp3 via ElevenLabs.
 * Same pipeline pokepod already uses (per your call to reuse it): the
 * eleven_flash_v2_5 model supports up to 40,000 characters per request, so a
 * normal 700-1000 word episode goes out as a single call. MAX_BLOCK_CHARS is
 * a safety cap carried over from pokepod for the rare long episode.
 *
 * NARRATION_SPEED — set to 1.2, not the originally-requested 1.25. This is
 * now confirmed, not guessed: 1.25 was live-tested against the real API on
 * Aug 19-20, 2026 and rejected outright with a 400 (invalid_voice_settings),
 * not silently clamped as the earlier speculation here suggested might
 * happen. Every /refresh call between when 1.25 was deployed and this fix
 * failed at the TTS step before ever reaching R2 — no episodes were lost,
 * but none were generated either during that window. 1.2 is the real,
 * confirmed ceiling for this model; do not raise this again without
 * re-testing live, since ElevenLabs' own docs disagree with themselves
 * about what the range even is.
 * Not supported on the newest Eleven v3 model, but flash v2.5 (used below)
 * does support it.
 */

const MAX_BLOCK_CHARS = 8000;
const NARRATION_SPEED = 1.2; // confirmed ceiling — see comment above; ElevenLabs hard-rejects anything above this, does not clamp

export async function generateAudio(narrationText, env) {
  const blocks = splitIntoBlocks(narrationText, MAX_BLOCK_CHARS);
  const buffers = [];

  for (const block of blocks) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.NARRATOR_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: block,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: NARRATION_SPEED },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs error: ${res.status} ${await res.text()}`);
    }

    buffers.push(await res.arrayBuffer());
  }

  if (buffers.length === 1) return buffers[0];

  // stitch multiple mp3 buffers back-to-back — works for ElevenLabs' constant
  // output format; same approach used for pokepod's rare long-episode case
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    combined.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return combined.buffer;
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
