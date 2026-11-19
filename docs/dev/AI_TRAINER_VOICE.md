# AI trainer voice

Spec for issue #1393: spoken cues that sound like a personal trainer who knows you. Conceptual
design, written before any code. The research behind it, with every source, is in
[`AI_TRAINER_VOICE_RESEARCH.md`](AI_TRAINER_VOICE_RESEARCH.md). The voice itself (which of the
phone's voices, premium or Personal Voice) is #1390; this spec assumes the lines are said with
whatever voice that work picks.

Answers marked **(assumption)** are my recommendation, not yet confirmed by the person who asked
for the feature. The questions behind them are listed at the end.

## Why a lifter wants this

A good trainer does not read numbers off a list. They know your last sessions, your goal and
what to be careful with, and between sets they tell you how that set went and what the next one
is for. openGym already knows all of that. Spoken cues today only say the facts ("Set 3, 80
kilos, 8 reps") or a fixed line from a style pack ("Breathe. You earned this break."). They
never say "one rep more than last time", which is the line that makes a lifter feel seen.

What the research supports, and what it does not:

- Encouragement gives a little more effort and a better mood, not more strength. Force on grip and
  isometric tests went up 5 to 12 %; a real squat 1RM moved about 2 kg, inside day-to-day noise
  (McNair 1996, Belkhiria 2018, Engel 2019). Encouragement also raised motivation to train again
  the next day (Edwards 2018).
- Telling a lifter their result helps them push the next set (Weakley 2023 meta-analysis).
- A cue on the bar or the floor beats a cue on the muscle for performance (Chua 2021,
  meta-analysis of 73 studies).
- About a third of people do not like being encouraged at all (Midgley 2018). So it stays opt-in.

What products show: no app does spoken, between-set strength coaching from the lifter's own log.
Apple's Workout Buddy is the closest, and its two named complaints are wrong numbers and
constant cheer. This design answers both: the app says every number, and the Coach writes calm
words that describe what happened.

## Goals

- Between sets, a short line about **this** set and **this** lifter: against the plan and last
  time, what the next set is for, in a trainer's words.
- A short opener (what today is about) and a short closer (how it went).
- Works with the phone in a pocket and the screen on, with no network during the workout.
- Every number is the app's. The Coach writes words, never numbers.
- Off by default. Uses the Coach the person already set up, under the same consent.
- When anything is missing (no Coach, no network, no answer yet, an exercise added mid-workout),
  the person still hears good lines: fixed ones that know the numbers.

## Non-goals (for this version)

- Talking to the trainer (voice questions, "my shoulder hurts"). The Coach's in-workout `adapt`
  job already covers changing the session by tap.
- Cues during a set (rep counting, "two more"). The app does not know when a set is under way or
  how the reps are going; it knows only when a set is ticked.
- The watch speaking on its own. Neither watch app speaks today. See "Left for later".
- Speaking with the phone locked. Spoken cues today only talk while the workout screen is on
  (`lib/spoken-cues.js` `live()`; the app keeps the screen awake with `lib/wakelock.js`). This
  feature keeps that limit.

## Anti-goals: what would make it annoying or creepy

- **Saying a wrong number.** The fastest way to lose trust (Workout Buddy said a 16-day streak
  for 307).
- **Talking too much.** At most one trainer line per rest, and silence when a set went to plan
  in the middle of an exercise.
- **Constant cheer.** "Amazing!" after a set that went badly is worse than silence.
- **Saying private things out loud.** The phone speaker is heard by the people around you. A
  line never names a body part, an injury, a condition, body weight or appearance. The Coach may
  adjust its advice for a limitation ("keep this one slow and smooth") without saying why.
- **Guilt.** No "you missed Tuesday", no comparison with other people, no shaming a short set.
- **Lectures.** No studies cited aloud, no science, no long explanations.
- **Medical advice.** The Coach's existing rule holds: it is not a doctor.

## How it works today (the code this builds on)

**Spoken cues** (`frontend/src/lib/spoken-cues.js`). Off by default (`S.spokenCues`). At fixed
moments the app says the facts of the next set and then one line from a style:

| Moment (`cues.*`) | Said today |
|---|---|
| `began` | the first exercise's name and first set |
| `restStarted` | the next set ("Set 3, 80 kilos, 8 reps"), then the style's `restStart` line, or `lastSet` before the exercise's last work set |
| `restLeft` (10 s) | the style's `tenLeft` line |
| `restOver` | the style's `restOver` line |
| `record` | the style's `record` line (`lib/set-records.js` trophy) |
| `movedOn` | the next set in a superset, facts only |
| `count` / `go` | "3", "2", "1", "Go!" for timed holds |

Styles (`lib/voice-styles.js`): `plain`, `calm`, `drill`, `hype`, `deadpan`, or `own` (lines the
person writes, at most 8 per moment, 120 characters each). Lines are English source strings
translated through `t()` into 25 languages; `pickLine` never repeats the line said just before.
Clips of one's own voice (`lib/voice-clips.js`) can replace a moment's line. Lines queue so a
clip and a line never overlap; music turns down for a line and never stops (`lib/speech.js`,
`RestAlertPlugin.swift`, `SpeechCue.java`).

**The Coach** (`api/coach/core/`, run on the server or, with the person's own key, on the phone
through `frontend/src/lib/coach-local.js`, same code). Each job is: an allowlisted payload
(`payload.js`, only named fields leave), a prompt (`api/coach/prompts/*.md`), the provider call,
a parser, a validator (`validate.js`, the security boundary), and one repair round with the
errors sent back. Jobs: `create`, `refine`, `review`, `debrief`, `ask`, `adapt`. A call takes
about 12 to 20 seconds (PR #1382 measured 12.9 s Sonnet, 20.8 s Haiku per review). PR #1382 adds
send-back rules: no number the payload lacks (`numbersOf`), no app field names (`fieldsOf`), no
check ids. Consent is asked once per provider and lists the data categories (`plan`, `training`,
`profile`, ...); the Coach is off until an admin or the phone's owner turns it on.

## Approaches considered

Ideas generated first, from smallest to boldest:

1. **Data-aware fixed lines, no AI.** The app compares each set with the plan and last time and
   picks a translated line with the numbers filled in: "One more rep than last time." Works for
   everyone, offline, free.
2. **A prepared script from the Coach (the issue's idea).** One Coach call when the workout
   starts writes the session's lines, with variants for how each set might go. The app picks and
   fills them live.
3. **On-device live lines.** Apple's Foundation Models or Gemini Nano write each line between
   sets.
4. **Hybrid:** the prepared script, with an on-device model rewording or filling gaps.
5. **A persona to pick:** the Coach writes in the tone of a style the person chooses (calm,
   drill, deadpan).
6. **Spoken debrief:** the existing `debrief` job's summary read out after the workout.
7. **The watch speaks through AirPods** when the phone stays in the locker.
8. **Bold: a live conversational trainer** you talk to through earbuds (a realtime voice API),
   which hears "that was heavy" and answers.

Narrowed to three real approaches:

| | A. Data-aware fixed lines | B. Prepared script + A as fallback | C. On-device live lines |
|---|---|---|---|
| How personal | numbers vs plan and last time; same words for everyone | numbers, plus the goal, the plan's purpose, the recent trend, careful advice for a limitation, in a trainer's words | like B, written live |
| Delay during the workout | none | none (written before the first rest) | 1 to 4 s a line, if it runs at all |
| Offline during the workout | yes | yes | yes |
| Who gets it | everyone with spoken cues | everyone with the Coach set up; others get A | iPhone 15 Pro and later with Apple Intelligence on, in 16 languages; Android's model is blocked in the background; no watch |
| Cost | free | one Coach call per workout (about $0.001 to $0.03, see Cost) | free |
| Privacy | nothing leaves | what the Coach already sends, under the same consent | nothing leaves |
| New dependencies | none | none | a native plugin per platform, or a 0.3 to 0.5 GB bundled model |
| Risk | sounds repetitive after weeks | the Coach writes a wrong or odd line (caught by the validator; numbers impossible) | device support, throttling, a 3B model's wording, language gaps |

**Picked: B, built on A.** A is not throwaway: its outcome check and slot filling are exactly
what B needs to pick and fill the Coach's lines, and its lines are B's fallback. C fails the
"everyone" test and the dependency rule today; it stays a later option for *preparing* the
script on the phone for free (see "Left for later"). Idea 5 is folded in cheaply (assumption:
later, see Settings). Ideas 6, 7 and 8 are left for later.

## The design

### Leading words

- **Script:** the lines the Coach writes for one workout, kept until that workout ends.
- **Slot:** a placeholder like `{reps}` in a line. Only the app fills slots, from the log.
- **Outcome:** how a set went, decided by the app: `beat`, `hit`, `short`, `hard`.
- **Fallback lines:** the fixed, translated, slot-filled lines used when the script has no line.

### Turning it on

A new style, **Your Coach** (`cueStyle: 'coach'`), in Settings → Timer alerts → Voice, next to
Calm coach and the others. It appears only when the Coach is set up for this profile or phone.
Picking it is the opt-in. If the Coach's consent for this provider was not given yet, the
existing consent sheet asks first; "Not now" leaves the style as it was. Spoken cues must be on,
as for every style.

Row copy (English source; translated like every string):
- Title: "Your Coach"
- Subtitle: "Lines written for each workout by your AI Coach. Plain lines when it can't answer."

### When the script is written

When a workout starts with the Coach style on, the app starts one Coach job, `voice`, in the
background. Nothing waits for it.

- The first set and its warm-ups take a few minutes, so the script is usually there before the
  first rest (a call takes 12 to 20 s).
- The opener is said when the script arrives, if no work set is ticked yet; otherwise it is
  skipped.
- Until it arrives, and for anything it lacks, the fallback lines speak.
- A job that fails says nothing about failing during the workout. It is noted in the Coach's
  history like any other job.
- The job counts against the Coach's daily cap, like every job. Over the cap: fallback lines.

The script is kept on the device for that workout only (in memory and in the Coach's device file
on the phone, so an app restart mid-workout keeps it), never in synced state, and dropped when
the workout ends. **(assumption)**

### The moments and the talk budget

Facts lines stay as they are. A trainer line replaces the style line; it is never added on top.

| Moment | Trainer line |
|---|---|
| Workout start (`began`) | the opener, once, when the script arrives in time |
| First work set of an exercise (`restStarted`, `movedOn` or `began` naming a new exercise) | that exercise's intro, once per exercise: what it is for today |
| Rest after a work set (`restStarted`) | the line for that set's outcome, when the outcome is `beat`, `short` or `hard`; the exercise's `last` line before its last work set; **nothing** when it was `hit` in the middle of an exercise |
| Record (`record`) | a record line, in place of that rest's outcome line |
| 10 s left, rest over | the plain lines ("10 seconds", "Rest is over"): short and timed, no trainer words |
| Workout finished | the closer, once (a new moment: today nothing is said at the end) |
| Warm-up sets, timed-hold counts | unchanged |

Talk budget:
- At most **one** trainer line per rest, after the facts.
- A line is at most 120 characters (`LINE_MAX`, about 8 s at normal speed); the opener and closer
  at most 200.
- One idea per line. One cue at a time.

On a typical session of 5 exercises × 3 work sets that is the opener, 5 intros, about 5 lines
before last sets, the outcome lines for sets that did not go to plan, any records and the
closer: around 12 to 18 lines in an hour, most rests with at most one line. **(assumption: the
research gives no number for how often is too often; this follows the products that work:
opener, rare calls, recap.)**

### The outcome: the app decides how a set went

A pure helper in `frontend/src/lib/` with a unit test beside it (training logic; CONTRIBUTING.md).
For the work set just ticked, against its planned target and against the same set last time
(the same comparison `lib/set-trend.js` and `lib/finish-compare.js` already make):

| Outcome | When (first match wins) |
|---|---|
| `short` | fewer reps (or seconds) than planned |
| `hard` | effort rated by hand at the top (`rir` 0 or `rpe` 10 on the row) on a set not marked to failure (`isFailureSet`, `lib/workout-model.js`); a failure set reads as RIR 0 in `rirOf` (`lib/effort.js`) by design, and going to failure on purpose is not "hard" news. An unrated set is never `hard`. |
| `beat` | more reps than planned, or more reps or weight than the same set last time |
| `hit` | everything else |

A record (`lib/set-records.js`) is not an outcome: it is its own moment, as today. The builder
may adjust the thresholds; the rule stays "the app decides, from the log".

### Slots: the app fills every number

A line may hold only these slots. The app fills them, in the units and words the facts line
already uses (`weightWords`, `tn`, `tnf` in `lib/spoken-cues.js`):

| Slot | Filled with | Usable in |
|---|---|---|
| `{exercise}` | the exercise's name in the app's language | any per-exercise line, record |
| `{weight}`, `{reps}` | the set just done ("80 kilos", "8 reps") | outcome lines, record |
| `{nextWeight}`, `{nextReps}` | the next set | outcome lines, `last` |
| `{lastWeight}`, `{lastReps}` | the same set last time | intro, outcome lines |
| `{moreReps}` | how many more reps than last time ("one rep", "2 reps") | `beat` only, and only when it is above 0 |
| `{minutes}`, `{records}`, `{sets}` | today's duration, records set, work sets done | closer |

A line whose slot cannot be filled at that moment (no last time, a weight of 0 on a bodyweight
exercise) is not said; the fallback line for that moment is said instead. The builder may add a
slot; each new slot needs a filler, a test, and an entry in the prompt.

### What the Coach is sent

A new payload kind in `api/coach/core/payload.js`, allowlisted field by field like the others,
built mostly from parts that exist:

- `prefs`: unit, language, effort scale.
- `profile`: goal, experience, limitations (the intake answers).
- `today`: the planned session, as `adapt` sends it (`cleanToday`): exercise ids and names,
  targets, planned sets. Each entry carries its index `i`, which the script refers to.
- `previous`: the last three times the same routine was trained, and the stall picture for its
  exercises, as `debrief` sends them.
- `tone`: `calm` **(assumption: one tone in this version)**.

Not sent: session and set notes, body weight, measurements, health data, cohort medians, media.
These categories are all on the existing consent list (`plan`, `training`, `profile`), so no new
consent category is needed. `docs/AI_COACH.md` "What actually leaves your server" gains the new
job.

### What the Coach writes back

A closed shape (a new schema in `schemas.js` and a prompt `api/coach/prompts/voice.md`):

```
{
  "coach_contract": 1,
  "opener": ["<1-2 variants>"],
  "exercises": [
    {
      "i": <index into today.entries>,
      "intro": ["<1-2>"],
      "beat": ["<1-3>"], "hit": ["<0-2>"], "short": ["<1-3>"], "hard": ["<1-3>"],
      "last": ["<1-2>"]
    }
  ],
  "record": ["<2-3, may use {exercise}>"],
  "closer": { "good": ["<1-2>"], "mixed": ["<1-2>"] }
}
```

`hit` lines exist for the one case they are said (a `hit` that is also before the last set uses
`last`); the builder may drop `hit` if it is never reached. Which closer is said is the app's
choice: `good` when no set was `short`, else `mixed`.

### What the prompt asks for

The research, turned into rules the prompt states and the evals check:

- Second person, choice-giving: "you could", "let's", not "you must" (Hooyman 2014, Hardy 2019).
- Between sets: what happened (through slots), then one idea for the next set. Describe; do not
  judge the person (Weakley 2023; the Strava AI study).
- Cues outside the body on compound and heavy lifts: "push the floor away", "drive the bar up"
  (Chua 2021, Marchant 2009). A muscle cue only on light isolation work for a muscle-growth goal
  (Calatayud 2016, Schoenfeld 2018).
- Speed words for effort: "drive it", "fast up" (Rendos 2019).
- Calm by default. Praise that matches the set: a `short` line is steady, never cheerful.
- Read the plan's purpose: a top set, a back-off set, a deload week, a stalled lift (from
  `previous` and the stall picture) get different words.
- A limitation shapes the advice without being named aloud.
- Every number through a slot. No digits in any line.
- The lifter's language; short sentences that sound natural spoken.

### How the lines are checked

`validateVoice` in `validate.js`, run on the server and on the phone alike:

- The shape is closed; every `i` names an entry of `today`; counts within the bounds above.
- Every line: a string, trimmed, 1 to 120 characters (opener and closer 200), **no digits at all**
  (stricter than #1382's number rule: here every number must come through a slot), only known
  slots, each slot allowed for that moment, braces balanced.
- No exercise ids, app field names or check ids in the text (#1382's `fieldsOf` and check-id
  rule).
- One repair round with the reasons, as every job has. **Then, unlike a review, a line that is
  still wrong is dropped on its own** and the rest of the script is kept: lines are independent,
  and a dropped line just falls back. A script with nothing left is treated as no script.
- `lean:` the no-digits rule does not catch numbers spelled as words ("eighty"). The prompt
  forbids them; tighten with a per-language word list if the evals show them.

### Fallback lines

A new pack in `lib/voice-styles.js` (`PACKS.coach`), English source with slots, translated into
every locale like the other packs, used per moment whenever the script has no usable line.
Examples of the source strings:

- intro: "{exercise}. Last time {lastWeight} for {lastReps}."
- beat: "{moreReps} more than last time. Nice work."
- short: "A bit short of the plan. Stay steady on the next one."
- hard: "That one was hard. Take the full rest."
- last: "Last set of {exercise}. Make it a clean one."
- record: "That's a new best on {exercise}."
- closer: "Done in {minutes} minutes. Good session."

The opener has no fallback: with no script, the workout starts with the facts, as today.

### Examples (as heard, after the app fills the slots)

A lifter with a strength goal, bench stalled at 80 kg for 8 for two weeks, a note about a sore
shoulder in their limitations:

- Opener: "Push day. Bench has stalled lately, so today is about one clean extra rep, not more
  weight."
- Bench intro: "Bench press. Last time 80 kilos for 8 reps. Let's see if one more is in there."
  (the Coach wrote "{exercise}. Last time {lastWeight} for {lastReps}. Let's see if one more is in
  there.")
- After a `beat` set: "One rep more than last time. Take the full rest, the next one counts."
  (written as "{moreReps} more than last time. ...")
- After a `short` set: "Short of the plan. Stay at 80 kilos for the next set rather than chasing
  it." (written with `{nextWeight}`)
- Overhead press intro (the limitation, unnamed): "Overhead press. Keep it slow and smooth today,
  stop a rep early if it doesn't feel right."
- Record: "That's a new best on incline press."
- Closer (`good`): "Done in 52 minutes, two records. That was a good push day."

### Settings

One new style row (above). Nothing else in this version. **(assumption)** Named and left out:
- a tone picker for the Coach style (calm, drill, deadpan): add when people ask for it; it is one
  more payload field and a line in the prompt;
- a "how chatty" control: add if people find the budget too much or too little; the obvious
  shape is "only records and the end" vs the default.

The rest of Settings → Voice works as before: voice, speed, pitch, own clips (a clip still wins
over a line for its moment).

### Cost

One Coach call per workout, and one more when the repair round runs. A rough size: about 5 to
7k tokens in (the shared Coach prompt is about 2.5k tokens, the task prompt and the payload the
rest) and 1 to 2k out. With Anthropic's prices on 2026-11-03, per workout:

| Model | Price in / out per million tokens | Per workout |
|---|---|---|
| Claude Haiku 5.5 | $0.10 / $0.50 | about $0.001 |
| Claude Haiku 4.5 | $1 / $5 | about $0.01 to $0.02 |
| Claude Sonnet 5.5 | $2 / $10 | about $0.02 to $0.03 |

Estimates, not measured; the builder measures them in the evals. Other providers vary. A model
on the person's own network costs nothing but may take minutes: then the script arrives late,
and the fallback lines carry the start of the workout.

### Privacy

- Off unless the person picks the style. With the Coach off (`COACH_DISABLED`, or not set up),
  the style does not appear and nothing is sent.
- Same provider, same consent sheet, same allowlist discipline as every Coach job.
- Sent once per workout at the start; nothing is sent during the workout.
- The script stays on the device and is dropped when the workout ends.
- No health words are said aloud (see Anti-goals).

### Offline

- No network at the start, or no answer: fallback lines for the whole workout.
- Network lost after the script arrived: no effect; the workout never needs the network.
- openGym Offline (no network build): the style does not appear (no Coach).

## Build order for the builder

Each step ships on its own and leaves the app working.

1. **Outcome helper and slot filler**, pure functions in `frontend/src/lib/` with unit tests.
2. **The `coach` style with fallback lines only**: `PACKS.coach`, the new moments (intro per
   exercise, outcome lines, the closer), the talk budget, translations in every locale
   (`check-locales`, `check-source-strings --strict`, the pt-BR fingerprint). Visible only with
   the Coach set up. Already useful without any AI.
3. **The `voice` job**: payload kind, schema, prompt, `validateVoice`, the server route
   (`POST /api/coach/voice`, plus `openapi.yaml`, which `openapi-routes.test.js` compares), the
   phone path in `coach-local.js` (same core), `build-coach-assets --check`. Payload allowlist
   test like the existing FR-11 one. Parity test still green.
4. **Wire the script into the cues**: start the job at `began`, keep the script for the workout,
   pick the line by moment and outcome, fall back per line.
5. **Evals**: add the `voice` job to the Coach evals (`scripts/coach-evals/`, from PR #1382) on
   the same six lifters: lines that pass the validator first time, lines dropped, digits caught,
   time per job, and a judge on "sounds like a calm trainer who knows this lifter".
6. **Docs**: `docs/AI_COACH.md` (the new job, what it sends), the Settings help for the style.

Prompt size: PR #1382 notes the review prompt is near its 20,000-character test limit. The
`voice` prompt is its own task file, so it has its own budget, but it shares `common.md`.

## Left for later (and when to add it)

- **The watch speaks** (phone in the locker, AirPods on the watch): send the script to the watch
  with the workout and speak there. Add after the phone version proves people keep it on.
  Unverified here: speech engines on watchOS and Wear OS, and how a watch shares audio with
  music.
- **Speaking with the phone locked**: needs the native side to hold the next lines, like the rest
  alert holds its cues. Add if people turn the screen off and miss the voice.
- **Writing the script ahead** (when the workout preview opens, or right after the previous
  workout), so even the opener is always ready. Add if the opener is often skipped.
- **On-device writer**: Apple's Foundation Models as one more Coach "provider" for this one job,
  free and private on recent iPhones. Add when a native plugin exists in the project for another
  reason; the validator already guards what a small model writes.
- **A spoken debrief** at the end from the existing `debrief` job.
- **Tone picker, chattiness control**: see Settings.
- **Remembering last week's lines** so wording varies from week to week. Add if evals or users
  say it repeats itself.
- **Live conversation**: not planned; it needs a network during the workout, costs per minute,
  and voice commands in gyms work badly (Vi earbuds reviews).

## Open questions, most important first

Asked one at a time, with my recommended answer. None is answered yet.

1. **Why do you want this, in one sentence?** Recommended: "to feel coached between sets with my
   phone in my pocket, by something that knows my numbers." Shapes whether the opener and closer
   matter or only the between-set lines.
2. **How chatty?** Recommended: the budget above (one line per rest at most, silence when a set
   went to plan). Alternative: only records and the end.
3. **Should the trainer mention limitations at all, given the phone speaker?** Recommended: shape
   the advice, never name the body part or the reason.
4. **Is the screen-on limit acceptable for the first version?** Recommended: yes; it is today's
   limit for all spoken cues.
5. **Fallback lines for everyone, or only with the Coach style?** Recommended: only with the
   Coach style in this version; offering the data-aware lines as a plain style for people with no
   Coach is a small follow-up worth asking Duarte about.
6. **Which tone?** Recommended: calm only, a picker later.
7. **A cost ceiling?** Recommended: none beyond the Coach's daily cap.
8. **The watch through AirPods: needed in the first version?** Recommended: no, later.
9. **Is skipping the opener when the script is late fine?** Recommended: yes.
