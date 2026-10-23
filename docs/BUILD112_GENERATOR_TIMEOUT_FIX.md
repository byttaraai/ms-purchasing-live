# Build 112 — Reorder Generator statement timeout fix

The Build 111 client reported "cancelling statement due to statement timeout" when verifying the 1,561-row annual and 1,223-row recent sales reports. The server v111 performed a nested scan of the entire annual JSON report inside its loop for every annual product while checking for duplicate Master product codes.

The v112 RPC is a clone of v111 except for the duplicate-code review guard. It materializes conflicting product codes from client product codes and valid saved name aliases ONCE per request, then checks membership in the loop. Duplicate mappings still produce the same review reason and are never auto-approved.

Business behavior is unchanged: annual 12-month sales below 20 Purchase Units or recent four-month sales below 20 Purchase Units produce ROP zero; exactly 20 stays eligible; the latest four-month all-products report must be explicitly confirmed complete and align to the same annual end date. All unit aliases, name matching, profitability calculation, 12-month period, Admin-only approval, revision guard and audit remain unchanged.

The public frontend calls v112 for both preview and approval, displays v112 and marks all counts local/unverified if server verification fails. Previous v111 remains available as rollback.

Database migration name: generator_v112_cache_name_duplicate_validation.
No Master data modified during deployment.
