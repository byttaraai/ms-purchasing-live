# Build 100 / TASK02 - Profit Recovery upper-band eligibility

## Approved change
Super/High products with 120 <= stock ratio < 150 and a valid zero Min Order are now eligible for the existing 80-150 task. This extends eligibility only; it is not a new purchase quantity or target rule. The original positive-Min path remains, including the entire lower 10-80 band.

The task still uses Super-first then ascending stock-ratio ordering and at most ten products. At 150 percent a product is outside this candidate band. Existing source, exclusion and blocking-review checks remain. Missing price can coexist with this task and remains separately visible in Master Data Review.

## Preserved contracts
Min/Max, conversion rules, source data, score model, Risk, Supplier Priority, task identities, completion at 150 percent on verified later stock, deadline, all-target evidence checks, TASK01 price/rating exception, badge deduplication and history are unchanged. No task is completed by this deployment and no historical backfill is performed. Normal subsequent workspace synchronization may update open task targets under the new eligibility rule.

Runtime diff is exactly one frontend candidate predicate plus the Build marker, and one matching upper-band predicate in purchasing_private.workspace_validate_payload_v60. Every other frontend asset and database function is unchanged. The old index is reproduced by an exact test-only inverse; historical hash/assertions remain intact and the actual new runtime has dedicated behavioral tests.

## Verification
Preparation passed 8 full-runtime Node tests including 55 ratio/rating combinations, 87 isolated PostgreSQL assertions including real frontend payload validation, unchanged caller persistence, 149.999/150 completion boundary, replay and rollback/reapply, and 4 complete page/Open journeys at desktop/mobile sizes with and without missing price. The supporting database dependencies and browser server are synthetic; no production inventory or master write is used as a test. Original workspace and security/pop-up regressions also passed during preparation; final PR/main CI and Pages results are recorded in the release comment, not assumed here.

The migration was generated via CLI as 20261003135907 and applied once under API version 20261003140005; SQL bytes are identical. Published validator read-only boundary tests passed 55/55. The ten inspected master/inventory/task/history/evidence table fingerprints matched before/after application; revision remained 71 at these checks. Other function definitions and ACLs retained aggregate MD5 d80f2fe1825a25235d957b0b4e7a4cac. Validator hash changed from c887efef714a3578d53e8db967019440 to db61cc3224b79a4e2471d0e29f4857a2, ACL still postgres-only.

## Rollback
Restore the frontend predicate/marker first (old clients remain supported by the broader validator), then replace only the validator's exact new guard with its saved old guard after checking current definition hash and preserving ACL/owner. This reverse/forward cycle is tested in the isolated transaction. Never replay unrelated old migrations or erase task history. Any already-synchronized open targets are reconciled by the normal workspace flow; no manual task or badge deletion.

SEC-03 legacy table retirement remains OPEN (protected backup only). No legacy deletion, authentication-setting change or branch-protection change is included.
