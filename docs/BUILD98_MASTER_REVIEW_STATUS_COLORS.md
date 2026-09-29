# Build 98 - Master Review status colors

Approved scope: presentation-only correction of misleading green status messages.

- Existing incomplete or changed-source rows use neutral gray.
- New products awaiting required unit/Factor input use amber.
- Existing Ready to save and confirmed Saved states use green. These states do not mean official task completion.
- Invalid numbers/unit rules retain red validation messages.
- An unconfirmed request in flight is neutral; a ready draft blocked by the existing 48-hour warning is amber, not success green.
- Confirmed saves remain distinguishable from unsaved rows when refresh is pending.

Implementation is one additive, popup-scoped stylesheet. Only color, background-color and border-color properties are allowed. No copy, sizes, positions, inputs, visibility or event handlers are changed. The active runtime remains the byte-identical task-assistant-v97.js. The only entrypoint edits are the Build 98 marker and the new stylesheet link.

No Supabase reads, writes, migrations or permissions changes are part of this repair. No task completion, badges, history, ranking, unit conversion, numeric bounds, score or purchase formulas are changed. SEC-03 legacy retirement remains OPEN (backup only); this change does not attempt deletion.

Verification: four Node contracts verify the exact Build 97 entrypoint after inverting only the two release edits, unchanged runtime/engines, scoped color-only CSS, and use of existing state markers. Historical tests retain their original assertions and baseline hashes via a strict test-only inverse helper. The browser suite checks 28 color/geometry/state scenarios and reuses 84 existing draft/freshness/unit scenarios against the active v97 runtime with the new stylesheet, at desktop and mobile sizes. All IO is synthetic and blocked from the network. CI results must be checked before release.

Rollback: revert this release's marker and stylesheet link (or this PR). No database rollback is required.
