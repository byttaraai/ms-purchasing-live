-- Build 58 final cutover: browser writes must use the server-authoritative v58 endpoint.
-- Applied live as migration 20260924162133.
revoke execute on function public.purchasing_workspace_sync_v47(jsonb) from public, anon, authenticated;

comment on function public.purchasing_workspace_sync_v47(jsonb) is
  'LEGACY public workspace sync. Retired from browser execution in Build 58; server-authoritative public entrypoint is purchasing_workspace_sync_v58(jsonb).';
