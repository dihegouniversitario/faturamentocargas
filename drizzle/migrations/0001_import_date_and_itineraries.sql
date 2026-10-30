ALTER TABLE public.loads ADD COLUMN import_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);
UPDATE public.loads SET import_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date;
CREATE INDEX loads_import_date_idx ON public.loads(unit_id, import_date);

CREATE TABLE public.itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  dest_center text NOT NULL,
  itinerary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, dest_center)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itineraries TO authenticated;
GRANT ALL ON public.itineraries TO service_role;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itineraries read" ON public.itineraries FOR SELECT TO authenticated USING (unit_id = public.current_unit() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "itineraries admin write" ON public.itineraries FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));