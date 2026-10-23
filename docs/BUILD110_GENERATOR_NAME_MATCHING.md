# Build 110 — Product Name Matching

Generator Review now supports explicit Admin confirmation of a sales-report product name against an existing Master product code. The UI offers similarity-based suggestions and search by name/code, never automatic fuzzy matching.

The Admin RPC stores the report name as an approved alias bound to the selected Master code and current Master product name; its audit trail records prior mappings and who changed them. The Master product name itself does not change. The revision guard invalidates old previews when a new alias is approved.

The v110 preview and approval functions resolve only server-approved aliases. If two report rows map to the same Master code, both stay in review. Invalid or stale aliases remain unmatched. The v109 generator and unit-conversion behavior are preserved as rollback.

Name-alias decisions do not save Reorder Points or profitability. Product changes require an independent, server-verified Admin approval. New policy proposals for 6 months without sales and annual units fewer than 20 are deliberately not included in this build.
