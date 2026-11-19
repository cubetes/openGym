# Voice quality: the best voice on the phone, by default (issue #1390)

Status: spec, not built. Base: `release-1.4.6`. Sibling: #1393 (AI trainer voice) speaks through
the same path and needs nothing extra from this spec.

## Why (the lifter's reason)

Spoken cues let you leave the phone in your pocket. Today they often sound like a robot, so people
switch them off after a week. Most iPhones and many Android phones already have a far better voice
installed, or one free download away. openGym just does not use it unless you dig through
Settings → Timer alerts → Voice and pick it by hand. On iOS 26 it is worse: the phone's own voice
choice is ignored (see Findings, F3).

The fix: use the best voice this phone has, automatically, and tell people how to get a better one
when the phone has none. No new dependency, nothing sent anywhere, works offline.

## Goals

1. **Best voice by default.** When no voice was picked by hand, speak with the best installed voice
   for the app's language: Premium, then Enhanced, then today's default. Same rule on Android with
   its own quality values.
2. **Best first in the list.** The voice sheet lists the best voices at the top.
3. **Show the way to a better voice.** On an iPhone with only basic voices for the language, say
   where to download a better one. On Android, offer a button to the phone's voice download screen.
4. **Pick it up on return.** Coming back to openGym after a download, the new voice is used and
   listed without a restart.

## Non-goals (left out, and when to add them)

| Left out | Why | Add it when |
|---|---|---|
| Siri voices | Not reachable by any app (F1). | Apple opens them. |
| Personal Voice (iOS 17+) | Apple says it is meant for speech-aid apps (F5); 3 languages only; iPhone 12+; a long setup. Your own recorded clips (v1.4.5) already cover "my own voice". | Users ask for it, or Apple widens the use. See open question Q2. |
| A bundled voice engine (Piper, Kokoro) | 60 to 170 MB per voice, per language, 25 languages (F11). A hard sell on size and dependencies. | Never, unless phones stop shipping good voices. |
| Cloud voices (ElevenLabs, OpenAI, Google Cloud) | Sends text to a third party and needs an account. Breaks privacy-first and offline. | Never as a default. #1393 may revisit as an opt-in. |
| Recorded voice packs | Fixed lines cannot say "80 kilos, 8 reps" naturally, and #1393's lines are new every session. | Never. |
| Browser ranking | Browsers do not report voice quality (F7). | A browser starts reporting it. |
| Speaking on the watches | Neither watch app speaks today. A separate feature. | Its own issue. |

## Anti-goals (must stay true)

- A voice someone picked by hand stays picked. The automatic choice only fills the "no pick" case.
- The automatic choice never uses a voice that needs the internet. A gym basement has no signal,
  and openGym Offline has no network at all. A network voice is still there to pick by hand, as now.
- The text never leaves the phone to be spoken.
- No new dependency, frontend or native.
- Nothing imitates a real person (the rule in `lib/voice-styles.js` stays).

## Constraints

- iOS minimum 15.5. `.premium` exists from iOS 16, the voices-changed notice from iOS 17 (F4).
- Android minimum SDK 24. `Voice.getQuality()` exists from API 21 (F6).
- The voice pick stays on the device (`og_speech_voice` in localStorage), never synced. Voices
  differ per device.
- Every new `t()` string goes into all 25 locale packs (CONTRIBUTING, CLAUDE.md).
- The ranking rule is logic worth a unit test: a pure helper in `frontend/src/lib` with a vitest
  file beside it.
- User-facing text: plain, no em dashes.

## How it works today

- `lib/speech.js` `speak()` hands each line to the native side on the phones (`speakNative`), else
  the Web Speech API. `voiceOpts(S)` passes `voice: pickedVoice()`, which is `''` unless picked.
- iPhone (`frontend/ios/App/App/RestAlertPlugin.swift` `speak`): with no pick it calls
  `AVSpeechSynthesisVoice(language:)`. That is usually the compact voice, the robotic one.
  `voices()` lists `speechVoices()`, tags `enhanced` / `premium`, skips Personal Voice.
- Android (`SpeechCue.java`, `RestAlertPlugin.java` `voices`): with no pick, `setLanguage()` gives
  the engine's default voice. The list skips not-installed voices and reports `online`, but
  **does not report quality**.
- `listVoices()` sorts exact region first, then by name. Quality plays no part.
- `components/VoiceSettings.jsx`: the Voice row shows "Default voice" or the picked name. The sheet
  shows "Default voice" first, then each voice with "Premium" / "Enhanced" / "Needs internet".
  When the language has no voices: "No other voices for this language here. Your device's settings
  can add more."
- The voice list is read once, when the Voice settings screen mounts.

## Findings

Confidence: **V** = two or more independent sources agree, **1** = one source, **U** = not confirmed.

| # | Finding | Conf. | Sources |
|---|---|---|---|
| F1 | Third-party apps cannot use Siri voices. They do not appear in `speechVoices()`, and `siri_` identifiers do not play. Apple documents no way in. | V (no Apple doc either way) | [CoMaps, Aug 2026](https://www.comaps.app/news/ios-hq-voices/); [Apple forums 682438](https://developer.apple.com/forums/thread/682438); [Apple forums 676726](https://developer.apple.com/forums/thread/676726) |
| F2 | Premium (iOS 16+) is "a premium quality voice that you must download". Downloaded Enhanced and Premium voices are usable by apps. All preinstalled voices report `default`, though they vary. | V | [Apple: AVSpeechSynthesisVoiceQuality.premium](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoicequality/premium); [Ben Dodson, 2024](https://bendodson.com/weblog/2024/04/03/using-your-personal-voice-in-an-ios-app/); [Readium read-aloud best practices](https://github.com/HadrienGardeur/read-aloud-best-practices/blob/main/voice-selection.md) |
| F3 | On iOS 26, `AVSpeechSynthesisVoice(language:)` returns the system default and ignores the voice the person chose in Accessibility settings. Asking for a voice by its identifier still works. | 1 (forum report, bug FB20271264) | [Apple forums 804648](https://developer.apple.com/forums/thread/804648) |
| F4 | `AVSpeechSynthesizer.availableVoicesDidChangeNotification` (iOS 17+) fires when the set of voices changes. | 1 (primary doc) | [Apple docs](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/availablevoicesdidchangenotification) |
| F5 | Personal Voice: apps call `requestPersonalVoiceAuthorization` (iOS 17+); the person must first turn on Settings → Accessibility → Personal Voice → Allow Apps to Request to Use. Apple: usage "is sensitive and should be primarily used for augmentative or alternative communication apps". Languages: English (US), Mandarin (China mainland), Spanish (Mexico). iPhone 12 or later. About 15 minutes of reading, then overnight processing on charge. Can sync to other devices through iCloud. Reported: an app may need a restart after the grant; buffer callbacks do not work with it. | V (main facts), 1 (restart, buffers) | [Apple Support 104993](https://support.apple.com/en-us/104993); [WWDC23 10033](https://developer.apple.com/videos/play/wwdc2023/10033/); [Apple feature availability](https://www.apple.com/ios/feature-availability/); [Ben Dodson](https://bendodson.com/weblog/2024/04/03/using-your-personal-voice-in-an-ios-app/); [forums 764814](https://developer.apple.com/forums/thread/764814), [736148](https://developer.apple.com/forums/thread/736148) |
| F6 | Android `Voice.getQuality()`: 100 very low to 500 "very high, almost human-indistinguishable"; `getLatency()` and `isNetworkConnectionRequired()` exist. One older developer report says real engines top out at 400. | V (constants), U (top out at 400) | [Android Voice reference](https://developer.android.com/reference/android/speech/tts/Voice); [Readium](https://github.com/HadrienGardeur/read-aloud-best-practices/blob/main/voice-selection.md) |
| F7 | Browsers' `getVoices()` gives no quality. | 1 | [Readium](https://github.com/HadrienGardeur/read-aloud-best-practices/blob/main/voice-selection.md) |
| F8 | Download size: Apple says Enhanced voices "can be 100 MB or larger", Wi-Fi needed. Guides put Premium at 100 to 500 MB. | V (100 MB+), U (upper bound) | [Apple Support: adjust voice and speed](https://apple.co/2ArtmmM); [Ben Dodson](https://bendodson.com/weblog/2024/04/03/using-your-personal-voice-in-an-ios-app/) |
| F9 | Where to download on iPhone: Settings → Accessibility → Read & Speak → Voices (the menu was called Spoken Content before; sources disagree on whether the rename came in iOS 18 or 26). | V (path), conflict (version) | [CoMaps](https://www.comaps.app/news/ios-hq-voices/); [AbilityNet iOS 26 guide](https://mcmw.abilitynet.org.uk/how-to-customise-the-voice-used-by-screen-readers-in-ios-26-on-your-iphone-or-ipad); Apple Support 104993 names "Read & Speak" |
| F10 | Android: `TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA` opens the engine's voice install screen (public API). The `<queries>` entry for `TTS_SERVICE` that Android 11+ needs is already in our manifest. Google voice data was ~244 MB for a high quality English voice in an older release. | V (intent), U (size today) | [TextToSpeech.Engine](https://developer.android.com/reference/android/speech/tts/TextToSpeech.Engine); [Android Central](https://androidcentral.com/latest-google-text-speech-update-enables-high-quality-voices-us-and-uk-english) |
| F11 | Offline engines: Piper's active fork is GPL-3.0, 27 to 137 MB per voice; Kokoro-82M is Apache-2.0, 86 to 325 MB. | 1 per figure (secondary) | [PromptQuorum](https://www.promptquorum.com/power-local-llm/piper-vs-kokoro-tts); [soniqo Kokoro guide](https://soniqo.audio/guides/kokoro) |

Prior art:

- **Apple Workout Buddy** (watchOS 26): "a dynamic generative voice built using voice data from
  Fitness+ trainers". Needs Bluetooth headphones and an Apple Intelligence iPhone; English and
  Spanish. No public API for other apps that we could find (U).
  [Apple Newsroom](https://www.apple.com/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/),
  [BikeRadar](https://www.bikeradar.com/news/apple-workout-buddy), feature-availability page.
- **Strava**: phone's own speech engine; its help page tells Android users to check their
  text-to-speech settings. [Strava support](https://support.strava.com/hc/articles/216917237)
- **Runkeeper**: lets you pick the "audio cue voice". [Runkeeper help](https://help.runkeeper.com/en/hc/the-audio-stat-guide)
- **CoMaps** (open-source maps): the same problem; their answer is a how-to post telling iPhone
  users to download a Premium voice. [CoMaps](https://www.comaps.app/news/ios-hq-voices/)
- **Hevy, Strong**: rest timers use sounds, no spoken set cues found (U).
  [Hevy help](https://help.hevyapp.com/hc/en-us/articles/35385404949143)
- Not checked: Peloton, Nike Run Club, Fitbod, Future (coach-recorded audio is their pitch, U).

## Ideas considered

1. **Minimal: best installed voice by default.** Rank by quality, use the top one when nothing is
   picked. Tiny change, fixes F3 as a side effect.
2. **Hint to download a better voice.** Text on iPhone, a button on Android.
3. **Personal Voice.** Hear your own voice. Big wow, real limits (F5).
4. **Bold: bundle an open neural engine.** Same voice on every phone, but hundreds of MB and a
   native dependency per platform (F11).
5. **Cloud voice, made once per line.** Best sound, breaks privacy and offline.
6. **Recorded human voice pack.** Sounds real, cannot say arbitrary numbers or #1393's lines.
7. **Workout Buddy hand-off.** No API (U).

Approaches:

| | What | Cost | Verdict |
|---|---|---|---|
| A | Ideas 1 + 2 | Small: one pure helper, Android reports quality, a hint, a refresh on return | **Picked** |
| B | A + Personal Voice behind a permission | A plus a permission flow, three languages, App Review risk (F5) | Later, if asked (Q2) |
| C | A + bundled engine | Large app size, new native dependency | Rejected |

## Design

### 1. The ranking rule (one pure helper)

Add a pure helper in `frontend/src/lib/speech.js` (for example `bestVoice(voices, lang)`), with
cases in `speech.test.js`. `listVoices()` and the automatic choice both use it, so the order in the
list and the automatic pick can never disagree.

Among voices that speak the app's language (`voiceSpeaks`), and are not `online`:

1. Higher quality tier first: `premium`, then `enhanced`, then none.
2. Same tier: exact region first (`en-GB` before `en-US` for a British app).
3. Same tier and region: keep today's order (by name).

The automatic choice is the top voice **only if it has a tier**. With no Enhanced or Premium voice,
the automatic choice is `''`, exactly today's behaviour (the system's default for the language).
This keeps novelty voices and odd defaults out, and makes the change zero-risk on phones with
nothing better.

Assumption A1: quality beats region. A Premium American voice beats a basic British one for a
British app. See Q3.

### 2. Android reports quality

`RestAlertPlugin.java` `voices()` adds `quality` from `Voice.getQuality()`:
500 → `'premium'`, 400 → `'enhanced'`, lower → none. `listVoices()` already keeps those two values.
The builder must log real values on a Pixel (Google engine) and a Samsung (Samsung engine) first;
if an engine gives every voice the same value, the rule above changes nothing there, which is safe.

### 3. Using the automatic choice

When the person picked nothing, `speak()` passes the automatic voice's id instead of `''`. The
native sides need no change: both already speak a voice by id (iOS
`AVSpeechSynthesisVoice(identifier:)`, Android by name). Asking by id also avoids the iOS 26 bug
(F3).

- Work out the automatic voice once per language, cache it in memory, and redo it when the app
  comes back to the front (the `visibilitychange` / `appStateChange` pattern in
  `lib/coach-schedule.js`). On iOS 17+ the builder may also listen for the voices-changed notice
  (F4); the return-to-front refresh alone is enough for a first build.
- If the list is not ready when a line must be said, speak with `''` (today's behaviour). A cue is
  never delayed waiting for the list.
- An id that vanished (voice deleted) already falls back to the default on both platforms.
- Web: unchanged.

### 4. Settings → Timer alerts → Voice

- The first row of the voice sheet, today "Default voice", becomes **Automatic**, with a subtitle
  naming what it uses: "Uses Ava (Premium), the best voice on this phone." With nothing better than
  the basic voice: "Uses your phone's standard voice."
- The Voice row's value reads "Automatic" (or "Automatic · Ava" if it fits).
- The list below follows the ranking rule, best first.
- **iPhone hint**, in the sheet's footer, only when no Enhanced or Premium voice exists for the
  language:
  > For a voice that sounds more like a person, download one marked Enhanced or Premium. On your
  > iPhone: Settings → Accessibility → Read & Speak → Voices (Spoken Content on older iPhones).
  > Each is 100 MB or more, so use Wi-Fi. openGym uses it as soon as it is there.
  No button: iOS has no public link into Accessibility settings (U), and a private one risks App
  Review.
- **Android**, always at the end of the list, a row **Get more voices**, subtitle "Opens your
  phone's speech settings." It starts `ACTION_INSTALL_TTS_DATA` (F10); if nothing handles it, the
  phone's text-to-speech settings screen. This needs one new plugin method.
- Picking "Automatic" plays the sample line in the automatic voice, like any other row.

The existing footer "No other voices for this language here. Your device's settings can add more."
stays for the empty case.

### 5. Platforms

| | Automatic best voice | Hint | Refresh on return |
|---|---|---|---|
| iPhone | Yes (Premium/Enhanced) | Text, when only basic voices | Yes |
| Android | Yes, where the engine reports quality | "Get more voices" row | Yes |
| Browser | No change | No | No |
| Apple Watch, Wear OS, Garmin | Not in scope: they do not speak | | |

AirPods change nothing: the phone's voice already plays through them like any audio. Workout
Buddy's voice is Apple's own and not offered to apps (U).

### 6. How #1393 benefits

The AI trainer will say longer, varied lines through the same `speak()` path. It gets the
automatic voice for free, and a good voice matters more for a full sentence than for "10 seconds".
#1393 must not add a voice choice of its own. If a Premium voice takes noticeably long to say its
first line of a workout (U, measure it), warming the synthesizer at workout start serves both
features.

### 7. What people will notice

People who never picked a voice will hear a different, better one after the update, if their phone
has one. That is the point. The release note says so, in one line: "Spoken cues now use the best
voice on your phone. Pick another in Settings → Timer alerts → Voice."

## Acceptance checks for the builder

- `bestVoice` unit tests: tier order; region tie-break; network voices never picked; no tier gives
  `''`; a hand-picked voice is untouched.
- iPhone with a Premium voice for the app language and no pick: cues use it (check the voice name
  in the sheet subtitle and by ear).
- iPhone with only basic voices: cues sound as before; the hint shows; after downloading a voice
  in Settings and switching back, the subtitle names the new voice without restarting openGym.
- Android Pixel and Samsung: the quality values seen are written into the PR; "Get more voices"
  opens a voice download or speech settings screen.
- openGym Offline: no network voice is ever chosen automatically.
- All locale checks pass (`check-locales.mjs`, `check-source-strings.mjs --strict`).

## Assumptions (no answer from the user yet)

- A1: quality beats region (see Q3).
- A2: Personal Voice waits (see Q2).
- A3: iPhone and Android in this build; browser and watches out.
- A4: the automatic voice is the default for everyone who has not picked one, including people
  upgrading.

## Open questions, most important first

1. **Q1. What does "success" sound like to you?** Is "the best voice your phone already has, plus
   a nudge to download one" enough, or do you need it to sound like Siri on every phone out of the
   box? (The second is not possible without cloud voices or a bundled engine.) Recommended: the first.
2. **Q2. Personal Voice now or later?** Recommended: later. Apple points it at speech-aid apps, it
   covers three languages, and your own recorded clips already let you hear yourself.
3. **Q3. Accent or quality?** Should a Premium voice from another region win over a basic voice
   from yours (American Premium over basic British)? Recommended: quality wins.
4. **Q4. Should the upgrade switch voices for existing users silently?** Recommended: yes, with
   the one-line release note.
5. **Q5. Watches**: should #1393 or a later issue make the watches speak, for the phone-in-locker
   case? Out of scope here.
