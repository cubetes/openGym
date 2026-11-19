# Research notes: the workout heart-rate chart (#1391)

Gathered 2026-11-19 for [WORKOUT_HEART_RATE_CHART.md](WORKOUT_HEART_RATE_CHART.md). Each claim lists
its sources. **UNVERIFIED** means fewer than two independent sources were found; the spec does not
depend on any of those.

## 1. Apple Fitness and the Workout app

| Claim | Status | Sources |
|---|---|---|
| Fitness app: Sessions → a workout → Show More next to Heart Rate shows "a graph [that] details the estimated time spent in each zone" | verified | [Apple Watch guide](https://support.apple.com/guide/watch/apd897dccddf/watchos), [MacRumors](https://www.macrumors.com/how-to/use-heart-rate-zone-tracking-apple-watch/), [9to5Mac](https://9to5mac.com/2024/05/23/heart-rate-zones-apple-watch-iphone) |
| Each zone's bpm range is shown beside its time | verified | [Engadget](https://www.engadget.com/apple-watch-os-9-beta-preview-cardio-zone-lunar-calendar-how-to-193136898.html), [TechWiser](https://techwiser.com/what-icons-and-symbols-mean-on-apple-fitness-app-complete-guide/) |
| The workout card shows the average heart rate | verified | [MacStories](https://www.macstories.net/stories/the-new-fitness-app-in-ios-14/), [XDA](https://www.xda-developers.com/how-to-see-heart-rate-zones-on-apple-watch/) |
| Heart-rate recovery: swipe left on the Heart Rate card; the watch keeps measuring 3 min after the end | verified | [iPhoneLife](https://iphonelife.com/content/heart-rate-recovery-what-it-how-to-access-it-apple-watch), [9to5Mac](https://9to5mac.com/2024/01/26/cardio-recovery-apple-watch-iphone/), Apple support 120277 (archived copy) |
| Show More is interactive (tap and hold for values); the small card graph is not | verified | [Apple Newsroom 2022](https://www.apple.com/newsroom/2022/06/watchos-9-delivers-new-ways-to-stay-connected-active-and-healthy/), [MacStories watchOS 9](https://www.macstories.net/stories/watchos-9-the-macstories-review/2/) |
| Exact chart look (red line on the card, zone-coloured bars in Show More) | **UNVERIFIED** (one source, TechWiser) | |
| Zones are shown for strength workouts | **UNVERIFIED**: Apple says "cardio-focused workout"; MacStories "most workout types"; nobody names strength | |
| Strength workouts get no sets, reps or rests in Apple's apps; only manual segments ("Tap Segment") | verified for segments ([Apple HT204523](https://support.apple.com/en-us/HT204523), [MacRumors](https://macrumors.com/how-to/divide-workouts-into-segments-apple-watch)); "never marks sets" rests on missing evidence | |

## 2. Apple's zone method

- Five zones, automatic, from Health data, editable. Apple: "Heart Rate Zones are a percentage of your
  maximum heart rate and are automatically calculated and personalized using your health data."
  "Heart Rate Zones are calculated only if you've entered your date of birth in the Health app."
  Manual: "Workout > Heart Rate Zones. Tap Manual, tap zone 2, 3, or 4, then enter lower and upper
  limits." ([Apple Watch guide](https://support.apple.com/guide/watch/apd897dccddf/watchos))
- The watch's own text: "Automatic heart rate zones are calculated using the heart rate reserve
  method. Max and resting heart rate values are updated on the first of every month." Quoted in
  [Apple Community](https://discussions.apple.com/thread/256179011) and a
  [DC Rainmaker](https://dcrainmaker.com/2022/06/triathlon-features-detailed.html) comment; 9to5Mac and
  MacStories agree. WWDC26 session 207: "calculated by considering one's age and resting heart rate"
  ([video](https://developer.apple.com/videos/play/wwdc2026/207/)).
- **Conflict:** the support page says "percentage of maximum", the watch says heart-rate reserve (the
  span between resting and maximum). Reserve is the better-sourced reading.
- Apple's max-heart-rate formula: **UNVERIFIED** (forums guess 220 − age or 208 − 0.7 × age).
- Since watchOS 9 (2022), Apple Newsroom above.
- openGym's watches today use 208 − 0.7 × age (Tanaka) and plain % of max, with Zone 1 taking
  everything under 60 % (`WatchCore/Metrics.swift`, `wear/WatchLogic.kt`). Not Apple's method. The
  phone's own `hrZone` (`lib/live-tiles.js`) uses the same bands but gives no zone under 50 %.

## 3. How often the watch measures

- Apple Watch, Workout app: "measures your heart rate continuously during the workout and for 3
  minutes after" (Apple support 120277). About every 5 s: Apple's own contrast "every second instead
  of every 5 seconds" plus a 2018 study, "nominally records HR at 5-s intervals"
  ([PMC6226089](https://pmc.ncbi.nlm.nih.gov/articles/PMC6226089)). Verified.
- HealthKit itself documents only "high-frequency heart rate samples" for workout sessions
  ([Running workout sessions](https://developer.apple.com/documentation/healthkit/running-workout-sessions)).
- Wear OS Health Services: "All devices sample heart rate once per second during an exercise";
  screen off, deliveries are batched up to about 150 s
  ([compatibility](https://developer.android.com/health-and-fitness/health-services/compatibility),
  [active data](https://developer.android.com/health-and-fitness/guides/health-services/active-data)).
  Health Services does not write to Health Connect for the app.

So a 60-minute strength session holds about 720 readings on an Apple Watch and up to 3,600 on Wear OS.

## 4. Reading a workout's heart rate from the phone's hub

HealthKit (iPhone):
- Samples saved during a workout session are linked to the workout;
  `HKQuery.predicateForObjects(from: workout)` fetches them, Apple's own example uses heart rate
  ([Accessing condensed workout samples](https://developer.apple.com/documentation/healthkit/accessing-condensed-workout-samples),
  [Adding samples to a workout](https://developer.apple.com/documentation/healthkit/adding-samples-to-a-workout)).
  A start/end time window also works but can pick up other sources (openGym does this today,
  `AppleHealthPlugin.readHeartRate`).
- Workouts "at least a few months old" are condensed: the system rewrites their samples as series
  and deletes the originals (same Apple article; an Apple engineer on
  [forum 677861](https://developer.apple.com/forums/thread/677861)).
- For 60 to 180 points, `HKStatisticsCollectionQuery` with `.discreteAverage/.discreteMin/.discreteMax`
  and a fixed interval (anchor = workout start) is the right tool: statistics queries "correctly handle
  quantity data, whether the samples represent a single quantity or a series"; empty buckets are nil
  ([HKStatisticsOptions](https://developer.apple.com/documentation/healthkit/hkstatisticsoptions),
  [Executing statistics collection queries](https://developer.apple.com/documentation/healthkit/executing-statistics-collection-queries)).
- A denied read looks like no data: "it simply appears as if there is no data"
  ([authorizationStatus(for:)](https://developer.apple.com/documentation/healthkit/hkhealthstore/authorizationstatus(for:)),
  [Protecting user privacy](https://developer.apple.com/documentation/healthkit/protecting-user-privacy)).
- How long Apple Health keeps samples: **UNVERIFIED** (no stated limit; condensed after months).
- Sibling #1392: `workoutEffortScore` / `estimatedWorkoutEffortScore` (iOS 18), attached with
  `relateWorkoutEffortSample(_:with:activity:)`
  ([HealthKit updates](https://developer.apple.com/documentation/updates/healthkit)). The 1 to 10
  range is **UNVERIFIED** in the docs. The same updates page mentions `HKWorkoutZoneGroup` (June 2026,
  time in zone per workout): one source, **UNVERIFIED**, worth a look by #1392.

Health Connect (Android):
- `HeartRateRecord` is a series: start, end, `samples` of `(time, beatsPerMinute)`
  ([reference](https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/HeartRateRecord),
  [write data](https://developer.android.com/health-and-fitness/health-connect/write-data)).
- `aggregateGroupByDuration` with `BPM_AVG/MIN/MAX` and a 30 s slicer gives fixed buckets; empty
  buckets are left out ([aggregate data](https://developer.android.com/health-and-fitness/guides/health-connect/develop/aggregate-data)).
- Heart rate is not linked to an `ExerciseSessionRecord` by id, only by time
  ([sessions](https://developer.android.com/health-and-fitness/guides/health-connect/develop/sessions)).
- Reads reach 30 days before the first grant unless `READ_HEALTH_DATA_HISTORY` is granted; reads are
  foreground unless `READ_HEALTH_DATA_IN_BACKGROUND`
  ([read data](https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data),
  [HealthPermission](https://developer.android.com/reference/kotlin/androidx/health/connect/client/permission/HealthPermission)).
  Conflict: one page says older reads error, the other says `readRecords` simply leaves them out.
  Which Android version brought the history permission: **UNVERIFIED** (14 vs 15).
- How Galaxy and Pixel watches write heart rate to Health Connect: **UNVERIFIED**.

## 5. Other apps on a strength workout

| App | Chart over the session | Zones | Sets on the chart | Source of HR |
|---|---|---|---|---|
| Hevy | yes, plus average and calories ([1](https://www.hevyapp.com/features/best-way-to-track-workouts/), [2](https://www.hevyapp.com/features/workout-log/), both Hevy's own) | not mentioned | no | its own Apple Watch / Wear OS app |
| Strong | none found after the workout (**UNVERIFIED** that it has none); live HR on the watch ([help](https://help.strongapp.io/article/224-workout-on-apple-watch)) | no | no | its watch app, into Apple Health |
| WHOOP Strength Trainer | yes, lined up with each logged lift ([the5krunner](https://the5krunner.com/2023/04/27/whoop-ground-breaking-strength-training-or-damp-squib/), [WHOOP podcast page](https://www.whoop.com/us/en/thelocker/podcast-219-behind-the-development-of-the-all-new-strength-trainer/)) | yes, from resting and max HR ([gadgetsandwearables](https://gadgetsandwearables.com/2023/05/23/whoop-strength-trainer/)) | yes, the one praised | WHOOP band, paid |
| Garmin Connect | yes ([Garmin support](https://support.garmin.com/en-US/?faq=w8qlOr7BQ16Z82HVrevpw9)) | yes; time under Zone 1 not counted | **no**; asked for in two forum threads ([2022](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/286853/feature-request-show-what-i-was-doing-on-heartrate-graph-in-strength-training), [2024](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/398965/improving-visualization-of-strength-training)) | the watch or a strap |
| Strava | chart plus avg/max free; zones paid ([Strava support](https://support.strava.com/hc/en-us/articles/360034839691-Analyze-your-Performance-with-Heart-Rate-Data)); for Weight Training **UNVERIFIED** | paid | no sets at all | whatever uploads |
| Fitbod | live HR, avg, min, max, small live graph, "for reference only" (one source, **UNVERIFIED**) | no | no | Apple Health |

Patterns: marking the sets is the most-asked-for gap (Garmin threads, a
[Bevel request](https://feedback.bevel.health/feature-requests/p/workout-heart-rate-analysis)). Lifters
complain wherever a cardio score or zone target grades a lifting day (WHOOP strain, Garmin training
load, Strava Relative Effort): heart rate stays low through heavy sets with long rests. Wrist readings
during lifts can be 10 to 12 bpm off (reader comment, **UNVERIFIED**). None of the apps shows a
lifting-specific recovery number between sets that could be confirmed.

## 6. Size of the line in the synced document

Measured with `JSON.stringify` (scratch script, not committed). Demo workouts weigh about 1.1 KB each;
real ones with ticks and per-set heart rate run 2 to 4 KB.

| Points | Bytes per workout, `{ t0, step, bpm: [...] }` | A year at 2 / 4 / 6 a week | As `[ms, bpm]` pairs |
|---|---|---|---|
| 60 | 280 | 28 / 57 / 85 KB | 1.2 KB |
| 120 | 514 | 52 / 104 / 157 KB | 2.4 KB |
| 180 | 748 | 76 / 152 / 228 KB | 3.6 KB |

The limit that matters is the 5 MB sync body (`api/server.js` `MAX_BODY`, nginx `client_max_body_size
5m`) and the browser's `localStorage` (about 5 MB on most browsers). At 120 points and 4 workouts a
week the line adds about 2 % of that limit a year. Pairs with a timestamp each would be five times
bigger.
