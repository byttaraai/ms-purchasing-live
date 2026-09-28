-- DATA-01: validate against the existing PurchasingCore.number limit; no formulas changed.
-- New constraints reject unsupported source numbers; the guard rejects unrenderable results atomically.
create or replace function purchasing_private.assert_workspace_numbers_data01(p_dashboard jsonb)
returns void language plpgsql immutable set search_path to '' as $guard$
declare r jsonb; k text; cell jsonb;
begin
  for r in select value from jsonb_array_elements(p_dashboard->'rows') loop
    foreach k in array array['stock_qty','reorder_point','stock_ratio','min_order_qty','max_order_qty','factor','raw_quantity','purchase_price','total_value','raw_total_buy','raw_unit_price'] loop
      cell := r->k;
      if cell is not null and cell <> 'null'::jsonb then
        if jsonb_typeof(cell) <> 'number' then
          raise exception 'Unsupported numeric value for product %, field %. Nothing was saved.',r->>'product_code',k using errcode='22003';
        end if;
        if not ((cell #>> '{}')::numeric between -1000000000000 and 1000000000000) then
          raise exception 'Numeric limit exceeded for product %, field %. Nothing was saved.',r->>'product_code',k using errcode='22003';
        end if;
      end if;
    end loop;
  end loop;
end;
$guard$;
revoke all on function purchasing_private.assert_workspace_numbers_data01(jsonb) from public, anon, authenticated;

alter table public.products_master_v5 add constraint master_numeric_bounds_data01 check (
  factor between 0 and 1000000000000 and order_multiple between 0 and 1000000000000
  and (reorder_point is null or reorder_point between 0 and 1000000000000)
  and (purchase_price is null or purchase_price between 0 and 1000000000000)
);
-- Negative inventory is still allowed and remains a review issue, not silently corrected.
alter table public.inventory_lines_v5 add constraint inventory_quantity_bounds_data01
  check (raw_quantity between -1000000000000 and 1000000000000);
alter table public.inventory_lines_v5 add constraint inventory_total_bounds_data01
  check (nullif(raw_record->>'Total Buy Price','') is null or
    (raw_record->>'Total Buy Price')::numeric between -1000000000000 and 1000000000000);

-- Patch only two call sites. Abort the whole migration on source drift.
do $patch$
declare sig text; body text; expected text; needle text; insertion text;
begin
  foreach sig in array array[
    'public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)',
    'public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)'
  ] loop
    body := pg_get_functiondef(to_regprocedure(sig));
    if sig like '%save_master%' then
      expected := '06897369c893983bc22c012c6ea600d6';
      needle := E'  update public.purchasing_meta_v5\n  set master_revision=master_revision+1,';
    else
      expected := 'ee1c47552fbb2d007df09ba6d49abd89';
      needle := E'  return jsonb_build_object(\n    ''ok'',true,\n    ''upload_id'',p_request_id,';
    end if;
    if body is null or md5(body) <> expected then raise exception 'DATA-01 source drift: %',sig; end if;
    if (length(body)-length(replace(body,needle,'')))/length(needle) <> 1 then raise exception 'DATA-01 call site mismatch: %',sig; end if;
    insertion := E'  perform purchasing_private.assert_workspace_numbers_data01(public.purchasing_dashboard_v5_impl());\n\n';
    execute replace(body,needle,insertion||needle);
  end loop;
end;
$patch$;
