-- Build 96: new-product unit definitions only. Existing products cannot edit units here.
-- Does not change the shared conversion, save, score, priority or task engines.
DO $patch$
DECLARE
  body text;
  old_text text;
  new_text text;
BEGIN
  body := pg_get_functiondef('public.purchasing_master_review_save_v93(jsonb,integer,uuid)'::regprocedure);
  IF md5(body) <> 'd6365b6ca01e7a82194c60b1598fc8da' THEN RAISE EXCEPTION 'UNIT96 source drift'; END IF;
  body := replace(body,E'  pu text;\n',E'  pu text;\n  ou text;\n  unit_factor numeric;\n  source_unit text;\n');
  old_text := E'      existing := jsonb_build_object(\n';
  new_text := $new$      -- Explicit conversion metadata is required; do not guess a factor.
      ou := nullif(btrim(patch->>'option_unit'),'');
      unit_factor := nullif(btrim(patch->>'factor'),'')::numeric;
      IF ou IS NOT NULL AND unit_factor IS NULL THEN
        RAISE EXCEPTION 'Factor is required with Option Unit for %',code;
      END IF;
      unit_factor := coalesce(unit_factor,1);
      IF NOT (unit_factor > 0 AND unit_factor <= 1000000000000) THEN
        RAISE EXCEPTION 'Invalid unit factor for %',code;
      END IF;
      IF ou IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM (
            SELECT m.purchase_unit AS unit FROM public.products_master_v5 m
            UNION SELECT m.option_unit FROM public.products_master_v5 m
            UNION SELECT nullif(btrim(rowdata->>'raw_unit'),'')
          ) u WHERE lower(btrim(u.unit))=lower(ou)
        ) THEN RAISE EXCEPTION 'Option Unit must come from current units or this inventory product for %',code;
        END IF;
      ELSIF unit_factor <> 1 THEN
        RAISE EXCEPTION 'Option unit is required when factor is not 1 for %',code;
      END IF;
      IF ou IS NOT NULL AND public.purchasing_unit_key_v5(ou)=public.purchasing_unit_key_v5(pu) AND unit_factor <> 1 THEN
        RAISE EXCEPTION 'Identical units cannot have a conversion factor for %',code;
      END IF;
      source_unit := nullif(btrim(rowdata->>'raw_unit'),'');
      IF source_unit IS NOT NULL AND public.purchasing_unit_role_v5(source_unit,code,pu,ou,unit_factor) IS NULL THEN
        RAISE EXCEPTION 'Define inventory unit % as Purchase Unit or Option Unit for %',source_unit,code;
      END IF;
      existing := jsonb_build_object(
$new$;
  IF (length(body)-length(replace(body,old_text,'')))/length(old_text) <> 1 THEN RAISE EXCEPTION 'UNIT96 new-product block mismatch'; END IF;
  body := replace(body,old_text,new_text);
  body := replace(body,E'        ''option_unit'',null,\n        ''factor'',1,',E'        ''option_unit'',ou,\n        ''factor'',unit_factor,');
  old_text := E'      raise exception ''Purchase Unit cannot be changed from Master Review for existing product %'',code;\n';
  new_text := old_text || E'    elsif patch ? ''option_unit'' or patch ? ''factor'' then\n      raise exception ''Unit rules cannot be changed from Master Review for existing product %'',code;\n';
  body := replace(body,old_text,new_text);
  EXECUTE body;
END;
$patch$;
