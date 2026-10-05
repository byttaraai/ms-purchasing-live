# Build 101 - remove the stray header text and keep navigation visible

User-approved UI-only scope: replace the literal backslash-n between the Build92/93 stylesheet links with an actual newline, and keep the existing application header visible while scrolling.

The new scoped stylesheet uses sticky positioning (retains the existing header's space and responsive dimensions), with the header above the main BO table. The main BO table heading uses the existing ResizeObserver-maintained --topbar-height so it does not hide under the header. Dialog tables are not changed; print disables the new sticky behavior. No runtime JavaScript or Supabase operation, formula, task completion, badges, history, ranking or data change.

Tests include an exact reverse-patch hash of the complete verified Build100 index, CSS scope, malformed separator prevention, all existing required suites, and actual full-page synthetic browser checks at six desktop/tablet/phone/landscape sizes. They cover all four navigation tabs, dropdowns, the BO table heading, Master/Supplier dialogs, closing and print. All network IO is mocked or restricted to localhost. Existing SEC03/SEC04 contracts allow only this explicit UI patch and CI version/test command additions, preserving all prior protected behavior.

Rollback is a reviewed revert of this UI PR; no database rollback is needed. Main remains protected: all six checks must pass before merge. Release is not verified until main, CI and GitHub Pages evidence is recorded on the PR.
