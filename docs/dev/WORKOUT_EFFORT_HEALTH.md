# Workout effort to Apple Health (#1392)

Status: spec, not built. Written 2026-11-19 on `release-1.4.6` (da62470d3). Sibling: #1391 (the
Apple Watch heart-rate chart in History), which owns the heart-rate zones.

## Why

Apple Fitness works out a **training load**: how hard and how long you trained in the last 7 days,
compared with the 28 days before. It reads that from an **effort rating (1 to 10)** on each workout.
Apple estimates the rating itself for runs, rides, swims and the like, but **never for strength
training**: there, the lifter has to rate each workout by hand in the Fitness app.

A workout from openGym reaches Apple Health with no rating. So the lifter's main training counts for
little or nothing in training load, and Fitness says their load is "well below" in a week they
trained hard. openGym already knows how hard the session was (the effort on each set, the sets
taken to failure, or an estimate from the loads). It can work out a rating on Apple's own scale,
show it on the summary, and write it with the workout. Training load then tells the truth, with no
extra tap for the lifter who agrees with the suggestion.

## Goals

1. Every openGym workout written to Apple Health (iOS 18 and later) carries an effort rating, so
   Apple's training load counts it.
2. The rating is suggested from what openGym recorded, by a pure, tested helper. No AI, no network.
3. The lifter sees it on the workout summary and can change it with one tap.
4. A lifter who does nothing still gets the suggestion written (see the open question Q1).

## Non-goals (for this build)

- **Showing Apple's own estimate.** Apple does not estimate strength training, and very likely not
  third-party workouts at all (see Findings). It would almost never appear. Add it if a device test
  shows Apple estimating openGym's cardio-only workouts.
- **Heart rate in the suggestion.** Heart-rate load fits lifting poorly (Findings, C), and most
  phone-logged workouts have no heart-rate line. Revisit once #1391 stores the session's line.
- **Android.** Health Connect has a session effort field only in an alpha library (Findings, D).
  The stored rating makes it a small follow-up once that library is stable.
- **The Apple Watch rating step.** v1 is phone only. The phone's summary opens on every finish, the
  watch's Finish included, and the zero-tap default covers the lifter who never looks. The watch
  step is phase 2 (see Phases).
- **Changing the rating later inside openGym** (History, the workout editor). Apple Fitness already
  lets the lifter change it, and openGym must not undo that (Design, "Never overwrite a rating made
  elsewhere").
- **openGym's own training-load chart** (session rating x minutes, Foster's method). It is the bold
  idea below, a feature of its own.
- A new setting. The rating rides on the existing Apple Health switch.

## Anti-goals

- **A question nobody wants.** No modal, no blocking step, no "Rate your workout" sheet. The rating
  is a row on the summary that is already filled in.
- **A permission sheet over the celebration.** Never pop the Health permission sheet on the
  summary by itself.
- **Pretending.** A suggestion the lifter never touched is marked as openGym's in Apple Health
  (metadata), not passed off as their own rating.
- **Overwriting the lifter.** A rating the lifter set in Apple Fitness wins over anything openGym
  writes later.

## Constraints

- Training logic is a pure helper in `frontend/src/lib` with a unit test beside it (CONTRIBUTING.md).
- No new dependency. No telemetry. Nothing leaves the phone except into Apple Health.
- The iPhone app's deployment target is **iOS 15.5** (`App.xcodeproj`), the watch's package
  `watchOS(.v10)`. Every effort API call sits behind `#available(iOS 18, watchOS 11, *)`; below
  that the row is not shown and nothing changes.
- Every new user-facing string goes into every locale pack (`frontend/src/locales`, the
  `check-locales` / `check-source-strings` checks). Plain words, no em dashes.
- HealthKit raises uncatchable exceptions for values it will not take
  (`health-connect.js`, TestFlight 59). The score is checked (whole number, 1 to 10) on both the
  JS and the Swift side before any sample is made, like `HealthWriteCore` does for calories.

## Findings

Researched 2026-11-19. "Verified" means two or more sources agree, Apple's own where possible.

### A. Apple's scale and training load

| Claim | Verdict | Sources |
|---|---|---|
| The rating is 1 to 10 | Verified | [Apple Newsroom, watchOS 11](https://www.apple.com/newsroom/2024/06/watchos-11-brings-powerful-health-and-fitness-insights/); [Tom's Guide](https://www.tomsguide.com/wellness/smartwatches/im-a-marathoner-and-have-been-testing-apple-watchs-training-load-feature-heres-the-pros-and-cons) |
| Bands Easy 1-3, Moderate 4-6, Hard 7-8, All Out 9-10 | **Unverified, conflicting.** No Apple page states them. Two blogs agree on the numbers; MacStories calls the second band "Medium" | [Zelpio](https://www.zelpio.com/blog/apple-watch-training-load-effort-rating-review/); [groovyPost](https://www.groovypost.com/howto/track-training-load-apple-watch/); [MacStories](https://www.macstories.net/stories/watchos-11-the-macstories-review/3/) |
| Apple's guidance text for each level | **Unverified.** Not on any Apple page we could reach; read it off a device | one blog mentions "simple descriptions" without quoting them |
| Load compares the last 7 days with the previous 28; labels well below, below, steady, above, well above | Verified | [Apple Watch guide](https://support.apple.com/guide/watch/apde4c07a6cf/watchos); Newsroom; [DC Rainmaker](https://dcrainmaker.com/2024/07/apples-training-load-vitals-watchos11.html) |
| Load is built from effort and duration | Verified in substance. Apple: "a weighted average taking into account both the effort ratings and duration". DC Rainmaker: effort x duration | Newsroom; DC Rainmaker |
| A workout with no rating adds nothing | Unverified, likely (follows from the formula; MacStories: "If you don't enter it, then your training load isn't accurate") | MacStories |
| Apple estimates effort for walks, runs, rides, rowing, cross-country skiing, elliptical, stair stepper, hiking, HIIT, dance, kickboxing, swims | Verified | [Apple watchOS 11 page (archived)](https://web.archive.org/web/20241015000000/https://www.apple.com/watchos/watchos-11/); DC Rainmaker |
| **Strength training is not estimated**; the user rates it | Verified. Apple: "for noncardio workouts like strength training and yoga, you can enter your own rating"; Newsroom: "where an automatic estimate is not provided, like strength training" | Apple watchOS 11 page; Newsroom |
| Users can rate third-party apps' workouts, and they count | Verified: "You can also submit ratings for workouts tracked in third-party fitness apps so they'll be added to your training load" | Apple watchOS 11 page |
| Third-party workouts get no Apple estimate | Likely, not confirmed (one forum post claims estimates appear after weeks) | Apple dev forum thread 764884 (snippet only) |
| The user can change a rating later in Fitness or on the watch | Verified ("tap Effort, drag the slider ... then tap Update") | [Apple Watch guide, start a workout](https://support.apple.com/guide/watch/start-a-workout-apdd16e8761a/watchos); DC Rainmaker |
| Apple's HIG says how to ask for effort | Nothing found | HIG Workouts page; WWDC24 session 10084 only mentions custom step names for perceived effort |

### B. HealthKit

| Claim | Verdict | Sources |
|---|---|---|
| `HKQuantityTypeIdentifier.workoutEffortScore` and `.estimatedWorkoutEffortScore` exist on iOS 18, watchOS 11, macOS 15 | Verified | [Apple docs](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/workouteffortscore); iOS 18.0 SDK header `HKTypeIdentifiers.h` |
| Unit `HKUnit.appleEffortScore()`, discrete, arithmetic | Verified | SDK headers `HKTypeIdentifiers.h`, `HKUnit.h` |
| The accepted range is 1 to 10 | **Unverified.** Not in the docs; developers filed FB15316109 asking | forum reports |
| `HKHealthStore.relateWorkoutEffortSample(_:with:activity:completion:)` and `unrelateWorkoutEffortSample(_:from:activity:completion:)` | Verified | SDK header `HKHealthStore.h` |
| An effort sample must be related to a workout (saving it alone fails) | Verified by developer reports ("must be related to a workout") | dev forum 763539 (snippet); [dev forum 772319](https://developer.apple.com/forums/thread/772319) (Apple DTS reads it back after relating) |
| `HKWorkoutEffortRelationshipQuery` reads ratings back; option `mostRelevant`; also `HKQuery.predicateForWorkoutEffortSamplesRelated(workout:activity:)` | Verified | SDK header `HKWorkoutEffortRelationshipQuery.h` |
| Relating works on a workout saved earlier; changing means unrelate (or delete) and relate again | Likely, not stated (the method takes a saved `HKWorkout`) | headers |
| `estimatedWorkoutEffortScore` is Apple-only | **Conflicting.** Apple's HealthKit updates page says both types "read and write exertion data" | [Apple HealthKit updates](https://developer.apple.com/documentation/updates/healthkit) |
| An app may relate effort to a workout **another app** saved (our Apple Watch app is another source) | **Unverified** | nothing found |
| A rating an app writes shows in Fitness | **Unverified, one failure reported** (relate succeeded, Fitness showed nothing) | dev forum 763539 (snippet) |

### C. How a session rating relates to set ratings (the suggestion's science)

- **Session RPE** (Foster et al. 2001, [doi:10.1519/00124278-200102000-00019](https://doi.org/10.1519/00124278-200102000-00019)):
  one 0 to 10 rating for the whole session, asked about 30 minutes after; load = rating x minutes.
  Foster's CR-10 words: 0 Rest, 1 Very, very easy, 2 Easy, 3 Moderate, 4 Somewhat hard, 5 Hard,
  7 Very hard, 10 Maximal (Haddad et al. 2017 review, [doi:10.3389/fnins.2017.00612](https://doi.org/10.3389/fnins.2017.00612)).
  The 30-minute wait is contested: Enes et al. 2023 found 10 to 15 minutes enough.
- **It works for lifting.** Day et al. 2004 (ICC 0.88, [doi:10.1519/R-13113.1](https://doi.org/10.1519/R-13113.1));
  Sweet et al. 2004 ([doi:10.1519/14153.1](https://doi.org/10.1519/14153.1)); Lea et al. 2022
  meta-analysis, r = 0.88 in resistance exercise ([doi:10.1186/s40798-021-00386-8](https://doi.org/10.1186/s40798-021-00386-8)).
- **The session rating is lower than the average set rating**, three studies agree: Sweet 2004
  ("may meaningfully underestimate the average intensity rated immediately after each set"); Singh
  et al. 2007 for strength and hypertrophy sessions ([doi:10.1123/ijspp.2.1.34](https://doi.org/10.1123/ijspp.2.1.34));
  Enes et al. 2023: sets 7.5 vs session 5.9 for traditional sets, 8.8 vs 8.1 for drop sets
  ([doi:10.1177/00315125231176729](https://doi.org/10.1177/00315125231176729)).
- **Closeness to failure and load drive it; rest length does not.** Janicijevic et al. 2024:
  rest of 1, 3 or 5 minutes did not change set RPE, closeness to failure did
  ([doi:10.7717/peerj.16754](https://doi.org/10.7717/peerj.16754)). Kraft et al. 2014: heavier
  sets at equal volume rate higher ([doi:10.1519/JSC.0000000000000342](https://doi.org/10.1519/JSC.0000000000000342)).
  Cuevas-Aburto et al. 2022: cluster sets lowered set RPE but not session RPE.
- **RIR to RPE**: RPE 10 = 0 reps in reserve, 9 = 1, and so on (Zourdos et al. 2016,
  [doi:10.1519/JSC.0000000000001049](https://doi.org/10.1519/JSC.0000000000001049)). This is
  `effort.js` today (`rirOf`, RPE 8 = RIR 2).
- **Heart-rate load fits lifting poorly**: in resistance sessions session-RPE load matched
  heart-rate loads only weakly (Edwards r = 0.52, Banister 0.25), Alexiou & Coutts 2008
  ([doi:10.1123/ijspp.3.3.320](https://doi.org/10.1123/ijspp.3.3.320)).
- Unverified: that the hardest or last sets drive the session rating more than the rest. No study
  found; the suggestion uses the plain mean.

### D. Android

- Health Connect has a session effort field: `ExerciseSessionRecord.rateOfPerceivedExertion`
  (Float, 0 to 10), and a per-set one, `ExerciseSegment.rateOfPerceivedExertion`, both behind
  `HealthConnectFeatures.FEATURE_EXERCISE_SESSION_IMPROVEMENTS`, in
  `androidx.health.connect:connect-client` **1.2.0-alpha05/06** (August 2026; the release notes
  disagree on which). Platform API 36.1.
  [ExerciseSessionRecord](https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSessionRecord),
  [HealthConnectFeatures](https://developer.android.com/reference/kotlin/androidx/health/connect/client/HealthConnectFeatures),
  [release notes](https://developer.android.com/jetpack/androidx/releases/health-connect).
- openGym uses **1.1.0** (`frontend/android/variables.gradle`). Moving to an alpha is not worth it
  for this.
- Wear OS Health Services has no effort data type
  ([DataType](https://developer.android.com/reference/kotlin/androidx/health/services/client/data/DataType)).
- Whether Samsung Health, Fitbit or Google show that field: unverified.

## What openGym has today

- **Per-set effort**, optional and off by default: a set carries `rir` or `rpe`
  (`lib/history.js` `EFFORT`, profile setting `settings.effort`). A set marked as taken to failure
  reads as RIR 0 (`effort.js rirOf`). Cardio sets rate on RPE with talk-test words.
- **Estimated effort** for unrated sets, from the load against the lifter's recent best
  (`recovery.js resolveSetRir`, `estimateSetRir`; see `docs/dev/FATIGUE_SETS_MODEL.md`).
- **The watch** rates effort after a set (rest screen chips, `RestHold.swift EffortChips`), fixes it
  on the set page, and shows a per-exercise Effort page (`SideScreens.swift EffortPage`). Same
  fields, over `lib/watch-sync.js`.
- **Heart rate**: per set `hr`/`restHr` `{ avg, max }` and the session's `hr`
  (`lib/heart-rate.js`). Zones exist twice: `live-tiles.js hrZone` (phone, null under 50 %) and
  `WatchCore Metrics.zone` (watch, everything under 60 % is zone 1). For #1391: those two disagree
  below 50 %.
- **What reaches Apple Health**: one `HKWorkout` per finished workout, sync id
  `opengym-w-<id>`, type, title, estimated calories (`-kcal` sample). Built from the state by
  `lib/health-connect.js sessionRecord`, written by `AppleHealthPlugin.saveSession`
  (`HKWorkoutBuilder`). A record whose content changed is written again and replaces the old one
  (`planSync`, `recordKey`). If the Apple Watch app (`WorkoutManager`, `HKLiveWorkoutBuilder`) or
  the iPhone's own session (`PhoneWorkoutPlugin`, iOS 26) saved the workout, the phone leaves that
  copy alone. **No effort, set or session, reaches Apple Health.**

## Ideas considered

1. **Minimal: ask, no suggestion.** A 1 to 10 row on the summary, empty; written only if tapped.
   Smallest code. Fails the goal: most lifters will not tap, and their load stays wrong.
2. **Suggest, show, write unless changed (picked).** The summary shows the suggested level already
   selected; one tap changes it; closing the summary keeps it. Zero taps for agreement.
3. **Silent.** Write the suggestion, show nothing. Zero UI, but the lifter never sees or controls
   what is said about them, and a wrong guess goes unnoticed. Breaks the "pretending" anti-goal.
4. **Watch first.** Rate on the watch's medal summary with the Crown, like Apple's own Workout app.
   Best feel for watch users, but needs the suggestion worked out on the watch too (a Swift twin of
   the helper), and helps nobody who logs on the phone. Kept as phase 2.
5. **Ask later.** Foster asks 30 minutes after. A card on the next app open, "How hard was this
   morning's workout?" More accurate in theory, but a second visit nobody makes, and the workout
   sits in Health unrated meanwhile.
6. **Bold: openGym's own training load.** Use the same rating for an openGym chart (rating x
   minutes, 7 vs 28 days), on every platform, Android and web included, with Apple Health as one
   consumer. Real value, but a feature of its own with its own design; this spec keeps the rating
   in a form that chart can use later.
7. **Android parity now.** Write `rateOfPerceivedExertion` to Health Connect. Blocked on an alpha
   library; later.

### The three real approaches

| | A. Ask only (idea 1) | **B. Suggest and keep (idea 2)** | C. Silent (idea 3) |
|---|---|---|---|
| Taps for a lifter who agrees | 1 | **0** | 0 |
| Training load right when ignored | No | **Yes** | Yes |
| Lifter sees and controls it | Yes | **Yes** | No |
| New logic | none | **one pure helper** | one pure helper |
| Risk | dead feature | a wrong guess written, visible and fixable | a wrong guess nobody sees |

**Pick B.** It is the only one that fixes training load without a new tap and still lets the
lifter see and change what is written. A is the fallback if Duarte or the lifter does not want
anything written untouched (Q1).

## Design

### 1. The suggestion (pure helper)

A new `frontend/src/lib/workout-effort.js` with `workout-effort.test.js`. One function, roughly
`suggestEffort(workout, S) -> { score: 1..10, rated, estimated } | null`.

1. Take the workout's done work sets (no warm-ups, as `effort.js eachDoneSet`).
2. Each set's RIR: the logged one (`rirOf`, which already counts a failure set as 0); else the
   estimate (`resolveSetRir`, the same resolver the Stats Effort card uses). Sets with neither are
   skipped.
3. No set with an RIR: **null**. No suggestion; the row shows empty (see 2).
4. Mean RIR of those sets, as set RPE: `10 - meanRIR`.
5. Strength sets: subtract the **session offset, 1.5** (a session rates about 1 to 1.6 below its
   sets: Sweet 2004, Singh 2007, Enes 2023). Cardio sets rated in RPE keep their RPE (the offset is
   a lifting finding). A mixed workout weights each set the same, each with its own rule.
6. Round to a whole number, clamp to 1..10.

Worked through: mean RIR 0 (all to failure) gives 8.5, so 9 All Out. RIR 1 gives 8 Hard. RIR 2
gives 7 Hard. RIR 3 gives 6 Moderate (round half up: 5.5 to 6). RIR 4 or more gives 5 or lower.

Deliberately left out, each with its reason:
- **Length and volume.** Apple already multiplies the rating by the duration; folding length into
  the rating would count it twice. "How hard" is not "how much".
- **Heart rate.** Weak for lifting (Alexiou & Coutts 2008) and missing for most phone workouts.

Return `rated` and `estimated` counts so the summary can say where the number came from. The
offset is a named constant with a one-line why, so it can be tuned from real ratings later.

Tests to leave behind (the builder may add more): the worked examples above; warm-ups ignored; a
failure set with no rating counts as RIR 0; an estimate used only when nothing is rated; null when
nothing is rated or estimable; cardio RPE without offset; clamp at both ends.

### 2. The rating moment (phone)

On the workout summary (`sheets.jsx FinishSummary`), under the tiles, **only when** Apple Health
is on (`health-sync.js` status), the platform is iOS, and the OS is 18 or later (the native side
reports it, e.g. in `status`).

- Heading: **How hard was it?**
- Ten numbered pills, 1 to 10, in one row, coloured by band (Easy green, Moderate yellow, Hard
  orange, All out red; the existing colour tokens). The suggestion is selected.
- Under them, one line: the band word and a short hint for the selected level, then where it came
  from. Proposed hints, written for lifting (Apple's own text is unverified, so these are ours):

  | Score | Band | Hint |
  |---|---|---|
  | 1 to 3 | Easy | Plenty left in the tank |
  | 4 to 6 | Moderate | Working, but a few reps to spare |
  | 7 to 8 | Hard | Close to failure on most sets |
  | 9 to 10 | All out | Nothing left |

  Source line: **Suggested from your sets. Tap to change.** With no suggestion: **Rate it for
  Apple Health's training load.**
- A tap on a pill selects it (the lifter's own now). A tap on the selected pill clears it (nothing
  is written). Pills meet the 44 pt touch target in height; on a 320 pt-wide phone ten fit with
  small gaps. VoiceOver: one adjustable control, "Effort, 7, Hard".
- Band words: use **Easy, Moderate, Hard, All out** unless a device check shows Apple's own words
  differ (MacStories says "Medium"). Match Apple once read off a device.
- When the effort permission is not granted yet (see 4), the row shows a small **Allow in Apple
  Health** link instead of pills. No permission sheet opens by itself.

### 3. What is stored

- On the finished workout: `effort: { s: 7, auto: true }`. `s` is the score, `auto` is true while
  it is still openGym's suggestion. Worked out once, when the workout is finished
  (`doFinishWorkout`, the past-workout path too), so later history changes never move it.
- A tap: `{ s: n }` (no `auto`). A clear drops the key. No key means "nothing to write", the same
  as every workout logged before this feature.
  The builder may pick any equally small shape; the rule is one field on the workout, the user's
  choice told apart from the suggestion.
- Every change stamps the workout like any other edit (`stampWorkout`, `lib/sync-merge.js`), so it
  syncs and both phones write the same record.

### 4. What is written to Apple Health, and when

- `health-connect.js sessionRecord` adds `effort` (whole number 1 to 10) and `effortAuto` (bool) to
  the session record when the workout has one. The record's fingerprint changes, so the existing
  sync (`planSync`) writes the workout again: no new trigger needed. Health Connect ignores the
  fields until Android support lands.
- `AppleHealthPlugin` (iOS 18+ only):
  - **Permission**: add `workoutEffortScore` to share and read types. HealthKit asks only for
    types not yet decided, so a lifter who already turned Health on is asked once, for effort
    alone, the next time openGym requests permission: from the summary's "Allow in Apple Health"
    link or from Settings, never by itself.
  - **openGym saved the workout** (`saveSession`): after `finishWorkout()` returns the `HKWorkout`,
    make one `workoutEffortScore` sample over the workout's start to end, unit
    `appleEffortScore()`, metadata `HKMetadataKeySyncIdentifier = opengym-w-<id>-effort` (plus
    `OpenGymSuggested: true` when `effortAuto`), and `relateWorkoutEffortSample` it to that workout.
  - **The watch or the iPhone session saved it** (the two early returns in `saveSession`): find that
    workout by its sync id and relate the effort to it. Whether the iPhone app may relate a sample
    to the watch app's workout is unverified (Findings B): test first, see Phases.
  - **A new score**: unrelate and delete openGym's earlier `-effort` sample, then relate the new one.
  - **Never overwrite a rating made elsewhere**: before writing, read the workout's effort
    (`HKWorkoutEffortRelationshipQuery` or the related-samples predicate). If a sample from another
    source exists (the lifter rated it in Fitness), write nothing and leave theirs.
  - **Removing** a workout (`remove`, and "remove what openGym wrote" on switching Health off) also
    deletes its `-effort` sample, as it does the `-kcal` one.
  - Check the score before making the sample (`HealthWriteCore`): a whole number 1 to 10, else skip
    the effort and still write the workout.
- Below iOS 18: the fields are ignored, the workout is written as today.

### 5. Apple's estimate, and disagreement

openGym never reads or writes `estimatedWorkoutEffortScore` in v1. Apple does not estimate strength
training, and most likely not workouts from other apps. If Apple ever has an estimate for the same
workout, Fitness itself puts the lifter's rating (what openGym writes) ahead of its estimate: that
is the model Apple describes ("adjust estimated ratings"). So there is nothing to reconcile.

### 6. Platforms

| Platform | v1 |
|---|---|
| iPhone, iOS 18+, Apple Health on | Summary row, written to Health |
| iPhone below iOS 18, or Health off | Nothing changes |
| Apple Watch | No new screen. A watch-finished workout still gets the phone's summary row and the zero-tap write |
| Android | Stored on the workout, not written (library is alpha) |
| Web | Nothing |

### 7. Edge cases

- **No rated or estimable set** (all bodyweight, imported loads, first session): no suggestion,
  nothing written unless the lifter taps.
- **Warm-ups only**: as above.
- **A workout logged into the past** (backfill): suggested at finish like any other.
- **Imported workouts**: never written to Health today (`isImportedWorkout`), so no effort either.
- **A workout longer than a day**: written without calories today; the effort still goes with it.
- **Edited later** (sets changed in History): the stored score stays. The lifter can change it in
  Fitness; openGym will not overwrite that.
- **Discarded workout**: nothing.
- **Two phones**: both write the same record from the synced state; the sync ids keep one copy.
- **The rating changes after Health already has the workout**: the record changes, the next sync
  unrelates and replaces openGym's sample.
- **Permission refused**: nothing written; the workout goes in as today. HealthKit never says it
  was refused, so the row keeps its link; it must not nag (show the link, never a sheet).

## Phases

0. **Device spike (before any UI).** On an iPhone with iOS 18+ and an Apple Watch: save a
   strength workout from the phone, relate a `workoutEffortScore` of 7, and check that Fitness
   shows it and counts it in training load. Then the same against a workout the watch app saved.
   Also read Apple's band words and guidance off the device (the Effort slider), in English and
   one other language. Write the results into this file. If Fitness does not show an app's rating,
   stop: the feature cannot work, and the issue gets that answer.
1. **The helper** (`workout-effort.js` + test), the stored field, the record fields.
2. **The native write** in `AppleHealthPlugin` (permission, relate, replace, remove, the
   "rated elsewhere" check), behind `#available`.
3. **The summary row** and its strings in every locale.
4. Later, each on its own: the watch step on the medal summary (#1314; needs a Swift twin of the
   helper in WatchCore with mirrored test cases, the "code that exists twice" pattern); Android
   once `rateOfPerceivedExertion` is in a stable Health Connect library; heart rate in the
   suggestion once #1391 stores the line; openGym's own training load.

## Open questions

Asked of the lifter (Adrián); none answered yet, so the spec uses the recommended answer as an
assumption. Most important first.

1. **Write the suggestion when the lifter never touches it?** Recommended: yes, marked as
   openGym's in the metadata. Without it, most workouts stay unrated and training load stays wrong.
   If no: approach A, write only on a tap.
2. **Is the phone summary the right place, or must it be the watch?** Recommended: phone first,
   the watch's medal summary in phase 4.
3. **Is closeness to failure alone a good enough suggestion?** Recommended: yes for v1; length is
   already counted by Apple, heart rate later with #1391.
4. **Apple's words or ours?** Recommended: Apple's band names, our own lifting hints (Apple's text
   is unverified).
5. **Android: wait for the stable library, or not at all?** Recommended: wait; the field is stored.
6. **Should openGym show a rating Apple Fitness has, if the lifter changed it there?**
   Recommended: no in v1 (read only to avoid overwriting).
7. For Duarte: is a new workout field (`effort`) acceptable in the synced state, and is the
   phase 0 spike on his devices or the contributor's?

## Left to the builder

- The exact field shape (keep it one field, the lifter's choice told apart from the suggestion).
- Where the OS-version check is reported to JS (`status` is the obvious place).
- The pill row's exact look within the existing summary styles; dark mode; Dynamic Type.
- Whether the "rated elsewhere" check uses `HKWorkoutEffortRelationshipQuery` or the
  related-samples predicate, whichever the spike shows working.
- The test list in Design 1 is the floor, not the ceiling.
