# Testing the openGym Wear OS preview

Thanks for helping test the watch app! This branch (`wear-preview`) holds the new watch features that are still in review. You build the test apps yourself from it. The first time takes about 15 minutes.

## What you need

- **Node 22**
- **JDK 21** (17 also works)
- **Android Studio**, for the Android SDK and `adb`
- An Android phone and a Wear OS 3+ watch (Galaxy Watch, Pixel Watch, ...)

## 1. Get the code

```
git clone https://github.com/cubetes/openGym.git
cd openGym
git checkout wear-preview
```

## 2. Build both apps

Build the phone app and the watch app **on the same computer**. They only talk to each other when the same key signs both, and a test build uses your computer's own key.

```
cd frontend
npm ci
npm run build:mobile
cd android
./gradlew :app:assembleSideloadDebug :wear:assembleDebug
```

If Gradle can't find the Android SDK, set it first:

- Mac: `export ANDROID_HOME=~/Library/Android/sdk`
- Linux: `export ANDROID_HOME=~/Android/Sdk`

## 3. Install on the phone

Turn on USB debugging on the phone and plug it in. Then, still in `frontend/android`:

```
adb install app/build/outputs/apk/sideload/debug/app-sideload-debug.apk
```

It installs as **"openGym test"**, next to your normal openGym, so your real data isn't touched. Sign in to your server in it, or just use it without an account.

## 4. Install on the watch

1. **Turn on Developer options.**
   - Galaxy Watch: Settings > About watch > Software information, tap "Software version" 5 times.
   - Pixel Watch: Settings > System > About > tap "Build number" 7 times.
2. **In Settings > Developer options,** turn on **ADB debugging** and **Wireless debugging**. The watch and the computer must be on the same Wi-Fi.
3. **In Wireless debugging, tap "Pair new device".** The watch shows an address and a code. On the computer:

```
adb pair <IP:port> <code>
adb connect <IP:port>
adb -s <IP:port> install wear/build/outputs/apk/debug/wear-debug.apk
```

The port for `connect` is the one on the main Wireless debugging screen, not the pairing one.

## 5. Before you start

- In **openGym test** on the phone, set your **year of birth** (Settings, "Sex and year of birth"). The watch needs it for heart-rate zones.
- Make a short routine with 2 or 3 exercises and 3 sets each, or use one you have.
- Give the watch app the permissions it asks for (heart rate, exercise).

## 6. Testing protocol

Do one real or practice workout and go through the list. For each step, note **OK** or what went wrong. A screenshot helps a lot when something looks off.

### A. Connection
1. Start the workout on the phone. **Expect:** the watch opens it within a few seconds and shows the first set.
2. Log a set on the watch. **Expect:** it shows as done on the phone.
3. Log a set on the phone. **Expect:** the watch moves on too.

### B. Set page
4. Turn the crown or bezel to change the weight, tap the reps box and change the reps. **Expect:** smooth steps, numbers easy to read.
5. Check the whole screen. **Expect:** no text cut off at the edges, nothing hidden behind the clock.

### C. Set menu
6. Tap the set line ("2/3 •••"), or long-press the weight or reps. **Expect:** the menu opens.
7. Mark a set as **Warm-up**, then as **Failure**, then as **Drop**. **Expect:** the tag shows on the set page and on the phone.
8. **Add** a set. **Expect:** the count goes up ("2/4") on the watch and on the phone.
9. **Remove** a set, then tap **Undo** within 4 seconds. **Expect:** the set comes back and the phone never loses it.
10. Remove a set and wait. **Expect:** it is gone on the phone too.

### D. Rest
11. Finish a set. **Expect:** the rest countdown is the big number, with −15 / Skip / +15 below.
12. Tap +15 a few times quickly. **Expect:** it shows the total ("+30 s").
13. Let it run out. **Expect:** the last 3 seconds turn orange, and the watch buzzes at the end.
14. Skip the rest on the phone. **Expect:** the watch's rest ends too.

### E. Metrics (swipe left from the set page, then up and down)
15. **Metrics:** time, heart rate, calories, volume and sets. **Expect:** the numbers move as you train.
16. **Pulse:** average, max and min heart rate.
17. **Effort:** your rating per exercise (if you rated sets).
18. **Zones:** five bars, Z5 on top, the zone you are in outlined. **Expect:** times grow in the right zone. Without a year of birth it says "No age set".
19. **Muscles:** sets per muscle today, with an arc on the side. **Expect:** it counts only finished working sets, not warm-ups.

### F. Other
20. Lower your wrist during rest. **Expect:** the Always On screen is dim and still readable.
21. If you use TalkBack: the numbers can be changed and read out.
22. Add the openGym complication to a watch face, a wide slot if you have one. **Expect:** "3 of 12 sets" during a workout.
23. Finish the workout. **Expect:** the summary shows on the watch, and the workout is saved on the phone.
24. After the workout, open **Health Connect**. **Expect:** the workout with the watch's calories.

## 7. Send your report

Copy this into Discord or a GitHub issue:

```
Watch: (model and size, e.g. Galaxy Watch 6 Classic 47 mm)
Wear OS / One UI Watch version:
Phone:
Text size on the watch: (default or bigger)
Language:

A. Connection: 1 _ 2 _ 3 _
B. Set page: 4 _ 5 _
C. Set menu: 6 _ 7 _ 8 _ 9 _ 10 _
D. Rest: 11 _ 12 _ 13 _ 14 _
E. Metrics: 15 _ 16 _ 17 _ 18 _ 19 _
F. Other: 20 _ 21 _ 22 _ 23 _ 24 _

Crashes or freezes:
What felt slow or confusing:
What you'd want next:
```

Put **OK**, **X** (broken, with a few words) or **-** (not tried) in each blank.

## Updating

When there's a new preview, pull it and repeat steps 2 to 4:

```
git pull
```

## Removing it

Uninstall "openGym test" from the phone and the watch. Your normal openGym app is not affected.
