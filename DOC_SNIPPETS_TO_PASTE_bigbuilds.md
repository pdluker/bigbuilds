# Snippets to paste into project docs — Big Builds (new project, Aug 15, 2026)

Per this project's Standing Operating Instruction #3: paste these in as
targeted additions — do not regenerate either doc from scratch.

Note: nothing in this project has been deployed yet. Everything below
describes a scaffolded build, not a live-confirmed one — treat it the same
way the Aug 7 pokepod entry did before its Aug 8 confirmation pass (state
what's confirmed vs. assumed, don't upgrade to "Live" until verified against
the real account).

---

## 1. For stluker-infrastructure.md — "Deployed applications" table

Add a row once deployed:

| App / Worker | Domain(s) | Notes |
|---|---|---|
| bigbuilds (Big Builds) | `builds.stluker.com` planned — NOT yet created/routed | Cloudflare Worker, R2 binding `PODCAST_BUCKET` → bucket `big-builds-podcast` (not yet created), optional `env.AI` binding for cover art, native Cron Trigger `0 13 * * 2,5` (Tue/Fri). Twice-weekly kids' history/engineering podcast — narrator "Emmitt" (age 8) time-hops to real events (Titanic, Golden Gate Bridge, Apollo 13, etc.), curated event pool in `events.js` (~20 events to start), strict tone-guardrail prompt in `script.js` (awe over doom, disasters land on what was learned/built better afterward). Reuses the pokepod audio pipeline pattern (ElevenLabs TTS via `tts.js`, same chunk-and-stitch approach) per explicit decision. Local folder: not yet placed — user to choose, e.g. `C:\Users\pdluk\big-builds\`.

Add to Local Deploy Reference table once a local folder + first deploy is confirmed:

| Worker / Project | Local Folder | Deploy Method |
|---|---|---|
| bigbuilds | TBD | `wrangler deploy` (assumed — not yet confirmed via a live `workers_list` check, same caveat pokepod's Aug 7 entry carried before its Aug 8 confirmation) |

---

## 2. For stluker-project-index.md — Subdomain → Project Map

Add a row once live:

| Subdomain | Lives in (Claude Project) | Source / Repo | Status | Next Action |
|---|---|---|---|---|
| builds.stluker.com | STLuker HQ (here) — or a new dedicated project, your call | Worker: bigbuilds + R2 `big-builds-podcast`. GitHub: not yet connected. | ⬜ Scaffolded, not deployed | Create R2 bucket, set 4 secrets, `wrangler deploy`, route the custom domain, confirm a manual `/refresh` produces a real episode end-to-end |

---

## 3. For stluker-project-index.md — Watch Items table

| Item | What to check | When | Status |
|---|---|---|---|
| Big Builds first deploy | Confirm via live `workers_list`/`r2` check: Worker actually created, R2 bucket exists, `builds.stluker.com` actually routed (not just referenced in `SHOW_SITE_URL`) — same class of gap pokepod's Aug 8 entry caught for its own domain | Next session touching bigbuilds | Pending — scaffolded Aug 15, 2026, not yet deployed |
| Big Builds first real episode | Confirm a manual `/refresh` produces a real script + audio file + working feed.xml entry, and that the tone guardrails actually held (spot-check one disaster-category episode, e.g. Titanic or Hindenburg, against the "no doom and gloom" brief) | After first deploy | Pending — flagged Aug 15, 2026 |
| Big Builds narrator voice | Decide: reuse pokepod's `COLOR_COMMENTARY_VOICE_ID` (same pipeline, same-sounding narrator as "Doc") or pick a distinct ElevenLabs voice for Emmitt | Before first deploy | Pending — flagged Aug 15, 2026, needs an account-owner decision |
| Big Builds cron placement | Decide: keep the native `0 13 * * 2,5` Worker cron (adds a 6th active cron trigger to the account) or fold it into stl-dispatcher as a new gated Task, matching the intel/stlBucket pattern instead | Before first deploy | Pending — flagged Aug 15, 2026 |

---

## 4. Nothing needed for Standing Operating Instructions

The three existing SOIs (resolve ambiguity before handoff, verify live state
before trusting docs, edit docs in place) already cover this project — no
new rule needed yet. If the em-dash/PowerShell 5.1 encoding issue comes up
again when generating any deploy scripts for this project, it's already
covered by the standing rule added during the pokepod Aug 7 session.

---

## 5. Update, Aug 17, 2026 — deployed live, persona pivoted to a grandfather storyteller

**Status correction:** everything above this section was written before
deployment. That's now stale — Big Builds is live at
`https://builds.stluker.com`, confirmed via a real routed custom domain,
a successful `wrangler deploy` with cron attached, and a real generated
test episode (Tangiwai, 1953) playing correctly on the live site.

**Persona change:** narrator "Emmitt" (curious 8-year-old, present-tense
"time-hopping" witness) replaced with an unnamed grandfather-storyteller
persona, voiced by ElevenLabs' "Oxley — Rich and Deep." No ElevenLabs
kids' voice was available. The time-hopping conceit was kept — Grandpa
does the hopping now instead of a kid. Episodes now open with a short
preamble (Grandpa setting up why the story's worth hearing) before the
story itself, and the target word count dropped from 700-1000 to
460-520 words to fit a slower storytelling voice under a hard 5-minute
runtime cap. `script.js` now computes `estimatedDurationSeconds` itself
from real word count instead of trusting the model's guess, and will
retry once with a tighten-the-script pass if a draft comes back
meaningfully over budget.

**Cadence change:** twice-weekly (Tue/Fri) → every other day
(`0 13 */2 * *`), now that upgrading to Workers Paid removed the
5-cron-per-account ceiling that made a 6th account-wide trigger
impossible on Free.

Update the app row in `stluker-infrastructure.md`'s "Deployed
applications" table and the Subdomain → Project Map row in
`stluker-project-index.md` to say `✅ Live` instead of `⬜ Scaffolded,
not deployed`, and correct the cron cadence and narrator name in both.

## 6. For stluker-project-index.md — Watch Items table

| Item | What to check | When | Status |
|---|---|---|---|
| Big Builds `WORDS_PER_MINUTE` calibration | `script.js`'s 115 wpm constant is an estimate derived from a *different* voice's timing (the pre-Oxley test episode), not a measured Oxley rate. Time a real Oxley-narrated episode against its actual word count and update the constant to match | After the first real Oxley episode airs | Pending — flagged Aug 17, 2026 |
| Big Builds `*/2` cron month-boundary quirk | Day-of-month `*/2` isn't a true period-2 cycle — watch for an occasional back-to-back pair of publish days around month transitions. Cosmetic only; not worth fixing unless it's actually noticed in practice | Ongoing, low priority | Pending — flagged Aug 17, 2026 |

---

## 7. Update, Aug 17, 2026 (later same day) — persona rebuilt again, transcripts added

**Persona v3:** the "Grandpa" persona (v2, same day) was replaced after
the account owner supplied a detailed researched persona brief. The new
narrator is an authoritative, warm "keeper of human knowledge" — modeled
on Faraday's Christmas Lectures, Bronowski's "Ascent of Man," Sagan's
sense of scale, and Attenborough's calm "look closer" narration style —
explicitly NOT a grandfather, not nostalgic, not claiming personal
witness. Uses "we" for collective human achievement ("we learned how to
make steel") rather than "I was there." Every episode now opens by
reframing something ordinary as secretly extraordinary (a Sagan/
Attenborough technique) before telling the specific historical story, and
closes on a variation of "and that's how we did it" as a recurring
signature line. Full reasoning and the persona brief's influence are in
`script.js`'s header comment.

**Transcripts added:** `index.js` now stores the full narration text as
`episode.transcript` in `episodes.json`. The site (`public/index.html`)
renders it as a collapsed "View transcript" disclosure under each
episode's audio player. Episodes generated before this change have no
transcript and simply don't show the toggle.

Update `stluker-infrastructure.md`'s bigbuilds row to note the persona is
now "v3" and no longer grandfather-branded, and add "expandable
transcripts" to its feature list.

---

## 8. Update, Aug 17, 2026 (later same day) — pool expanded 35 → 82 events

47 new entries added from an expanded reference brief: 24 disasters
(ships, trains, buildings, plus 2 dam failures added as a new adjacent
category) and 23 non-disaster "marvels" (bridges, tunnels/canals,
dams/water systems, aviation, space, and everyday inventions like the
shipping container and the elevator safety brake). This meaningfully
rebalances the show's emotional range — the pool was previously
disaster-heavy; it's now roughly balanced (34 disaster-with-hope, 38
build, 10 rescue).

Skipped as duplicates (already in the pool): Golden Gate Bridge, Brooklyn
Bridge, Panama Canal, Channel Tunnel, Hoover Dam, Wright Flyer, and the
existing Apollo 13/Saturn V entries (Apollo 11 — the Moon landing itself —
is a distinct new entry).

Skipped per the reference doc's own 🚫 flags, both "excluded" and
"optional/skip": SS General Slocum, RMS Lusitania, MV Wilhelm Gustloff,
Sampoong Department Store, Triangle Shirtwaist Factory, World Trade
Center, Grenfell Tower. Same reasoning as the original Aug 15 curation —
war/terrorism context, heavy concentration of child casualties, or still
within living-memory rawness.

Every new entry got a real `month`/`day` where one could be confidently
sourced (8 entries — ancient sites, broad-era technologies — have none,
same as the original Great Wall/Machu Picchu/Pyramids pattern). Tested
against `calendar.js`'s tiered picker post-merge: anniversary-tier matches
now fire noticeably more often with the denser pool (4 of 5 spot-check
dates hit an exact anniversary, versus roughly half before the
expansion) — direct evidence the calendar-alignment feature actually
gets better with a bigger pool, not just a longer content backlog.

**Not yet acted on:** the reference brief also suggested a target content
mix (~40% marvels, 25% inventors, 20% lessons-from-failure, 15%
systems/collaboration) and a ranked list of "strongest first episodes."
The current picker has no concept of category weighting — it's purely
calendar-tier based, so it'll naturally trend toward whatever's due by
date, not by the suggested ratio. Implementing weighted category
selection is a real design decision (worth the account owner's input on
whether it's wanted) rather than something to add silently — flagged as
a Watch Item below.

## 9. For stluker-project-index.md — Watch Items table

| Item | What to check | When | Status |
|---|---|---|---|
| Big Builds category-weighted selection | Decide whether `calendar.js`'s picker should also weight toward the suggested ~40/25/20/15 marvels/inventors/failures/systems mix, or stay purely calendar-driven. Currently purely calendar-driven | No fixed date — design decision, not a bug | Pending — flagged Aug 17, 2026 |
