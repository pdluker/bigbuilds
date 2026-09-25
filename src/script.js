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
 * Accuracy and safety pass added Sep 25, 2026, from a third transcript
 * review (the Hither Green episode). That script invented passenger
 * testimony ("passengers said they heard...") by lifting the dramatic-beat
 * rule's own example sounds and attributing them to witnesses; credited
 * the crash with inventing ultrasonic rail testing (it was already in use);
 * aimed its listener question at "can you imagine what that felt like?"
 * mid-crash; never mentioned that anyone was hurt (49 people died); and
 * spent most of its length on the crash rather than the fix. Two changes:
 *   1. Prompt rules below tightened for each of those: sensory detail is
 *      narrator description, never attributed testimony; no overstated
 *      cause-and-effect; the listener question can't put the child inside
 *      the danger; a brief honest acknowledgement of human cost; American
 *      English for the St. Louis audience.
 *   2. A second-opinion review call (REVIEW_SYSTEM_PROMPT) checks every
 *      script for those same failure types — including checking the
 *      event's own facts against real history, since the ultrasonic error
 *      came from events.js — and triggers one targeted revision if it
 *      finds anything. Findings are returned as `review` so index.js can
 *      store them for spot-checking.
 */

const WORDS_PER_MINUTE = 138; // 115 (placeholder normal-speed estimate) x 1.2 confirmed narration speed — see tts.js's NARRATION_SPEED. Still a placeholder on top of a placeholder; recalibrate against a real episode's actual timing.
const MAX_RUNTIME_SECONDS = 300; // hard cap: 5 minutes
const TARGET_MAX_WORDS = 520; // prompt target ceiling — chosen to land the real audio around 4:00-4:30, leaving margin under the 5:00 cap
const HARD_RETRY_THRESHOLD_WORDS = 560; // only bother re-tightening if meaningfully over target, not off by a handful of words

const SYSTEM_PROMPT = `You are writing a narration script for "Big Builds," an audio show that introduces children to the astonishing things human beings have built, discovered, and accomplished.

The narrator is an older, authoritative-but-warm figure — not a grandfather telling nostalgic bedtime stories, not a children's-show host, not a lecturing professor. Think of the tradition of Michael Faraday's Christmas Lectures, Jacob Bronowski's "The Ascent of Man," Carl Sagan's sense of scale and wonder, David Attenborough's calm "look closer" invitation: a beloved old engineer who has spent a lifetime being fascinated by what people can do, and is delighted to let a smart kid in on the secret.

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
- If the event involves a disaster or failure, spend the majority of the script on the engineering ambition, the ingenuity involved, and what was built or learned afterward — the accident and investigation together should take well under half the story. Treat the difficult part briefly, gently, and factually, then move toward hope, resilience, or improvement. Never end an episode on the difficult part.
- Be honest about human cost. If people were hurt or lost their lives, say so once, plainly and gently (e.g. "many people were hurt, and some did not survive") — never imply that nobody was hurt, and never linger on it.
- Include one concrete comparison the listener can picture in real, physical terms — sized against something a 7-year-old has direct experience with (a school bus, a bathtub, a birthday candle, their own bedroom) rather than abstract words like "enormous," "vast," or "unlimited supply."
- Include one physical, felt analogy connecting the core mechanism to something the listener has actually done with their own body or senses — e.g. blowing on a campfire to make it flare up, shaking a soda can, the way a rubber band snaps. Ground the abstract in something they've physically experienced.
- Identify the single most dramatic or sensory moment in the story and give it real room — 2-3 full sentences of sensory description, never one flat line rushed past ("it derailed," "it collapsed," "it exploded"). This applies even to a mechanically "quiet" failure like a derailment, not only obvious ones like fire or collapse — find the physical sensation in it: the sudden lurch, the screech of metal on metal, the sound of couplers snapping apart, cars leaving the rails one after another. Stay within the no-graphic-detail rule above while still making the moment physically real rather than a bare statement of fact. Those example sensations are illustrations only — don't copy them word for word. Sensory detail must be the narrator painting the scene, never attributed to real people: do not write what passengers, witnesses, or workers said, heard, saw, or felt unless that testimony is in the facts provided. Describe the machine and the moment, not the inner experience of the people caught in it.
- Vary sentence rhythm on purpose. Don't write in a steady stream of medium-length explanatory sentences — drop in short, punchy sentences (3-6 words) right at turning points and dramatic beats, the way "The converter roared. Flames shot out." works better than one long sentence would.
- Include one genuine question addressed directly to the listener — inviting them to guess or predict what happens next, or how a problem might be solved — not the narrator musing rhetorically to himself. Never ask the listener to imagine being inside an accident, being in danger, or how it felt to be hurt or scared.
- Include at least 2-3 real, verifiable facts or numbers from the ones provided.
- Do not invent facts beyond what's provided or well-established public history. That includes specifics that merely sound plausible: how long a crack grew, what someone said, what "nobody had ever thought of." Don't overstate cause and effect — only say an event "led to" an invention or change if the facts say so, and don't claim something was invented in response to an event if it already existed.
- The audience is American. Use American English (flashlight not torch, tons not tonnes, fall not autumn, miles and feet), though place names and proper nouns stay as they are.
- Plain narration only — no sound effect cues, no stage directions, no markdown, no headers, no speaker labels.
- Total length across both parts: ${TARGET_MAX_WORDS - 60}-${TARGET_MAX_WORDS} words. This is a hard ceiling — the finished audio must run under 5 minutes, at roughly ${WORDS_PER_MINUTE} words per minute.
- Close with a short variation on the idea "and that's how we did it" — a recurring, earned refrain, not a repeated cliché. Vary the exact wording episode to episode while keeping that core idea of shared human achievement.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"narration": "the full script — hook then story — as one string", "summary": "one sentence, warm and inviting, for the episode list"}`;

const TIGHTEN_SYSTEM_PROMPT = `Tighten the following "Big Builds" narration script to under ${TARGET_MAX_WORDS} words total while preserving its hook-then-story structure, its warm-authoritative "we" voice, its factual content, and its closing line. Cut description and pacing, not substance or facts. Return ONLY valid JSON, no markdown fences: {"narration": "...", "summary": "..."}`;

const REVIEW_SYSTEM_PROMPT = `You are the fact-and-safety editor for "Big Builds," a family audio show that tells children real stories from engineering history. You review one narration script against the facts it was written from. Flag ONLY the problems below — not style, word choice, pacing, or anything you'd merely have written differently.

1. invented — a specific claim (a number, date, duration, cause, name, quote, or sequence of events) that is neither in the provided facts nor well-established public history. Pay special attention to invented testimony: anything attributed to what passengers, witnesses, or workers said, heard, saw, or felt.
2. inaccurate — anything you believe is historically wrong, including overstated cause and effect ("this led to the invention of...", "nobody had ever thought to ask...") or crediting an event with creating something that already existed. Flag it even when one of the provided facts appears to support it — the provided facts can themselves be wrong, and if so, say what the real history is.
3. question — a question that asks the listener to imagine being inside the accident or in danger, or how it felt to be hurt or scared.
4. human-cost — for an event where people were hurt or died, the script never acknowledges it or implies nobody was hurt; or, the opposite, it dwells on injury, death, or fear in graphic detail.
5. balance — for a disaster or failure story only: the accident and its investigation take up more of the script than the engineering, ingenuity, and what was learned or built afterward.

Return ONLY valid JSON, no markdown fences: {"issues": [{"type": "invented|inaccurate|question|human-cost|balance", "quote": "the exact passage", "problem": "what is wrong", "fix": "what it should say or do instead, grounded in real history"}]}. Return {"issues": []} if the script has none of these problems. Do not flag something just to have something to flag.`;

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
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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
    // tolerate a ```json fence around the object — the prompts ask for none,
    // but one stray fence shouldn't fail a whole episode
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
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

  // accuracy/safety review — one targeted revision if the editor flags
  // anything, then a second look purely for the record. Never blocks the
  // episode: a failed review or revision ships the draft as it stands.
  const review = { issues: null, revised: false, remainingIssues: null };
  review.issues = await reviewScript(event, parsed.narration, env);
  if (review.issues && review.issues.length > 0) {
    console.warn(`Script review flagged ${review.issues.length} issue(s) — requesting a revision`, review.issues);
    try {
      const revised = await callAnthropic(SYSTEM_PROMPT, buildRevisionPrompt(userPrompt, parsed, review.issues), env);
      if (revised.narration && revised.narration.length > 200) {
        parsed = revised;
        review.revised = true;
        review.remainingIssues = await reviewScript(event, parsed.narration, env);
        if (review.remainingIssues?.length) {
          console.warn('Issues remaining after revision:', review.remainingIssues);
        }
      }
    } catch (err) {
      console.warn('Revision failed, shipping unrevised draft:', err.message);
    }
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
    review,
  };
}

// Returns the editor's issue list ([] if clean), or null if the review call
// itself failed — callers treat null as "unreviewed", not "clean".
async function reviewScript(event, narration, env) {
  const reviewPrompt = `Event: ${event.title} (${event.year}), ${event.location}
Category: ${event.category}
Facts the script was written from:
${event.engineeringFacts.map((f) => `- ${f}`).join('\n')}

Script to review:
${narration}`;

  try {
    const result = await callAnthropic(REVIEW_SYSTEM_PROMPT, reviewPrompt, env);
    return Array.isArray(result.issues) ? result.issues : null;
  } catch (err) {
    console.warn('Script review failed, continuing unreviewed:', err.message);
    return null;
  }
}

function buildRevisionPrompt(originalPrompt, draft, issues) {
  const notes = issues
    .map((i) => `- [${i.type}] "${i.quote}" — ${i.problem} Fix: ${i.fix}`)
    .join('\n');
  return `${originalPrompt}

A draft of this episode has already been written, and an editor flagged the problems below. Rewrite it fixing every flagged problem — where a claim can't be made accurate, cut it rather than soften it. Keep everything the editor didn't flag (structure, voice, analogies, closing line) as close to the draft as you can, and stay within the same word limit.

Editor's notes:
${notes}

Draft:
${draft.narration}`;
}
