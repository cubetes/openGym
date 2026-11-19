# The workout heart-rate chart (#1391)

Status: spec, not built. Written 2026-11-19 on `release-1.4.6`. Research and sources:
[WORKOUT_HEART_RATE_CHART.research.md](WORKOUT_HEART_RATE_CHART.research.md).
Sibling: #1392 (effort to Apple Health), which should use the same zones (see "Zones").

Decisions marked **(assumed)** were taken without the user's answer; the questions behind them are
at the end, most important first.

## Why, for the lifter

After a workout openGym shows what you lifted, but not what it cost you. The watch saw every beat
and throws the line away at the end. With it on the workout you can see, at a glance:

- which exercises were really hard (the peaks sit on the squats, not the curls);
- whether you recovered between sets (does the line come back down before the next one?);
- whether a session was steady or a scramble (rests that got shorter as time ran out);
- how today compares with the same routine last week, in the same place you already look.

Apple Fitness shows a heart-rate chart for a strength workout, but it knows nothing about your sets.
Garmin Connect shows the chart and your sets side by side, and its users have asked for years to see
the sets on the chart. WHOOP is the one app that lines the two up, and lifters praise exactly that.
openGym already knows when every set was ticked, so it can do what WHOOP does, for free, on the
user's own server.

## Goals

1. In a past workout's detail, a heart-rate card: average and range, a line over the whole session
   coloured by zone, each set marked on it, and the time in each zone under it.
2. Tap a set on the chart to see which set it was and its own average and max.
3. The line is saved on the workout, so it syncs to every device and the web, and rides in backups.
4. It comes from the Apple Watch and the Wear OS watch the same way, in the same release.
5. Workouts logged with any other watch that saves to Apple Health or Health Connect get the line
   too, through the hub read the phone already does for the last day's workouts.

## Non-goals (not now; when to add them)

- **Older workouts from Apple Health / Health Connect.** Phase 2, see "Phase 2". Add when phase 1
  has shipped and people ask for their history.
- **A recovery number** (how far the heart drops in the minute after a set). No rival shows one, so
  it could stand out, but it is a new metric to explain and test. Add once the chart has shipped and
  the rests on it look trustworthy.
- **Apple's zone method** (heart-rate reserve, which needs the resting heart rate). Our watches use %
  of max; the chart must match them. Change all three together if ever.
- **A live chart on the phone during the workout.** The watch has its Pulse page.
- **Garmin's watch app** (`garmin/`) sending a line. Garmin workouts reach the chart through the hub
  read instead (Garmin Connect writes to Apple Health and Health Connect).
- **Heart rate in the CSV export, the MCP tools or the Coach.** The JSON backup carries it for free.

## Anti-goals (never)

- **No grade from zones.** Never "only 3 minutes in Zone 4" or a cardio score on a lifting day. Every
  rival that grades lifting by heart rate draws complaints. The chart informs; it never judges.
- **No raw samples in the document.** Thousands of readings per workout would eat the 5 MB sync limit.
- **No chart library, no new dependency.** A hand-drawn SVG, like `components/LineChart.jsx`.
- **No empty box.** A workout without a line shows no chart and no "no data" placeholder.
- **Nothing leaves the user's own devices and server.** No third party sees the line.

## Constraints

- Dependency-light: React, plain SVG, CSS tokens. Copy changes into every locale pack.
- The whole profile is one JSON document: the server takes at most 5 MB (`api/server.js` `MAX_BODY`,
  nginx `5m`), and the browser keeps it in `localStorage` (about 5 MB).
- Workouts sync as whole records, newest `_ts` wins (`sync-merge.js` `stampWorkout`). Writing the line
  onto a saved workout must stamp it.
- The watch protocol is a log of events, each kept on the watch until the phone applies it
  (`docs/WATCH_SYNC.md`). A new event must be safe to send twice and to arrive late.
- User text: plain, no em dashes.

## What exists today

- **Per set:** `hr { avg, max }` and `restHr { avg, max }` on each logged set (`lib/heart-rate.js`),
  from the Apple Watch and Wear OS (`setDone`, `setHr` events) or from the hub (`hrFromSamples`).
- **Per workout:** `hr { avg, max, src, n }`, but only ever from the hub (`src` `'ah'` or `'hc'`,
  `lib/health-read.js` `mergeHeartRate`). `src: 'watch'` is documented and never written: the watch
  works out the session's average and max (`WorkoutManager.end`, `Totals`) and keeps them for its own
  summary screen.
- **The samples:** both watches keep every reading of the session in memory (`WorkoutManager.samples`;
  Wear `WorkoutService`), draw a 60-point sparkline on the Pulse page (`Metrics.downsample`) and the
  time in each zone on the Zones page. All of it is dropped when the workout ends.
- **The hub read:** with "read heart rate" on, the phone reads the samples of every workout finished
  in the last 24 h that lacks heart rate (`health-sync.js` `readOnce`, `HR_WINDOW_MS`) through
  `AppleHealthPlugin.readHeartRate` / `HealthConnectPlugin.readHeartRate` (`[[ms, bpm]]`), fills the
  sets and the session, and throws the samples away.
- **The detail sheet:** `WorkoutDetail` in `sheets.jsx` shows each set with " ♥ 132/151" after it
  (`hrLabel`). No chart.
- **Zones:** both watches use max = 208 − 0.7 × age and five bands by tenths of max: Z1 under 60 %,
  Z2 60 to 70, Z3 70 to 80, Z4 80 to 90, Z5 90 and over (`WatchCore/Metrics.swift`,
  `wear/WatchLogic.kt`). The Apple Watch takes the age from Apple Health's date of birth; Wear OS from
  the phone's profile (`S.birthYear`). The phone's own `hrZone` (`lib/live-tiles.js`) uses the same
  bands but gives no zone under 50 %: a small mismatch with the watches.

## What the research found (short)

Full notes and links in the research file.

- **Apple Fitness:** average on the workout card; "Show More" gives a chart and the time in each of
  five zones with each zone's bpm range; a recovery chart for the 3 minutes after. No sets or rests
  for strength (only manual segments). Whether zones show for strength workouts at all is unverified.
- **Apple's zones** use the heart-rate reserve method (resting and max heart rate, updated monthly);
  Apple's own support page says "percentage of maximum". Ours are plain % of max. Different, on
  purpose: we match our watches.
- **Sampling:** the Apple Watch records about every 5 s in a workout; Wear OS samples every second.
  A 60-minute session is about 720 to 3,600 readings.
- **Hub reads:** HealthKit links the watch's samples to its workout and condenses old workouts into
  series after a few months; `HKStatisticsCollectionQuery` with min/avg/max per 30 s copes with both.
  Health Connect has `aggregateGroupByDuration` with the same three, but reads only 30 days back
  without the history permission. A denied read on iPhone looks like no data.
- **Rivals:** Hevy shows a plain chart and average; Strong nothing after the workout; Garmin a chart
  and zones with the sets listed apart (and years of requests to join them); Strava a chart, zones
  paid; WHOOP the chart lined up with each lift. Lifters dislike cardio scores on lifting days.

## Approaches considered

Seven ideas, then three real approaches.

| # | Idea | Verdict |
|---|---|---|
| 1 | **Minimal:** no new data; draw a bar per set from the `hr`/`restHr` already on each set, and only the session's average and range | Too thin: no line, no zones, and most of the session (the rests) is two numbers. Kept as the fallback when a workout has set heart rate but no line. |
| 2 | Watch sends a downsampled line at the end; saved on the workout | **Picked (A).** |
| 3 | Store nothing; read the line from Apple Health / Health Connect each time the detail opens | Phone only (no web, no second device); Health Connect forgets after 30 days; Wear OS does not write to Health Connect at all. Kept for old workouts (phase 2), with the result saved. |
| 4 | The watch also sends the time in each zone, worked out from every reading | 5 more numbers, but a second truth to keep in step with the line. Rejected for now; open question 4. |
| 5 | **Bold:** full-resolution samples in a per-user file on the server beside the profile (like `uploads/`), fetched on demand | Every chart forever exact, but a new endpoint, offline gaps, and nothing works without a server. Rejected. |
| 6 | A line per set (one small line inside each set row) | Busy, and it loses the rests, the part lifters want to see. Rejected. |
| 7 | Bold: a recovery number per rest and a "ready" hint during the rest | A real differentiator, a separate feature. Non-goal for now. |

**A. Line on the workout, from the watch, with the hub as fallback (picked).** At the end the watch
sends about 120 averaged points; the phone saves them on the workout. The hub read fills the line for
other watches within a day. Costs about 0.5 KB per workout. Works on every device and the web.
Needs a watch app update on both watches.

**B. Read on open, store nothing.** No sync cost and covers old workouts, but only on the phone that
has the hub, not for Wear OS (it never writes to Health Connect), and Health Connect's 30-day limit.

**C. Only the minimal set bars (idea 1).** Nothing new to send or store; ships fastest; but it is not
the chart the issue asks for.

Recommendation: **A now, B's read (with the result saved) as phase 2 for old workouts.**

## The design

### Data: `hrLine` on the workout

A new optional field on a finished workout, beside the existing `hr`:

```
hrLine  { t0, step, bpm, zmax? }
  t0    ms, the start of the first bucket (the workout's start)
  step  seconds per bucket, a whole number, 30 or more
  bpm   whole beats per minute, one per bucket, in order; 0 = no reading in that bucket
  zmax  the max heart rate the watch used for its zones (rounded), when it had one
```

- **Buckets:** 30 s each (the watch's readings averaged). Over 90 minutes the step grows so there are
  never more than 180 buckets (a 2-hour session: 40 s). Any session of an hour or less is 120 or fewer.
- **Why a fixed step and not `[ms, bpm]` pairs:** five times smaller (table below), and the time of
  bucket `i` is simply `t0 + i × step`.
- **Why `zmax`:** the Apple Watch takes the age from Apple Health, and many iPhone users never typed a
  year of birth into openGym. With `zmax` the chart colours the zones exactly as the watch did that
  day. Without it, the phone uses `S.birthYear`; with neither, no zones (see "Empty states").
- **The session's numbers:** the same event fills `hr { avg, max, min, src: 'watch', n }` from every
  reading, not from the buckets (buckets flatten the peak). `min` is new and optional; `sanitizeHr`
  readers ignore it. The watch's `hr` outranks the hub's, as `mergeHeartRate` already does for `src`.
- **The hub fallback** builds the same `hrLine` (no `zmax`) from the samples it already reads, only
  when the workout has none. A watch line is never replaced by a hub line.
- **Editing the workout later** (sets moved, times changed) leaves the line alone. Deleting the
  workout deletes it. A workout typed in afterwards never gets one.

Size, measured (`JSON.stringify`, details in the research file):

| Buckets | Per workout | A year at 4 a week | As `[ms, bpm]` pairs |
|---|---|---|---|
| 60 | 0.3 KB | 57 KB | 1.2 KB |
| 120 | 0.5 KB | 104 KB | 2.4 KB |
| 180 | 0.75 KB | 152 KB | 3.6 KB |

A typical workout record today is 1 to 4 KB, so the line adds 15 to 40 % to each workout and about
2 % of the 5 MB limit per year of training. Acceptable. If a profile ever nears the limit, old lines
are the first thing to drop (`lean:` note for the builder, not built now).

### The watch link: one new event

```
hrLine  { wid, t0, step, bpm, zmax?, avg, max, min, n }
```

- Sent once, after the watch's workout session ends with save (never after Discard), for the
  workout `wid`, through the outbox like every other event. Not part of `finish`, so a finish is
  never held back waiting for the last readings, and a workout finished on the phone still gets it
  when the watch's session ends.
- The phone applies it to the saved workout with that id: writes `hrLine` and the session `hr`,
  stamps the workout. If the workout already has a watch line, it does nothing (safe twice).
  If the workout is not saved yet, it waits in the queue like a `setDone` before its `start`.
- Apple Watch: buckets from `WorkoutManager.samples` (the same averaging as `Metrics.downsample`, but
  by fixed time, not fixed count); `zmax` from `Metrics.maxHeartRate(age:)` when the Zones age is
  known. Wear OS: the same from its samples and `WatchLogic.maxHeartRate`.
- Both watch apps get the change in the same release, with mirrored tests (`WatchCore` Swift tests,
  `WatchLogic` Kotlin tests). One row in `docs/WATCH_SYNC.md`'s event table.

### Zones on the phone

One JS helper beside `heart-rate.js` with exactly the watches' rule: max = `zmax`, else
208 − 0.7 × age from `S.birthYear`; Z1 everything under 60 %, then 60, 70, 80, 90 %; the same bpm
edges as `Metrics.zoneBands`. Time in a zone = the buckets in it × `step` (gaps count nothing).
The builder should make `live-tiles.js` `hrZone` agree with it (under 50 % is Z1 there too) and tell
#1392 to use the same helper.

Bucket averages slightly under-count the time in Zone 5 against the watch's own Zones page (a 10 s
peak averaged into a 30 s bucket). Accepted **(assumed)**; open question 4.

### Where sets go on the chart

The set windows are the ones `hrFromSamples` already estimates: each set ends at its tick (`at`) and
lasts as long as its reps or seconds take (`tickedSets`, `setLen`), never starting before the set
ahead of it was ticked. The rest after a set runs to the next set's start. The builder should export
that window logic once and use it for both the hub read and the chart. Workouts without ticks (old or
typed in) get the line without set marks.

### The view

A "Heart rate" card in `WorkoutDetail`, between the workout's summary and its exercises. Sketch at
phone width:

```
 Heart rate
 132 avg   94 to 162 BPM                         From your watch
 ┌────────────────────────────────────────────────────────────┐
 │                         ╱╲            ╱╲                160 │
 │          ╱╲     ╱╲     ╱  ╲   ╱╲     ╱  ╲   ╱╲              │
 │   ╱╲    ╱  ╲   ╱  ╲___╱    ╲_╱  ╲___╱    ╲_╱  ╲___      120 │
 │__╱  ╲__╱    ╲_╱                                  ╲__        │
 │                                                          80 │
 │ ▮▮  ▮▮  ▮▮  ▮▮   ▮▮  ▮▮  ▮▮   ▮▮  ▮▮  ▮▮                    │
 │ └ Squat ───┘ └ Bench ─────┘ └ Row ──────┘ └ Curl ┘          │
 └────────────────────────────────────────────────────────────┘
  0:00                       0:30                        1:02

 Zone 5   ▌                                   1 min   152+ BPM
 Zone 4   ███                                 6 min   135-151
 Zone 3   ███████████                        18 min   118-134
 Zone 2   ████████████                       21 min   101-117
 Zone 1   ████████                           16 min   under 101
```

- **Line:** 2 px, each piece coloured by the zone of its bucket, with the watches' colours (Z1 teal,
  Z2 green, Z3 yellow, Z4 orange, Z5 red). A bucket of 0 breaks the line; no line is drawn across a
  gap. Light and dark mode get their own validated steps (run the `dataviz` validator).
- **Axes:** three quiet bpm ticks on the right, time from 0:00 at the start, the end time last.
- **Set marks:** a strip under the line, one small rounded block per set window, the rests as the
  space between; exercises named under their run of blocks when they fit, else on tap only.
- **Tap or drag** on the chart (a hit area the full height, not just the line): a thin vertical line
  and a tip with the time, the bpm, and the set under it ("Bench Press, set 3: 141 avg, 158 max",
  from the set's own `hr`) or "Rest after set 3: 118 avg". Keyboard: left and right arrows step set by
  set.
- **Zones:** five rows under the chart, Z5 on top like the watch's Zones page, each with its bar (its
  share of the longest), the minutes and its bpm range in text. The text, not the colour, says which
  zone it is.
- **Source line:** "From your watch", "From Apple Health" or "From Health Connect" by `hr.src`, so
  the user knows where it came from. Naming the watch model is out of scope.
- **Accessibility:** the SVG is `role="img"` with a label that says the summary out loud ("Heart rate,
  average 132, from 94 to 162 beats per minute, 62 minutes"); the zone rows are real text; the set
  tips are reachable by keyboard; nothing is told by colour alone.
- **Size:** about 160 px tall for the chart; the zone rows below.

### Empty states

| The workout has | The card shows |
|---|---|
| `hrLine` and a zone max (`zmax` or `S.birthYear`) | everything above |
| `hrLine`, no zone max | the line in one colour (the heart red), the sets, no zone rows, and one small line: "Add your year of birth in Profile to see heart-rate zones." |
| No `hrLine`, but session `hr` or per-set `hr` | only the numbers line ("132 avg, 94 to 162 BPM", or the average of the sets) and no chart; the sets keep their " ♥ 132/151" as today |
| No heart rate at all | no card |

### Platforms

- **iPhone, Android, web:** the same React card; the data syncs, so a workout from the Apple Watch
  shows its chart on the web too.
- **Apple Watch and Wear OS:** send the `hrLine` event; nothing new on their screens.
- **Garmin watch app:** unchanged; Garmin workouts get a line through the hub read when Garmin Connect
  writes heart rate to Apple Health or Health Connect.

### Privacy

The line is heart-rate data of the same kind already stored per set. It stays in the user's own
document on their own server and devices. It is not sent to the AI Coach, the MCP tools or any
integration in this feature. The Wear OS data-safety note (docs/WEAR_OS.md: heart rate collected,
not shared) does not change in kind.

## Phase 2: older workouts (not in the first build)

When a workout's detail opens on a phone with "read heart rate" on, the workout has no `hrLine`, and
it ended more than a day ago, the phone reads its line from the hub once and saves it:

- iPhone: `HKStatisticsCollectionQuery`, average per 30 s from the workout's start to its end
  (handles condensed old workouts). Health Connect: `aggregateGroupByDuration`, 30 s, `BPM_AVG`;
  only 30 days back without the history permission, which openGym already asks for with weigh-ins.
- Tried once per workout per phone (remember it like `hrTried`), so an empty answer (a denied read
  looks the same) is not asked again every time.
- Optional bulk backfill of the whole history: only if users ask; it would write hundreds of
  workouts in one sync.

## Open questions (most important first)

1. **Why does this matter to you most:** seeing which exercises were hardest, how well you recovered
   between sets, or comparing sessions? *Assumed: recovery between sets, so the set and rest marks are
   a must-have, not a nice-to-have.*
2. **Wear OS in the same release, or iPhone first?** *Assumed: both together; the change is one event
   on each watch and the phone side is shared.*
3. **Old workouts:** worth phase 2 at all, and how far back? *Assumed: yes, read on open, not a bulk
   backfill.*
4. **Time in zones:** is a small difference from the watch's own Zones page (about a minute of Zone 5
   in a hard hour) acceptable, or should the watch send its exact zone times too (5 numbers)?
   *Assumed: acceptable, derived from the line.*
5. **Points:** 30 s buckets (about 120 for an hour) enough, or do you want finer (15 s, double the
   size)? *Assumed: 30 s.*
6. **Zones method:** keep our watches' % of max, or move all three to Apple's heart-rate reserve
   (needs resting heart rate, which the phone can read with Vitals on)? *Assumed: keep, and say so.*
7. **Compare with last time:** a faint line of the same routine's previous session behind today's?
   *Assumed: not now.*

## Left to the builder

- Check what an older phone does with an event type it does not know: it must apply nothing and still
  acknowledge it, or the watch would resend it every 10 minutes. Gate sending on the phone's version
  if needed (`watchStatus` / snapshot already carry versions).
- Check the server and `api/sync-stamps.js` keep an unknown workout field untouched (heart-rate.js
  says they do for set fields; confirm for the workout).
- Exact bucket edges, rounding, and how a bucket with a single reading is treated.
- Whether `hr.min` is worth adding to the hub path too (yes if cheap).
- Unit tests in `src/lib` beside the new helpers (CONTRIBUTING: session read-back needs one): bucket
  building, zones and their edges, set windows, the merge rules (watch over hub, never twice).
  Swift and Kotlin tests for the watch side, mirrored.
- The strings in every locale pack; a demo workout with a line in `demoSeed.js` for screenshots.
- The CHANGELOG line is written at release time, not here.
