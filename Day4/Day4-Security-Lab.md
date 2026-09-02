# Day 4 — Security Lab: Dependabot + CodeQL (Detailed Walkthrough)

This is the fully detailed, step-by-step version of Day 4 from `Hands-On-Lab-Guide.md`. It explains every
concept in plain language first, then walks through every click needed to run the labs, using the
ready-made files in `labs/Day4/sample-project/`.

> **Run all of this against a throwaway/sandbox repo.** Lab 4.1 pushes a fake secret and Lab 4.2 pins a
> real vulnerable dependency on purpose. Never do this on a production repository.

---

## 0. The four features, in one sentence each

| Feature | One-sentence explanation |
|---|---|
| **Secret scanning** | GitHub reads every file you push, looking for things that look like passwords/API keys/tokens. |
| **Push protection** | Same as secret scanning, but it checks *before* the push completes and can block it. |
| **Dependabot alerts** | GitHub compares your `package.json`/lockfile against a public database of known-vulnerable versions and warns you. |
| **Dependabot version updates** | A bot that opens PRs to bump your dependencies to newer versions on a schedule (separate from alerts). |
| **CodeQL / code scanning** | GitHub compiles and analyzes your *own source code* (not dependencies) for risky patterns like SQL injection. |
| **Dependency review** | A summary shown on a PR of exactly what dependency risk that PR is about to introduce, before you merge. |

**Simple analogy:** Dependabot is like a smoke detector for the *ingredients you bought* (your
dependencies). CodeQL is like a food safety inspector checking *your own cooking* (your code). Secret
scanning/push protection is like a guard at the door checking you didn't accidentally leave your house
keys (credentials) in a box you're shipping out.

---

## 1. Files provided in this lab folder

```
labs/Day4/sample-project/
├── .github/
│   ├── dependabot.yml            <- final, ready-to-use Dependabot config
│   └── workflows/
│       └── codeql.yml            <- final, ready-to-use CodeQL workflow
├── package.json                  <- pins lodash@4.17.15 on purpose (a known-vulnerable version), for Lab 4.2
├── src/
│   └── security-practice.js      <- intentionally vulnerable code, for Lab 4.3
└── workflow-stages/              <- progressive versions, for teaching the config build-up
    ├── lab-4.1-dependabot-basic.yml
    ├── lab-4.2-dependabot-full.yml     (== the final dependabot.yml)
    ├── lab-4.3-codeql-basic.yml
    └── lab-4.4-codeql-scheduled.yml    (== the final codeql.yml)
```

The `workflow-stages` files are **teaching copies** — show interns the "basic" version first, explain it,
then show the "full" version and explain what each new line adds. The files directly under `.github/` are
the ones you actually copy into the target repo to run the labs.

---

## 2. One-time setup (do this before the labs)

1. Open the sandbox repo on GitHub → **Settings → Code security**.
2. Turn on, one at a time (reading the description GitHub shows for each):
   - **Dependabot alerts**
   - **Dependabot security updates** (this is what lets Dependabot auto-open a *fix* PR once an alert fires — different from "version updates" in step 4 below)
   - **Secret scanning**
   - **Push protection** (only appears once secret scanning is on)
   - **Code scanning** → click **Set up → Advanced** (not "Default") so you control the workflow file yourself for this lab; in real projects, "Default" is the easier one-click option.
3. Explain to interns: alerts/scanning are **repo settings** (a switch), while `dependabot.yml` and
   `codeql.yml` are **config files that live in the repo** and control *how* those switches behave.

---

## 3. `dependabot.yml`, explained line by line

```yaml
version: 2
updates:
  - package-ecosystem: "npm"     # which package manager to watch (npm, pip, docker, github-actions, ...)
    directory: "/"                # folder containing the manifest file (package.json) to check
    schedule:
      interval: "weekly"          # how often Dependabot checks for new versions
      day: "monday"
    open-pull-requests-limit: 5   # max number of open update-PRs from Dependabot at once
    labels:
      - "dependencies"             # label auto-applied to every PR Dependabot opens
    commit-message:
      prefix: "chore(deps)"        # prefix on Dependabot's commit messages, for easy scanning of history
```

Key teaching points:
- **One `- package-ecosystem` block per thing you want watched.** This file has a second block for
  `github-actions`, so Dependabot also bumps `actions/checkout@v4` → `@v5` when a new version ships.
- This file controls **version updates** (routine "there's a newer release" PRs). It does **not** control
  whether you get **alerts** for known vulnerabilities — that's the repo setting from Section 2.
- `directory: "/"` must point at the folder that actually contains `package.json`. In a monorepo you'd add
  one block per project folder.

---

## 4. `codeql.yml`, explained line by line

```yaml
on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]
  schedule:
    - cron: '30 3 * * 1'    # also re-scan weekly even with zero new commits (catches newly-published CodeQL rules)

permissions:
  contents: read
  security-events: write    # required - this is the permission that lets CodeQL upload findings
  actions: read

jobs:
  analyze:
    steps:
      - uses: actions/checkout@v4          # step 1: get the code
      - uses: github/codeql-action/init@v3 # step 2: start CodeQL, tell it which language to analyze
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/autobuild@v3  # step 3: build the project (JS doesn't need a real build, but this step still traces how files are loaded)
      - uses: github/codeql-action/analyze@v3    # step 4: run the actual queries and upload results
```

Key teaching points:
- This runs as a normal Actions workflow — same mental model as the `ci.yml` from Day 2. The difference is
  it uses `github/codeql-action/*` steps instead of `npm test`.
- `security-events: write` is the one permission interns most often forget when writing this by hand — without
  it, the job runs but silently fails to publish results.
- The `schedule` cron line means new findings can appear **even if nobody touched the code that week**, because
  GitHub occasionally ships new/improved queries.

---

## Lab 4.1 — Secret scanning & push protection

**Goal:** see GitHub catch a leaked credential, both before and after it reaches history.

1. On the sandbox repo, create a branch: `git checkout -b lab/secret-scanning`.
2. Add a new scratch file `scratch-notes.txt` with one line that *looks* like a real AWS key
   (this exact pattern is what GitHub's scanner is trained on — it is not a real credential):
   ```
   AKIAABCDEFGHIJKLMNOP
   ```
3. Stage, commit, and push:
   ```bash
   git add scratch-notes.txt
   git commit -m "test: trigger secret scanning"
   git push -u origin lab/secret-scanning
   ```
4. **If push protection is on**, the `git push` is rejected immediately in your terminal, with a message
   that includes a link to allow/resolve it. Read the message out loud to interns — this is the "guard at
   the door" from the analogy in Section 0.
5. **If push protection is off but secret scanning is on**, the push succeeds. Within a minute or two, go to
   **Security → Secret scanning alerts** on GitHub and refresh — a new alert appears identifying the type of
   secret and the exact commit/line.
6. **Remediate:** delete the line from `scratch-notes.txt`, commit again with message
   `fix: remove fake credential`, and push. Open the alert on GitHub and mark it **Resolved → Revoked** (in
   a real incident you'd also physically rotate the real key with AWS — say this out loud even though this
   key is fake).
7. Delete the branch afterward: `git push origin --delete lab/secret-scanning`.

**Expected outcome:** interns see the difference between a *block* (push protection) and an *alert after
the fact* (secret scanning alone), and practice the resolve/rotate workflow.

---

## Lab 4.2 — Trigger a real Dependabot alert

**Goal:** get a genuine vulnerability alert from GitHub's advisory database, then let Dependabot fix it.

1. On a new branch, copy the provided `package.json` from this lab folder over the repo's real one (or, if
   you're using the shared `labs/sample-project`, just edit its `package.json` to add the same line):
   ```json
   "dependencies": {
     "express": "^4.19.2",
     "lodash": "4.17.15"
   }
   ```
   `lodash@4.17.15` has a publicly known prototype-pollution advisory — this is what makes the alert real
   instead of simulated.
2. Also copy this lab's `.github/dependabot.yml` into the repo (Section 3 explains what it does) if it
   isn't there yet.
3. Commit, push, and merge this branch to `main` (via a PR, per the Day 1 branch protection ruleset).
4. Wait a minute or two, then go to **Security → Dependabot alerts**. You should see an alert for `lodash`
   showing: the affected version range, the severity score, and the fixed version.
5. Because **Dependabot security updates** was enabled in Section 2, Dependabot should also have opened a
   *second* PR on its own titled something like `Bump lodash from 4.17.15 to 4.17.21`. Open that PR, look
   at the diff (only `package.json`/lockfile changes), and merge it.
6. Go back to **Security → Dependabot alerts** and confirm the alert now shows as **Closed** (auto-closed
   because the fixed version is now in `main`).

**Expected outcome:** interns see a full loop: vulnerable version in → real alert appears → automated fix
PR → merge → alert closes itself.

**Talking point:** ask interns to explain in their own words the difference between what they just did
(an *alert*, driven by a security advisory) and what `dependabot.yml`'s scheduled `npm` block does (a
*routine version bump*, with no vulnerability involved). This is the most commonly confused pair of
concepts in this lab.

---

## Lab 4.3 — Review a CodeQL finding

**Goal:** see CodeQL analyze real source code and flag a genuine risky pattern.

1. Copy this lab's `.github/workflows/codeql.yml` into the repo if it isn't already there (from Section 4).
2. On a new branch, copy `src/security-practice.js` from this lab folder into the repo's `src/` folder.
   Open it and read the comment — it shells out to `git log --grep=<taskId>` by string-concatenating
   unsanitized input, a textbook **command injection** pattern.
3. Commit, push, and open a PR to `main`.
4. Open the PR's **Checks** tab — you'll see the `Analyze (javascript-typescript)` job from `codeql.yml`
   running. Wait for it to finish (a minute or two for a project this small).
5. Once it's done, check the **Files changed** tab of the PR — CodeQL posts an inline annotation directly
   on the `exec(...)` line, describing the risk (untrusted input flows into a command execution) and
   linking to a short explanation of the query.
6. You can also see the same finding listed under **Security → Code scanning alerts** on the repo, even
   without opening the PR.
7. **Fix it** by replacing the vulnerable line with a safe call using `execFile`, which passes arguments
   separately instead of building a shell string:
   ```js
   const { execFile } = require('child_process');

   function getTaskHistory(taskId, callback) {
     execFile('git', ['log', '--grep=' + taskId], (err, stdout) => {
       callback(err, stdout);
     });
   }
   ```
8. Push the fix to the same branch. Watch the **Checks** tab re-run — the CodeQL annotation should
   disappear and the check should turn green.
9. Merge the PR.

**Expected outcome:** interns experience CodeQL exactly like a human reviewer — a comment on the diff,
tied to a specific line, that goes away once the code is actually fixed (not just once you dismiss it).

---

## Lab 4.4 — Dependency review on a PR

**Goal:** see dependency risk surfaced *before* merge, not just after, in a PR review.

1. Open (don't merge yet) the PR from Lab 4.2 that changes `package.json` to pin `lodash@4.17.15` — or open
   a fresh PR with that same change if you already merged it.
2. On the PR, open the **Files changed** tab. Above or below the `package.json` diff you should see a
   **Dependency review** summary box (GitHub adds this automatically on PRs that touch a manifest/lockfile,
   no extra workflow needed on public repos; private repos need GitHub Advanced Security).
3. Read what it shows: the vulnerable package name, the severity, and a link to the advisory — all visible
   to the reviewer *before* they click approve.
4. **Talking point:** contrast this with Lab 4.2's alert, which only appears *after* the code is already on
   `main`. Dependency review is the "catch it at PR time" version of the same information.

**Expected outcome:** interns can point to the exact spot in a PR review where they'd have caught this
dependency change even without Dependabot alerts existing yet.

---

## 5. Clean-up checklist (after the training session)

- [ ] Delete the `scratch-notes.txt` file and any lingering `lab/*` branches.
- [ ] Confirm the Lab 4.1 secret scanning alert is marked **Resolved**.
- [ ] Confirm the Lab 4.2 Dependabot alert is marked **Closed** (or manually dismiss it if using a
      throwaway repo you're about to delete anyway).
- [ ] Leave `dependabot.yml` and `codeql.yml` in place if you plan to reuse this repo — they're harmless and
      genuinely useful going forward.

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| No Dependabot alert appears after Lab 4.2 | Dependabot alerts wasn't enabled (Section 2), or GitHub's advisory sync hasn't run yet — wait a few minutes and refresh. |
| Push protection didn't block the fake key in Lab 4.1 | Push protection requires secret scanning to be on *first*, and only appears as an option after that; also confirm the pattern matches a supported provider (the sample `AKIA...` key is a supported AWS pattern). |
| CodeQL check doesn't appear on the PR in Lab 4.3 | Confirm `codeql.yml` is on `main` already (workflow files only trigger from what's already on the target branch) — merge it first via its own small PR if needed. |
| CodeQL job fails instead of just reporting a finding | Check the **Autobuild** step's log — for pure JS/TS projects this is almost always a missing `npm install`; add an explicit `run: npm install` step before `autobuild` if the project doesn't self-install. |
| Dependency review box doesn't show on the PR in Lab 4.4 | Feature requires GitHub Advanced Security on private repos; on public repos it should appear automatically — confirm the PR actually changes `package.json` or the lockfile. |

---

## 7. Recap for interns (say this out loud at the end)

- **Dependabot** watches your *dependencies* two ways: alerts (known vulnerabilities) and version updates
  (routine bumps) — two different switches, one config file (`dependabot.yml`) mostly controls the second.
- **CodeQL** watches *your own code*, running as a normal Actions workflow (`codeql.yml`), and comments
  directly on the PR diff like a reviewer would.
- **Secret scanning / push protection** watches for *leaked credentials*, with push protection blocking
  before the fact and plain secret scanning alerting after.
- **Dependency review** puts the Dependabot-alert information directly into the PR review screen, so risk
  is visible *before* merge.
