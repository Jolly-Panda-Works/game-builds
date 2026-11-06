#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence
APK=$(find apk -name '*.apk' -type f | head -1)
AAPT=$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort -V | tail -1)
PACKAGE=$("$AAPT" dump badging "$APK" | sed -n "s/package: name='\([^']*\)'.*/\1/p")
ACTIVITY=$("$AAPT" dump badging "$APK" | sed -n "s/launchable-activity: name='\([^']*\)'.*/\1/p")
test -n "$PACKAGE" && test -n "$ACTIVITY"
adb install "$APK"
adb logcat -c
adb shell am start -W -n "$PACKAGE/$ACTIVITY" | tee evidence/launch.txt
sleep 8
adb shell pidof "$PACKAGE" | tee evidence/process.txt
adb shell input tap 540 1050
adb shell screencap -p /sdcard/smoke.png
adb pull /sdcard/smoke.png evidence/screenshot.png
adb logcat -d > evidence/logcat.txt
if grep -q 'FATAL EXCEPTION' evidence/logcat.txt; then exit 1; fi
