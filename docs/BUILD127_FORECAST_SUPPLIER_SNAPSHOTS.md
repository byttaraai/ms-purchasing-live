# Build 127 - Saved suppliers, refreshed on Generate

The existing Forecast sales rows remain the product and quantity source. Supplier is shown in a compact line below each original sales name; no columns move. Missing supplier displays `Supplier required` with a reason in product details. The supplier filter uses saved Forecast values and includes a Supplier required option. No source product or historical quantity is excluded because a supplier is missing.

The BO Assistant Master is read only during the initial migration-owned supplier copy and each explicit Generate. A unique case-insensitive, trimmed exact product-name match copies supplier and provenance into six new Forecast-only columns in `forecast_report_lines_v1`. No fuzzy guesses, alias merges, Master FK, second product database, or raw supplier overwrite. Unknown/ambiguous identities and blank source suppliers are recorded explicitly. A supplier removed from the source clears the current saved value on the next Generate; read failures do not masquerade as missing suppliers.

Generate now runs the supplier refresh stage only. It does not compute or approve a Forecast, apply Annual Growth, convert quantities, change prices, or change the Master/ROP. The Final Forecast remains Pending model. Page loads and Refresh only read saved values; they never synchronize suppliers from Master. Snapshot values persist in the database across accounts, browsers and reloads.

The server copy is a single atomic SQL statement, serialized with a transaction advisory lock. It stores the source revision, source code and copy time, and the authenticated actor for explicit runs. Initial backfill is migration-owned with no user attribution. The public write RPC is SECURITY INVOKER; its privileged implementation is in the private schema, checks an active admin/purchasing user, has an empty search_path and denies anonymous access. Clients send no supplier values or product codes to the write endpoint.

The UI prevents concurrent Generate requests and ignores responses after logout/account changes. Failed updates retain previously loaded supplier values with a visible retry message. Only supplier fields are applied to loaded products; all recorded quantities, original units, annual profit/ratings, historical trend formula and approval state remain untouched.

Validation includes exact inverse baselines, read-only production comparison against existing quantities/profits and supplier sources, and desktop/mobile interaction tests for source changes, persistence on reload, missing suppliers, supplier removal, newly populated suppliers, filter independence, failed update/retry and write-role guards. No real sales rows or supplier names are committed.

Rollback: revert the UI change; the additive supplier columns remain harmless. Existing nonempty legacy read requests and all earlier Forecast fields retain compatibility.
