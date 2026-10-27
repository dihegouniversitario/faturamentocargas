
create type public.app_role as enum ('admin','remessa','faturamento');
create type public.load_status as enum ('pendente','em_faturamento','faturada','erro','saida');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_email text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  unit_id uuid references public.units(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.current_unit()
returns uuid language sql stable security definer set search_path = public as $$
  select unit_id from public.profiles where id = auth.uid() and active
$$;

create policy "units read" on public.units for select to authenticated
  using (id = public.current_unit() or public.has_role(auth.uid(),'admin'));
create policy "units admin write" on public.units for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or unit_id = public.current_unit() or public.has_role(auth.uid(),'admin'));
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "roles read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.loads (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  dt text not null unique,
  load_number text not null default '',
  load_date date not null,
  origin_center text not null default '',
  dest_center text not null default '',
  dest_name text not null default '',
  carrier text not null default '',
  plate text not null default '',
  itinerary text not null default '',
  notes text not null default '',
  raw_text text not null default '',
  status public.load_status not null default 'pendente',
  product_order text not null default '',
  pallet_order text not null default '',
  locked_by uuid,
  locked_by_name text,
  locked_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.loads (unit_id, load_date);
grant select, insert, update on public.loads to authenticated;
grant all on public.loads to service_role;
alter table public.loads enable row level security;

create policy "loads read" on public.loads for select to authenticated
  using (unit_id = public.current_unit());
create policy "loads insert remessa" on public.loads for insert to authenticated
  with check (unit_id = public.current_unit() and public.has_role(auth.uid(),'remessa'));
create policy "loads update faturamento" on public.loads for update to authenticated
  using (unit_id = public.current_unit() and public.has_role(auth.uid(),'faturamento'))
  with check (unit_id = public.current_unit());

create table public.load_items (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  position int not null default 0,
  sap_code text not null default '',
  description text not null default '',
  boxes numeric not null default 0,
  pallets numeric not null default 0,
  boxes_per_pallet numeric not null default 0,
  pallet_id text not null default ''
);
create index on public.load_items (load_id);
grant select, insert, update on public.load_items to authenticated;
grant all on public.load_items to service_role;
alter table public.load_items enable row level security;

create policy "items read" on public.load_items for select to authenticated
  using (exists (select 1 from public.loads l where l.id = load_id and l.unit_id = public.current_unit()));
create policy "items insert remessa" on public.load_items for insert to authenticated
  with check (public.has_role(auth.uid(),'remessa') and exists (select 1 from public.loads l where l.id = load_id and l.unit_id = public.current_unit()));
create policy "items update faturamento" on public.load_items for update to authenticated
  using (public.has_role(auth.uid(),'faturamento') and exists (select 1 from public.loads l where l.id = load_id and l.unit_id = public.current_unit()));

create table public.load_history (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  user_id uuid,
  user_name text not null default '',
  action text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);
create index on public.load_history (load_id, created_at);
grant select on public.load_history to authenticated;
grant all on public.load_history to service_role;
alter table public.load_history enable row level security;
create policy "history read" on public.load_history for select to authenticated
  using (exists (select 1 from public.loads l where l.id = load_id and l.unit_id = public.current_unit()));

-- helper: user name
create or replace function public.current_user_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name,''), email, 'sistema') from public.profiles where id = auth.uid()
$$;

-- before update: auto faturada + lock release
create or replace function public.loads_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status in ('pendente','em_faturamento')
     and btrim(new.product_order) <> '' and btrim(new.pallet_order) <> '' then
    new.status := 'faturada';
  end if;
  if new.status is distinct from old.status and new.status <> 'em_faturamento' then
    new.locked_by := null; new.locked_by_name := null; new.locked_at := null;
  end if;
  return new;
end $$;
create trigger loads_before_update before update on public.loads
  for each row execute function public.loads_before_update();

-- history logging
create or replace function public.loads_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text := coalesce(public.current_user_name(), 'sistema');
begin
  if tg_op = 'INSERT' then
    insert into public.load_history(load_id,user_id,user_name,action,details)
    values (new.id, auth.uid(), uname, 'Importada', 'DT ' || new.dt);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.load_history(load_id,user_id,user_name,action,details)
    values (new.id, auth.uid(), uname, 'Status alterado', old.status || ' → ' || new.status);
  end if;
  if new.product_order is distinct from old.product_order then
    insert into public.load_history(load_id,user_id,user_name,action,details)
    values (new.id, auth.uid(), uname, 'Ordem de produtos', coalesce(nullif(new.product_order,''),'(vazio)'));
  end if;
  if new.pallet_order is distinct from old.pallet_order then
    insert into public.load_history(load_id,user_id,user_name,action,details)
    values (new.id, auth.uid(), uname, 'Ordem de pallets', coalesce(nullif(new.pallet_order,''),'(vazio)'));
  end if;
  if new.locked_by is distinct from old.locked_by and new.locked_by is not null then
    insert into public.load_history(load_id,user_id,user_name,action,details)
    values (new.id, auth.uid(), uname, 'Carga aberta', '');
  end if;
  return new;
end $$;
create trigger loads_log after insert or update on public.loads
  for each row execute function public.loads_log();

create or replace function public.items_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pallets is distinct from old.pallets or new.pallet_id is distinct from old.pallet_id then
    insert into public.load_history(load_id,user_id,user_name,action,details)
    values (new.load_id, auth.uid(), coalesce(public.current_user_name(),'sistema'), 'Produto alterado',
      new.sap_code || ': ' || new.pallets || ' pallets' || case when new.pallet_id <> '' then ' (ID ' || new.pallet_id || ')' else '' end);
  end if;
  return new;
end $$;
create trigger items_log after update on public.load_items
  for each row execute function public.items_log();

-- new user: profile; first user = admin with default unit
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    select id into u from public.units order by created_at limit 1;
    if u is null then insert into public.units(name) values ('Unidade principal') returning id into u; end if;
    insert into public.profiles(id, full_name, email, unit_id)
      values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''), u);
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  else
    insert into public.profiles(id, full_name, email)
      values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''));
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter publication supabase_realtime add table public.loads;
alter publication supabase_realtime add table public.load_items;
