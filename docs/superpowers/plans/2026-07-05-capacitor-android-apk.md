# Capacitor Android APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sideloadable Android debug APK that embeds the offline cdda-guide web build.

**Architecture:** Keep the Vite/Svelte web app as the source of truth. Use Capacitor as a thin Android shell whose native project syncs the generated `dist/` output from `npm run build:offline`.

**Tech Stack:** Svelte, Vite, Capacitor, Android Gradle project, npm scripts.

---

## File Structure

- Modify `package.json`: add Capacitor dependencies and Android build scripts.
- Create `capacitor.config.ts`: define app id, app name, and `webDir`.
- Create `android/`: generated Capacitor Android project.
- Modify `.gitignore`: ignore Android build outputs and generated APKs.

## Task 1: Add Capacitor Dependencies And Config

**Files:**
- Modify: `package.json`
- Create: `capacitor.config.ts`

- [ ] **Step 1: Install Capacitor packages**

Run:

```shell
npm install @capacitor/core @capacitor/cli @capacitor/android
```

Expected: package dependencies and lockfile update.

- [ ] **Step 2: Create Capacitor config**

Create `capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.godrenech.cddaguide",
  appName: "CDDA Guide",
  webDir: "dist",
};

export default config;
```

- [ ] **Step 3: Add package scripts**

Add these scripts to `package.json`:

```json
"android:sync": "npm run build:offline && cap sync android",
"android:debug": "npm run android:sync && cd android && gradlew.bat assembleDebug"
```

- [ ] **Step 4: Validate TypeScript config**

Run:

```shell
npm run validate
```

Expected: Svelte and TypeScript validation pass.

- [ ] **Step 5: Commit**

Run:

```shell
git add package.json package-lock.json capacitor.config.ts
git commit -m "Add Capacitor Android config"
```

## Task 2: Generate Android Project

**Files:**
- Create: `android/`
- Modify: `.gitignore`

- [ ] **Step 1: Generate Android project**

Run:

```shell
npx cap add android
```

Expected: `android/` directory is created.

- [ ] **Step 2: Ignore Android generated outputs**

Add to `.gitignore`:

```gitignore
/android/.gradle/
/android/build/
/android/app/build/
*.apk
```

- [ ] **Step 3: Sync Android assets**

Run:

```shell
npm run android:sync
```

Expected: offline web assets are built and copied into `android/app/src/main/assets/public`.

- [ ] **Step 4: Commit**

Run:

```shell
git add .gitignore android
git commit -m "Add Capacitor Android project"
```

## Task 3: Build Debug APK

**Files:**
- No planned source edits unless the build reveals a required configuration fix.

- [ ] **Step 1: Build debug APK**

Run:

```shell
npm run android:debug
```

Expected APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 2: Confirm APK output exists**

Run:

```shell
Test-Path android/app/build/outputs/apk/debug/app-debug.apk
```

Expected: `True`

- [ ] **Step 3: Check git status**

Run:

```shell
git status --short
```

Expected: generated APK and Android build directories are ignored.

## Task 4: Push Branch

**Files:**
- No source edits.

- [ ] **Step 1: Verify branch**

Run:

```shell
git status --short --branch
git log --oneline -5
```

Expected: branch is `feat/capacitor-android-apk` and worktree is clean.

- [ ] **Step 2: Push branch**

Run:

```shell
git push -u origin feat/capacitor-android-apk
```

Expected: branch is pushed to the fork.

## Spec Coverage Check

- App identity: Task 1 adds `io.github.godrenech.cddaguide` and `CDDA Guide`.
- APK contains offline web build: Task 2 runs `android:sync` after `build:offline`.
- Debug APK output: Task 3 builds and checks `app-debug.apk`.
- Release signing deferred: no release signing task is included.
- Generated APK ignored: Task 2 updates `.gitignore`.
