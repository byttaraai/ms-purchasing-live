# Supabase source control

The live database is project `mpxpbbpqnvoinyjmuuvf`.

Rules for this repository:
- Every new schema/function/policy/index change must be applied as a Supabase migration and committed here with the same migration version/name.
- Never store a service-role key or database password in this repository.
- Public browser access must continue to use the publishable key plus RLS/guarded RPCs.
- Historical migrations created before Build 57 are recorded in `MIGRATION_HISTORY.md`; their SQL bodies are not reconstructed from memory.
- The current security hardening starts at migration `20260924154106_build57_workspace_security_and_validation.sql`.
