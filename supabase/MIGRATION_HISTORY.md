# Supabase migration history

Live project: `mpxpbbpqnvoinyjmuuvf`

This manifest mirrors the migration history reported by the live project on 2026-09-24. Historical SQL before Build 57 was created before this repository tracked database source, so the names/versions are retained here but those old SQL bodies must not be invented. Build 57 onward must include the exact SQL file in `supabase/migrations/`.

| Version | Name |
| --- | --- |
| 20260921011623 | create_parallel_purchasing_v5 |
| 20260921011817 | seed_v5_from_existing_baseline |
| 20260921011940 | patch_corrected_master_1 |
| 20260921012023 | patch_corrected_master_2 |
| 20260921012043 | patch_corrected_master_3 |
| 20260921012101 | patch_corrected_master_4 |
| 20260921012117 | patch_corrected_master_5 |
| 20260921012135 | patch_corrected_master_6 |
| 20260921012446 | normalize_units_to_local_final |
| 20260921012508 | sync_local_reorder_1 |
| 20260921012512 | sync_local_reorder_2 |
| 20260921012526 | sync_local_reorder_3 |
| 20260921012531 | sync_local_reorder_4 |
| 20260921012657 | correct_xlsx_override_1 |
| 20260921012701 | correct_xlsx_override_2 |
| 20260921013106 | create_live_app_asset_store |
| 20260921014840 | match_local_unit_normalization_v5 |
| 20260921015110 | add_approved_unit_aliases_v5 |
| 20260921015319 | lock_down_live_v5_and_retire_old_preview |
| 20260921015926 | add_approved_unit_aliases_and_match_local_logic |
| 20260921082823 | cleanup_v5_security_and_indexes |
| 20260921102235 | fix_purchasing_dashboard_review_logic |
| 20260921105312 | fix_unit_normalization_v5 |
| 20260921111744 | add_purchasing_roles_and_admin_guard |
| 20260921111844 | allowlist_hassan_as_admin |
| 20260921112420 | fix_request_id_ambiguity_v5 |
| 20260921112603 | admin_direct_inventory_write_policies |
| 20260921112705 | fixed_inventory_save_rpc_invoker |
| 20260921112804 | route_inventory_save_to_fixed_rpc |
| 20260921150523 | add_live_tasks_assistant_v5 |
| 20260921151008 | harden_tasks_assistant_security_v5 |
| 20260921154046 | add_tasks_sync_compat_rpc_v5 |
| 20260922235657 | add_purchase_price_and_inventory_value_logic |
| 20260923041929 | add_logic_versioned_task_sync |
| 20260923100933 | unified_workspace_recalculation_v47 |
| 20260923101204 | workspace_v47_validation_fixes |
| 20260923101329 | workspace_v47_unambiguous_score_binding |
| 20260923163141 | unify_unit_aliases_and_nonblocking_data_attention |
| 20260923164554 | workspace_sync_use_blocking_review |
| 20260924154106 | build57_workspace_security_and_validation |
