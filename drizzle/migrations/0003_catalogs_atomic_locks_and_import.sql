CREATE TABLE public.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ijui_code text UNIQUE, femsa_code text NOT NULL UNIQUE, nota_item integer, short_name text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', boxes_per_pallet numeric, box_weight numeric, active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active));
CREATE POLICY "products admin" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.destinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid NOT NULL REFERENCES public.units(id), name text NOT NULL, sigla text NOT NULL, center text NOT NULL DEFAULT '', cnpj text NOT NULL DEFAULT '', sap_client_code text NOT NULL DEFAULT '', itinerary text NOT NULL DEFAULT '', pallet_type text NOT NULL DEFAULT 'VENDA', pallet_code text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', UNIQUE(unit_id,sigla)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destinations TO authenticated;
GRANT ALL ON public.destinations TO service_role;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "destinations read" ON public.destinations FOR SELECT TO authenticated USING (unit_id=public.current_unit() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "destinations admin" ON public.destinations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.carriers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, sap_code text);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carriers TO authenticated;
GRANT ALL ON public.carriers TO service_role;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carriers read" ON public.carriers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active));
CREATE POLICY "carriers admin" ON public.carriers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
ALTER TABLE public.loads ADD COLUMN destination_id uuid REFERENCES public.destinations(id), ADD COLUMN carrier_id uuid REFERENCES public.carriers(id), ADD COLUMN driver text NOT NULL DEFAULT '', ADD COLUMN supplier_doc_1 text NOT NULL DEFAULT '', ADD COLUMN supplier_doc_2 text NOT NULL DEFAULT '';
ALTER TABLE public.load_items ADD COLUMN product_id uuid REFERENCES public.products(id);
CREATE INDEX loads_plate_idx ON public.loads(plate);
CREATE INDEX loads_import_page_idx ON public.loads(unit_id,import_date DESC,created_at,id);
CREATE TABLE public.load_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), load_id uuid NOT NULL REFERENCES public.loads(id), user_id uuid, user_name text NOT NULL DEFAULT '', from_status public.load_status, to_status public.load_status NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.load_events TO authenticated;
GRANT ALL ON public.load_events TO service_role;
ALTER TABLE public.load_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events read" ON public.load_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.loads l WHERE l.id=load_id AND l.unit_id=public.current_unit()));
CREATE OR REPLACE FUNCTION public.normalize_catalog(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT lower(translate(btrim(value),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')) $$;
CREATE OR REPLACE FUNCTION public.validate_catalog() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='products' THEN
  IF NEW.femsa_code='' OR (NEW.boxes_per_pallet IS NOT NULL AND NEW.boxes_per_pallet<=0) OR (NEW.box_weight IS NOT NULL AND NEW.box_weight<0) THEN RAISE EXCEPTION 'Código FEMSA e quantidades inválidos'; END IF;
 ELSE
  IF NEW.pallet_type NOT IN ('VENDA','EMPRESTIMO') OR btrim(NEW.sigla)='' THEN RAISE EXCEPTION 'Destino inválido'; END IF;
  NEW.sigla:=upper(btrim(NEW.sigla));
 END IF; RETURN NEW; END $$;
CREATE TRIGGER products_validate BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_catalog();
CREATE TRIGGER destinations_validate BEFORE INSERT OR UPDATE ON public.destinations FOR EACH ROW EXECUTE FUNCTION public.validate_catalog();
CREATE OR REPLACE FUNCTION public.loads_before_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 NEW.updated_at:=now();
 IF (NEW.product_order IS DISTINCT FROM OLD.product_order OR NEW.pallet_order IS DISTINCT FROM OLD.pallet_order) AND NEW.status IN ('pendente','em_faturamento','faturando') AND btrim(NEW.product_order)<>'' AND btrim(NEW.pallet_order)<>'' THEN NEW.status:='faturada'; END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.guard_load_write() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF NEW.unit_id IS DISTINCT FROM public.current_unit() THEN RAISE EXCEPTION 'Unidade não permitida'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.unit_id IS DISTINCT FROM OLD.unit_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.import_date IS DISTINCT FROM OLD.import_date THEN RAISE EXCEPTION 'Identificação da importação protegida'; END IF;
  IF coalesce(current_setting('app.load_rpc',true),'')='yes' THEN RETURN NEW; END IF;
  IF NEW.locked_by IS DISTINCT FROM OLD.locked_by OR NEW.locked_at IS DISTINCT FROM OLD.locked_at OR NEW.locked_by_name IS DISTINCT FROM OLD.locked_by_name OR NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Use a ação de reservar/liberar carga'; END IF;
  IF public.has_role(auth.uid(),'faturamento') THEN
   IF OLD.locked_by IS DISTINCT FROM auth.uid() OR OLD.locked_at IS NULL OR OLD.locked_at<=now()-interval '15 minutes' THEN RAISE EXCEPTION 'Reserve a carga antes de editar'; END IF;
   IF NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.dest_center IS DISTINCT FROM OLD.dest_center OR NEW.dest_name IS DISTINCT FROM OLD.dest_name OR NEW.itinerary IS DISTINCT FROM OLD.itinerary OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.load_date IS DISTINCT FROM OLD.load_date OR NEW.load_number IS DISTINCT FROM OLD.load_number THEN RAISE EXCEPTION 'Dados da Remessa protegidos'; END IF;
  ELSIF public.has_role(auth.uid(),'remessa') THEN
   IF OLD.status<>'pendente' OR OLD.locked_by IS NOT NULL OR NEW.product_order IS DISTINCT FROM OLD.product_order OR NEW.pallet_order IS DISTINCT FROM OLD.pallet_order THEN RAISE EXCEPTION 'Remessa só edita cargas pendentes'; END IF;
  ELSE RAISE EXCEPTION 'Sem permissão'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER a_guard_load_write BEFORE INSERT OR UPDATE ON public.loads FOR EACH ROW EXECUTE FUNCTION public.guard_load_write();
CREATE POLICY "loads update remessa" ON public.loads FOR UPDATE TO authenticated USING(unit_id=public.current_unit() AND status='pendente' AND public.has_role(auth.uid(),'remessa')) WITH CHECK(unit_id=public.current_unit());
CREATE OR REPLACE FUNCTION public.guard_item_write() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE l public.loads; p public.products; BEGIN
 IF TG_OP='DELETE' THEN SELECT * INTO l FROM public.loads WHERE id=OLD.load_id FOR UPDATE; ELSE SELECT * INTO l FROM public.loads WHERE id=NEW.load_id FOR UPDATE; END IF;
 IF auth.uid() IS NOT NULL THEN
  IF l.unit_id IS DISTINCT FROM public.current_unit() THEN RAISE EXCEPTION 'Unidade não permitida'; END IF;
  IF coalesce(current_setting('app.load_rpc',true),'')<>'yes' THEN
   IF public.has_role(auth.uid(),'faturamento') THEN IF l.locked_by IS DISTINCT FROM auth.uid() OR l.locked_at<=now()-interval '15 minutes' THEN RAISE EXCEPTION 'Reserve a carga antes de editar'; END IF;
   ELSIF public.has_role(auth.uid(),'remessa') THEN IF l.status<>'pendente' OR l.locked_by IS NOT NULL THEN RAISE EXCEPTION 'Carga não está pendente'; END IF;
   ELSE RAISE EXCEPTION 'Sem permissão'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND NEW.load_id IS DISTINCT FROM OLD.load_id THEN RAISE EXCEPTION 'Carga do produto protegida'; END IF;
 IF NEW.pallets<0 OR NEW.boxes<0 THEN RAISE EXCEPTION 'Quantidades negativas'; END IF;
 IF NEW.product_id IS NOT NULL THEN
  SELECT * INTO p FROM public.products WHERE id=NEW.product_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto inativo ou desconhecido'; END IF;
  NEW.sap_code:=p.femsa_code; NEW.description:=p.description; NEW.boxes_per_pallet:=coalesce(p.boxes_per_pallet,NEW.boxes_per_pallet);
  IF NEW.boxes_per_pallet>0 THEN NEW.boxes:=NEW.pallets*NEW.boxes_per_pallet; END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER a_guard_item_write BEFORE INSERT OR UPDATE OR DELETE ON public.load_items FOR EACH ROW EXECUTE FUNCTION public.guard_item_write();
CREATE OR REPLACE FUNCTION public.record_load_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO public.load_events(load_id,user_id,user_name,to_status) VALUES(NEW.id,auth.uid(),coalesce(public.current_user_name(),'sistema'),NEW.status);
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN INSERT INTO public.load_events(load_id,user_id,user_name,from_status,to_status) VALUES(NEW.id,auth.uid(),coalesce(public.current_user_name(),'sistema'),OLD.status,NEW.status); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER record_load_event AFTER INSERT OR UPDATE ON public.loads FOR EACH ROW EXECUTE FUNCTION public.record_load_event();
CREATE OR REPLACE FUNCTION public.claim_load(load_id uuid) RETURNS public.loads LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.loads; BEGIN
 IF NOT public.has_role(auth.uid(),'faturamento') THEN RAISE EXCEPTION 'Apenas Faturamento'; END IF;
 SELECT * INTO l FROM public.loads WHERE id=load_id AND unit_id=public.current_unit() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Carga não encontrada'; END IF;
 IF l.status IN ('saida','finalizada') THEN RAISE EXCEPTION 'Carga finalizada'; END IF;
 IF l.locked_by IS NOT NULL AND l.locked_by<>auth.uid() AND l.locked_at>now()-interval '15 minutes' THEN RAISE EXCEPTION 'em edição por %',coalesce(l.locked_by_name,'outro usuário'); END IF;
 PERFORM set_config('app.load_rpc','yes',true);
 UPDATE public.loads SET locked_by=auth.uid(),locked_by_name=public.current_user_name(),locked_at=now(),status='faturando' WHERE id=l.id RETURNING * INTO l;
 RETURN l; END $$;
REVOKE ALL ON FUNCTION public.claim_load(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_load(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.release_load(load_id uuid,new_status public.load_status) RETURNS public.loads LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.loads; BEGIN
 SELECT * INTO l FROM public.loads WHERE id=load_id AND unit_id=public.current_unit() FOR UPDATE;
 IF NOT FOUND OR NOT public.has_role(auth.uid(),'faturamento') OR l.locked_by IS DISTINCT FROM auth.uid() OR l.locked_at<=now()-interval '15 minutes' THEN RAISE EXCEPTION 'Somente quem reservou pode liberar'; END IF;
 IF new_status NOT IN ('pendente','faturada','em_corte','impressa_ag_cte','finalizada') THEN RAISE EXCEPTION 'Status inválido'; END IF;
 IF new_status IN ('faturada','impressa_ag_cte','finalizada') AND (btrim(l.product_order)='' OR btrim(l.pallet_order)='') THEN RAISE EXCEPTION 'Preencha as duas ordens'; END IF;
 PERFORM set_config('app.load_rpc','yes',true);
 UPDATE public.loads SET status=new_status,locked_by=NULL,locked_by_name=NULL,locked_at=NULL WHERE id=l.id RETURNING * INTO l;
 RETURN l; END $$;
REVOKE ALL ON FUNCTION public.release_load(uuid,public.load_status) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_load(uuid,public.load_status) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_billing_load(load_id uuid,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.loads; it jsonb; BEGIN
 SELECT * INTO l FROM public.loads WHERE id=load_id AND unit_id=public.current_unit() FOR UPDATE;
 IF NOT FOUND OR NOT public.has_role(auth.uid(),'faturamento') OR l.locked_by IS DISTINCT FROM auth.uid() OR l.locked_at<=now()-interval '15 minutes' THEN RAISE EXCEPTION 'Reserva expirada ou de outro usuário'; END IF;
 IF jsonb_array_length(payload->'items')=0 THEN RAISE EXCEPTION 'Inclua produtos'; END IF;
 PERFORM set_config('app.load_rpc','yes',true);
 UPDATE public.loads SET product_order=btrim(payload->>'product_order'),pallet_order=btrim(payload->>'pallet_order'),plate=upper(btrim(payload->>'plate')),dt=btrim(payload->>'dt'),carrier_id=(payload->>'carrier_id')::uuid,carrier=(SELECT name FROM public.carriers WHERE id=(payload->>'carrier_id')::uuid),locked_at=now() WHERE id=l.id;
 DELETE FROM public.load_items WHERE public.load_items.load_id=l.id;
 FOR it IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
  IF (it->>'product_id') IS NULL THEN RAISE EXCEPTION 'Selecione todos os produtos'; END IF;
  INSERT INTO public.load_items(load_id,position,product_id,pallets,boxes,boxes_per_pallet) VALUES(l.id,coalesce((it->>'position')::integer,0),(it->>'product_id')::uuid,(it->>'pallets')::numeric,coalesce((it->>'boxes')::numeric,0),coalesce((it->>'boxes_per_pallet')::numeric,0));
 END LOOP;
 INSERT INTO public.load_history(load_id,user_id,user_name,action,details) VALUES(l.id,auth.uid(),public.current_user_name(),'Produtos atualizados','Edição de faturamento');
 END $$;
REVOKE ALL ON FUNCTION public.save_billing_load(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_billing_load(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_programming(payload jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE row jsonb; it jsonb; l public.loads; d public.destinations; c public.carriers; p public.products; n integer:=0; BEGIN
 IF NOT public.has_role(auth.uid(),'remessa') OR public.current_unit() IS NULL THEN RAISE EXCEPTION 'Apenas Remessa ativa'; END IF;
 IF jsonb_array_length(payload)=0 OR jsonb_array_length(payload)>500 THEN RAISE EXCEPTION 'Importe de 1 a 500 cargas'; END IF;
 PERFORM set_config('app.load_rpc','yes',true);
 FOR row IN SELECT value FROM jsonb_array_elements(payload) LOOP
  SELECT * INTO d FROM public.destinations WHERE unit_id=public.current_unit() AND upper(sigla)=upper(row->>'dest_center');
  IF NOT FOUND THEN RAISE EXCEPTION 'Destino desconhecido: %',row->>'dest_center'; END IF;
  SELECT * INTO c FROM public.carriers WHERE public.normalize_catalog(name)=public.normalize_catalog(row->>'carrier');
  IF NOT FOUND THEN RAISE EXCEPTION 'Transportadora desconhecida: %',row->>'carrier'; END IF;
  IF coalesce(row->>'dt','')='' THEN RAISE EXCEPTION 'Informe DT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(row->>'dt',0));
  SELECT * INTO l FROM public.loads WHERE dt=row->>'dt' FOR UPDATE;
  IF FOUND THEN
   IF l.unit_id<>public.current_unit() OR l.status<>'pendente' OR l.locked_by IS NOT NULL THEN RAISE EXCEPTION 'DT % não pode ser alterado pela Remessa',row->>'dt'; END IF;
   UPDATE public.loads SET load_date=(row->>'load_date')::date,load_number=row->>'load_number',destination_id=d.id,dest_center=d.center,dest_name=d.name,itinerary=d.itinerary,carrier_id=c.id,carrier=c.name,plate=upper(row->>'plate'),origin_center=row->>'origin_center',notes=coalesce(row->>'notes',''),raw_text=coalesce(row->>'raw_text','') WHERE id=l.id;
   DELETE FROM public.load_items WHERE load_id=l.id;
  ELSE
   INSERT INTO public.loads(unit_id,dt,load_date,load_number,destination_id,dest_center,dest_name,itinerary,carrier_id,carrier,plate,origin_center,notes,raw_text) VALUES(public.current_unit(),row->>'dt',(row->>'load_date')::date,row->>'load_number',d.id,d.center,d.name,d.itinerary,c.id,c.name,upper(row->>'plate'),row->>'origin_center',coalesce(row->>'notes',''),coalesce(row->>'raw_text','')) RETURNING * INTO l;
  END IF;
  IF jsonb_array_length(row->'items')=0 THEN RAISE EXCEPTION 'Inclua produtos'; END IF;
  FOR it IN SELECT value FROM jsonb_array_elements(row->'items') LOOP
   SELECT * INTO p FROM public.products WHERE ijui_code=it->>'sap_code' AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'Produto desconhecido: %',it->>'sap_code'; END IF;
   INSERT INTO public.load_items(load_id,product_id,position,pallets,boxes,boxes_per_pallet) VALUES(l.id,p.id,coalesce((it->>'position')::integer,0),(it->>'pallets')::numeric,(it->>'boxes')::numeric,coalesce(p.boxes_per_pallet,CASE WHEN (it->>'pallets')::numeric>0 THEN (it->>'boxes')::numeric/(it->>'pallets')::numeric ELSE 0 END));
  END LOOP; n:=n+1;
 END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.import_programming(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_programming(jsonb) TO authenticated;
COMMENT ON TABLE public.itineraries IS 'DEPRECATED: destination catalog is now authoritative; existing itinerary rows remain for legacy loads';
COMMENT ON COLUMN public.load_items.sap_code IS 'FEMSA SAP code snapshot; original Ijui code is products.ijui_code';