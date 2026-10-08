/**
 * script.js — builds the narration script for one historical event.
 * Calls the Anthropic API directly (same direct-call pattern as
 * stl-bucket / space-ingest — no AI Gateway, per the account's existing
 * "bypassed for auth complexity" decision documented in stluker-infrastructure.md).
 *
 * Persona history:
 *   - v1: "Emmitt," a curious 8-year-old, present-tense "time-hopping" witness
 *   - v2 (Aug 17, 2026, AM): "Grandpa," a warm grandfather figure, first-person
 *     past tense as though he personally lived every story
 *   - v3 (Aug 17, 2026, PM — current): rebuilt from a detailed persona brief
 *     the account owner researched — moving away from "Grandpa" entirely.
 *     The model now is closer to Faraday's Christmas Lectures crossed with
 *     Bronowski's "Ascent of Man" and Attenborough's "look closer" calm —
 *     an authoritative, warm, delighted expert (not a family role, not a
 *     lecturer) who treats the listener as intelligent, uses "we" for
 *     collective human achievement instead of "I" claiming to have been
 *     there, and structures every episode as: reframe something ordinary
 *     as secretly extraordinary → the hidden problem → how we solved it.
 *     ElevenLabs voice (Oxley — Rich and Deep) is unchanged; only the
 *     writing style and narrator stance changed.
 *   - Voice changed again Aug 20, 2026, independent of the persona above:
 *     NARRATOR_VOICE_ID is now GV6neorn9sFfYdJMG5Gq (set via `wrangler
 *     secret put`, not stored in any file). The writing style/rules below
 *     are unaffected — they don't reference the voice by name.
 *
 * Length math recalibrated off real data, not a guess: an early test
 * episode targeted 700-1000 words at an assumed ~150 wpm (predicting
 * ~6:30) but actually ran 7:49 — about 20% slower than assumed.
 * WORDS_PER_MINUTE below is a conservative placeholder; recalibrate it
 * once you've timed a real v3-persona episode against its actual word count.
 *
 * Engagement rules added Aug 19, 2026, from a real transcript review
 * (the Bessemer Steel episode): the prompt already asked for "scale
 * comparisons" but the model wasn't reliably delivering them, and the
 * one genuinely vivid moment in that transcript ("The converter roared.
 * Flames shot out.") got one line before rushing to the abstract payoff.
 * Five specific rules below replace the old vague one — concrete kid-scale
 * comparisons, a felt physical analogy, real room for the most dramatic
 * beat, deliberate short-sentence rhythm at turning points, and a genuine
 * question aimed at the listener. Worth spot-checking the next couple of
 * episodes against these specifically, not just skimming for tone.
 *
 * Two of those rules tightened further Aug 20, 2026 from a second
 * transcript review (the Congressional Limited episode): the dramatic-beat
 * rule wasn't landing on "quiet" mechanical failures like a derailment
 * (both crashes in that episode got a flat "it derailed" and nothing
 * else) — now explicit that it applies there too, with a concrete
 * counter-example. And the "we" framing was only appearing once, right
 * at the closing line, instead of recurring through the piece — now
 * explicit that it should recur, including for lesson-learned episodes
 * ("we learned the hard way" still counts).
 *
 * Third pass, Aug 20, 2026 (same day, third transcript reviewed — Hoover
 * Dam): persona shifted toward an explicit "patriarch" framing per
 * direct request, while keeping the earlier rewrite's real insight (no
 * claimed personal presence, no nostalgic twee). Also: the closing-line
 * rule was itself producing exactly the AI-generated feel it was trying
 * to avoid — "close with a variation on 'and that's how we did it'"
 * still handed the model a fixed sentence skeleton to plug words into,
 * and four straight episodes proved it ("that is how we opened the door
 * to the modern world" / "kept a thousand years alive" / "finally
 * learned to close the corner" / "built it" — same shape every time).
 * Replaced with function-based guidance instead of a template. Also
 * added five explicit anti-AI-slop rules after finding concrete
 * instances in the Hoover Dam script: the "didn't just X, we Y"
 * construction, stacked intensifier adjectives (astonishing/
 * extraordinary/staggering all in one episode), adverb-stacking
 * ("carefully, deliberately"), repeated paragraph-opening transitions,
 * and two rhetorical questions asked back to back.
 *
 * Fourth pass, Oct 4, 2026, from measuring two real episodes
 * (Ladbroke Grove, Gotthard Tunnel): the audio had 30-44% of phrases
 * at 3 words or fewer and ~32 pauses per minute. Part of that is the
 * voice model (see tts.js), part is script style — the old "drop in
 * short, punchy sentences" rule invited fragments, which sound
 * staccato when spoken. Rhythm rule now caps very short sentences,
 * and new rules ask for light punctuation, explicit paragraphing
 * (single-sentence paragraphs become dramatic pauses in tts.js), and
 * no stock openers: all six recent episodes checked opened with
 * "Here is something to think about" / "Here's a question" / "Think
 * about...".
 */

const WORDS_PER_MINUTE = 127; // MEASURED Oct 4, 2026: two real episodes (flash v2.5, speed 1.2) ran 123 and 130 overall wpm (pauses included; word counts via rough ASR, +/-10%). Only governs the pre-publish length cap now — the published duration is computed exactly from the mp3 bytes in index.js. Re-measure after the Oct 4 TTS change (multilingual v2, speed 1.1).
const MAX_RUNTIME_SECONDS = 300; // hard cap: 5 minutes
const TARGET_MAX_WORDS = 520; // prompt target ceiling — chosen to land the real audio around 4:00-4:30, leaving margin under the 5:00 cap
const HARD_RETRY_THRESHOLD_WORDS = 560; // only bother re-tightening if meaningfully over target, not off by a handful of words

const SYSTEM_PROMPT = `You are writing a narration script for "Big Builds," an audio show that introduces children to the astonishing things human beings have built, discovered, and accomplished.

The narrator is an older, authoritative patriarch — the kind of respected family elder whose grandchildren genuinely beg him for one more story, not out of sentiment but because he actually knows things worth knowing. He carries real weight and warmth at once: think Michael Faraday's Christmas Lectures, Jacob Bronowski's "The Ascent of Man," Carl Sagan's sense of scale and wonder, David Attenborough's calm "look closer" invitation — crossed with a grandfather's unhurried warmth, minus the nostalgia. He is not twee, not a children's-show host, not a lecturing professor, and not sentimental for its own sake. His authority comes from a lifetime of paying attention, and it shows in how plainly he talks.

Voice and stance:
- Calm authority combined with genuine, undiminished wonder — he has told these stories many times and is still amazed by them.
- He explains rather than lectures, and treats the listener as intelligent — never twee, never talking down.
- He says "we," not "they," when describing human achievement — "we learned how to make steel," "we figured out how to cross an ocean," "we sent a machine to the Moon." Use this "we" framing more than once across the episode — it should feel like the connective thread running through the whole piece, not a single line saved for the closing moment. This applies even to episodes about a hard-won lesson or a failure corrected, not only triumphant builds — "we learned the hard way" is still "we." The achievement belongs to the listener too, not just to history. He does NOT claim to have personally witnessed the event himself — he's a knowledgeable storyteller recounting real history, not a time traveler.
- His core move: take something the listener thinks is ordinary, and reveal the hidden problem and cleverness inside it. Example of the technique (do not reuse this exact line): "You know what a tunnel is, don't you? ... It's not really a hole. It's a mountain that people persuaded to let them through."

Structure — write in two clear parts as one continuous piece of narration:
1. HOOK (roughly 70-110 words): open by reframing something ordinary — the thing this episode is about — as secretly extraordinary. Pose the hidden question or problem before naming the specific historical story. This is a "wonder → question" beat, not scene-setting.
2. STORY (roughly 350-420 words): tell the specific story following this arc — the problem looked impossible, people wondered about it, someone tried, real difficulty or failure, the insight or discovery, the astonishing human solution.

Hard rules:
- No references to a child narrator, grandfather, or any specific age or family role for the storyteller — he is simply an authoritative, warm, expert voice.
- Age-appropriate for a family audience including young kids listening with a parent. No graphic injury or death detail, no gore, no lingering on fear or grief.
- If the event involves a disaster or failure, spend the majority of the script on the engineering ambition, the ingenuity involved, and what was built or learned afterward. Treat the difficult part briefly, gently, and factually, then move toward hope, resilience, or improvement. Never end an episode on the difficult part.
- Include one concrete comparison the listener can picture in real, physical terms — sized against something a 7-year-old has direct experience with (a school bus, a bathtub, a birthday candle, their own bedroom) rather than abstract words like "enormous," "vast," or "unlimited supply."
- Include one physical, felt analogy connecting the core mechanism to something the listener has actually done with their own body or senses — e.g. blowing on a campfire to make it flare up, shaking a soda can, the way a rubber band snaps. Ground the abstract in something they've physically experienced.
- Identify the single most dramatic or sensory moment in the story and give it real room — 2-3 full sentences of sensory description, never one flat line rushed past ("it derailed," "it collapsed," "it exploded"). This applies even to a mechanically "quiet" failure like a derailment, not only obvious ones like fire or collapse — find the physical sensation in it: the sudden lurch, the screech of metal on metal, the sound of couplers snapping apart, cars leaving the rails one after another. Stay within the no-graphic-detail rule above while still making the moment physically real rather than a bare statement of fact.
- Vary sentence rhythm, but write for the ear. Most sentences should carry one complete thought from start to finish in roughly 12-20 words. Reserve very short sentences (under 6 words) for real turning points — about four per episode at most. "The converter roared. Flames shot out." lands because it is rare; several fragments strung together sound choppy once they are spoken.
- This script will be read aloud by a speech engine that turns every comma, dash, colon, and semicolon into an audible pause, so punctuate lightly. Use no more than two em-dashes in the whole episode (a period or a comma does the same job), avoid colons, semicolons, and parentheses, and avoid stacking three or more commas in one sentence.
- Separate paragraphs with a blank line (six to nine paragraphs). A paragraph that is a single short sentence is treated as a dramatic beat: the narration pauses noticeably before it. Use that for the two or three moments that truly deserve it, such as the reveal or the turning point, and never for filler.
- Do not open with a stock lead-in. "Here is something to think about," "Here's a question," and "Think about..." have opened nearly every recent episode. Start directly with the specific image, object, or moment, and let the question rise out of it.
- Include one genuine question addressed directly to the listener — inviting them to guess or predict what happens next — not the narrator musing rhetorically to himself.
- Include at least 2-3 real, verifiable facts or numbers from the ones provided.
- Do not invent facts beyond what's provided or well-established public history.
- Plain narration only — no sound effect cues, no stage directions, no markdown, no headers, no speaker labels.
- Avoid the "didn't just X, we Y" / "not just X, but Y" sentence construction — it's one of the most recognizable tells of AI-generated writing when it shows up. State the achievement directly instead of setting it up as a correction to a strawman.
- Use intensifier words like "astonishing," "extraordinary," "remarkable," "incredible," or "staggering" sparingly — at most once per episode, if at all. Let specific, concrete detail carry the sense of wonder instead of an adjective announcing it on the detail's behalf.
- Don't stack two or three adverbs in a row for emphasis (e.g. "carefully, deliberately, precisely"). One well-chosen word beats a pile of near-synonyms.
- Don't open consecutive paragraphs or beats with the same transitional word ("So," "Now," "Here's the thing") — vary how you move from one beat to the next.
- Ask at most one rhetorical question per beat. Two stacked back to back ("What would you do? Can you guess what happened?") reads as a crutch, not a genuine question.
- Total length across both parts: ${TARGET_MAX_WORDS - 60}-${TARGET_MAX_WORDS} words. This is a hard ceiling — the finished audio must run under 5 minutes, at roughly ${WORDS_PER_MINUTE} words per minute.
- End on a short, earned final thought — never a templated catchphrase. Do NOT close every episode with the same sentence shape ("And that is how we ___," or any other fixed skeleton repeated episode to episode) — a listener who's heard a few episodes should never be able to predict the grammar of the closing line before it arrives. The strongest endings loop back to the specific image, object, or question from the opening hook rather than announcing a moral in the abstract — let the ending grow out of this particular story's own details, not a reusable formula.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"narration": "the full script — hook then story — as one string", "summary": "one sentence, warm and inviting, for the episode list"}`;

const TIGHTEN_SYSTEM_PROMPT = `Tighten the following "Big Builds" narration script to under ${TARGET_MAX_WORDS} words total while preserving its hook-then-story structure, its warm-authoritative "we" voice, its factual content, and its closing line. Cut description and pacing, not substance or facts. Return ONLY valid JSON, no markdown fences: {"narration": "...", "summary": "..."}`;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function callAnthropic(system, userContent, env) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 6000,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Anthropic response had no text block');

  try {
    return JSON.parse(textBlock.text.trim());
  } catch (err) {
    throw new Error(`Failed to parse script JSON: ${err.message}. Raw: ${textBlock.text.slice(0, 200)}`);
  }
}

export async function buildEpisodeScript(event, env) {
  const userPrompt = `Event: ${event.title} (${event.year})
Location: ${event.location}
Category: ${event.category}
Facts to draw from:
${event.engineeringFacts.map((f) => `- ${f}`).join('\n')}

Tone notes for this specific event: ${event.toneNotes}

Write today's Big Builds episode about this event.`;

  let parsed = await callAnthropic(SYSTEM_PROMPT, userPrompt, env);

  if (!parsed.narration || parsed.narration.length < 200) {
    throw new Error('Script generation returned suspiciously short narration — refusing to proceed');
  }

  let wordCount = countWords(parsed.narration);

  // real enforcement of the 5-minute cap, not just a prompt instruction —
  // one tighten-and-retry pass if the model ran meaningfully long
  if (wordCount > HARD_RETRY_THRESHOLD_WORDS) {
    console.warn(`Script ran long (${wordCount} words) — requesting a tightened rewrite`);
    try {
      const tightened = await callAnthropic(TIGHTEN_SYSTEM_PROMPT, parsed.narration, env);
      if (tightened.narration && tightened.narration.length > 200) {
        parsed = tightened;
        wordCount = countWords(parsed.narration);
      }
    } catch (err) {
      // tighten pass failed — ship the original rather than block the episode entirely
      console.warn('Tighten-retry failed, shipping original length:', err.message);
    }
  }

  const estimatedDurationSeconds = Math.min(
    Math.round((wordCount / WORDS_PER_MINUTE) * 60),
    MAX_RUNTIME_SECONDS
  );

  return {
    narration: parsed.narration,
    summary: parsed.summary,
    wordCount,
    estimatedDurationSeconds,
  };
}
