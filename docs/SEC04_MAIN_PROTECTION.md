# SEC04 - main protection ACTIVE

## Scope and actual state

The owner activated repository ruleset `24505795` on 2026-10-05 after importing the prepared configuration. API read-back confirms `enforcement: active`, `refs/heads/main` only, an empty bypass list and `current_user_can_bypass: never`. The main branch now reports `protected: true`. The earlier pending status described the preparation phase before owner activation; it is no longer the current rule state.

PR #39 prepared all six existing CI workflows to run on every normal pull request targeting main and every push to main, including docs-only and workflow-only changes. All existing job names, test commands, credentials policy, dependencies and timeouts were preserved. Only event filters changed, plus a CI configuration contract test. No frontend, database migration, Auth or Pages setting was changed. Frontend remains Build 100.

## Enforced configuration

Ruleset name: `MS Purchasing - main CI protection`. Only `refs/heads/main` is included, with no exclusions. Deletion and force-push are blocked; pull requests are required; zero approving reviews are required. Code-owner review and last-push approval are disabled. There are no bypass actors.

Required checks, all restricted to GitHub Actions integration `15368`: `regression`, `patch-contracts`, `revision-guard-contracts`, `recovery-attention`, `profit-range`, `restore-rehearsal`. Strict up-to-date policy is enabled. Status checks are enforced on creation too. No merge queue, automatic merge, signed-commit or linear-history requirement was added.

GitHub also returned its default `require_extra_approval_for_unattributed_changes: true`; this was not modified during verification. Normal allowed merge behavior must be validated rather than assuming that a rule read-back alone is sufficient.

## Why the event filters changed first

GitHub documents that workflows skipped by path filters can leave a required check pending and block an otherwise valid pull request. Running the six suites consistently avoids that accidental lockout. This increases CI executions for documentation-only changes. Do not use commit-message skip directives on PRs requiring these checks; failing closed is intentional.

Do not require Pages `build`, `deploy` or `report-build-status` as pre-merge checks: deployment occurs after main is updated. The existing Pages mechanism is unchanged. This work provides a pre-merge barrier, not a separate post-merge deployment gate.

## Verification record

See `docs/SEC04_ENFORCEMENT_VERIFICATION.md` and PR #40's recorded check results. An isolated, non-draft PR was used so a draft block could not be mistaken for CI enforcement. The intentional failure existed only on that branch; its required regression check failed and GitHub reported `mergeable_state: blocked`, despite no merge conflicts. No merge request was made for that state.

The original test blob was then restored exactly. The final PR diff must contain documentation only. A documentation-only squash merge is permitted only after all six required checks succeed and GitHub reports an unblocked state; PR #40's conversation contains the final evidence and main/Pages verification. Squashing avoids bringing the temporary negative-test commit onto main.

No rule bypass, protection disablement, main failure push, production save/upload or database operation is part of this verification.

## Ongoing operation and recovery

For each subsequent change: use a separate branch/PR, keep it up to date, require all six checks, merge normally, then separately verify main CI and Pages. Do not equate a successful pre-merge check with successful deployment.

The connected GitHub tools do not provide Administration writes. The owner manages this ruleset in Settings. Correct only a specifically misconfigured rule if needed; do not add broad bypass actors. Reverting the CI preparation while keeping mandatory checks can reintroduce path-filter lockout. No Supabase rollback is involved.

## Official references reviewed

- https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository
