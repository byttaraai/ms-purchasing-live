# SEC04 - required-check preparation; repository enforcement PENDING

## Scope and actual state

The user approved reviewing main protection and permissions to require passing tests before merge, without changing the app or business data. At the inspected baseline `0b4932d5683ed1d838682fc346dfd7222f2839e4`, `main` reports `protected: false` and the repository rulesets collection is empty. The connected GitHub tools do not provide Administration writes; committing a JSON file does not activate branch protection.

This change prepares all six existing CI workflows to run on every normal pull request targeting main and every push to main, including docs-only and workflow-only changes. All existing job names, test commands, credentials policy, dependencies and timeouts are preserved. Only event filters change, plus a small added CI configuration contract test. The obsolete SEC03 review-branch trigger is removed. No frontend, database migration, Auth or Pages setting is changed. Frontend remains Build 100.

## Why the event filters must change first

GitHub documents that a workflow skipped by path filters can leave a required check pending and block an otherwise valid pull request. Also, a change to a different workflow or documentation would previously skip some suites. Running the six suites consistently avoids that accidental lockout. This increases CI executions for documentation-only updates. Commit-message skip directives such as `[skip ci]` must not be used on PRs requiring these checks; failing closed is intentional.

## Owner activation (not executed by this commit)

After this PR and its same-SHA main checks succeed, open repository Settings > Rules/Rulesets > New ruleset > Import a ruleset. Import `maintenance/sec04-main-ruleset.json`, inspect it, confirm enforcement is Active, and create it. Keep the bypass list empty.

The template targets only `refs/heads/main`, blocks deletion/force-push, requires a PR, and requires these existing GitHub Actions checks with an up-to-date branch: `regression`, `patch-contracts`, `revision-guard-contracts`, `recovery-attention`, `profit-range`, `restore-rehearsal`. Zero approving reviews are required to avoid introducing a second-person dependency into the existing single-owner workflow. No automatic merge, signed-commit rule or merge queue is introduced.

Do not require Pages `build`, `deploy` or `report-build-status` before merging: those deployment jobs occur after main is updated. The existing Pages deployment mechanism is unchanged; this work prepares a pre-merge barrier, not a post-merge deployment gate. Until the owner activates the ruleset, GitHub can still accept unprotected merges/pushes.

## Verification and completion gate

Verify six successful check results against the final PR commit, and verify all main checks and Pages after merge. A separate documentation-only PR can verify absence of path-filter lockout. Confirm the frontend and all existing tests/migrations are unchanged in the final diff. The new tests validate exact old workflow blob reconstruction, strict triggers, job names/source matching, safe main-only settings and mutation rejection.

After activation, read back the active ruleset and main branch rules; verify the six exact contexts, source GitHub Actions, strict policy, PR requirement and empty bypass list. Exercise a harmless draft PR with a deliberately failing test WITHOUT merging it, then fix it and verify the blocked-to-passing transition. Never test a failure by pushing it to main. These enforcement tests are pending until activation; successful CI alone does not prove protection.

To undo the CI preparation, revert this PR only. If ruleset configuration is wrong, the owner can correct or temporarily disable that single rule in Settings; do not add broad bypass actors. No Supabase rollback is necessary.

## Official references reviewed

- https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository
- https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset
