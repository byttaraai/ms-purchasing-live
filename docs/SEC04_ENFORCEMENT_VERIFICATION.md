# SEC04 enforcement verification

## Active rule read-back

Owner activation date: 2026-10-05. Ruleset `24505795` is Active and applies to main only, with no bypass. It requires a pull request, zero approving reviews, all six GitHub Actions checks and an up-to-date branch, and blocks branch deletion and force-push. Main reports protected. This is an actual API read-back, not an inference from importing JSON.

## Negative test - verified

Isolated PR #40, non-draft, based on main `85fa6150d5aad26f95fb26393e452d172dae780a`.

- Negative head: `54b6c3c20e72cf209f231796ab362cf16cf2b4f0`.
- GitHub test-merge SHA: `94576a5e2ad71b68ff5386cd4d1c23ebc441514a`.
- Required regression run `37316438970`, job `111784253271`: FAILURE.
- Inspected log: nine original CI configuration tests passed; only `SEC04_NEGATIVE_PROBE_REQUIRED_CHECK_MUST_BLOCK` failed with the deliberate assertion.
- Other five workflows: SUCCESS (`37316438953`, `37316438975`, `37316438951`, `37316439075`, `37316439187`).
- PR API: no conflicts (`mergeable: true`), but `mergeable_state: blocked`.

No failed-state merge request, force-push, direct main push, protection bypass or production database call was used.

## Positive test and release evidence

The deliberate assertion was removed by restoring `tests/ci-required-checks-sec04.cjs` directly to the original blob `6f659e9b113e7c44f304051088e046d9d3858a79`. The final state differs from the main baseline only in this report and `docs/SEC04_MAIN_PROTECTION.md`; no application, workflow, test, migration or ruleset-template changes remain.

The acceptance gate for this documentation-only PR is all six successful required workflows and an unblocked GitHub merge state. Final commit/run IDs, merge-state read-back and subsequent main/Pages evidence are recorded in PR #40's conversation after those observations. Only a squash merge of the verified final state is allowed, so the intentional failed-test commit is not added to main ancestry.

This verifies a failing-to-passing pre-merge barrier and checks that normal development remains possible. It does not claim a separate post-merge deployment gate or that every possible rule-violation operation was attempted. No production business data is modified by this verification. Frontend remains Build 100.
