-- PresupuestApp: schema, RLS y Storage.
--
-- Notas de diseño:
--  * Los ids los genera el cliente (crypto.randomUUID) para poder crear filas sin
--    conexión y referenciarlas antes de sincronizar. El default queda por si acaso.
--  * Las FK compuestas (x_id, professional_id) impiden que un usuario referencie
--    por id filas de otro profesional aunque adivine el uuid.
--  * Las columnas *_url de pdfs y fotos guardan el path dentro de un bucket privado,
--    no una URL pública: esos archivos tienen datos de clientes y se leen con URLs firmadas.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  cuit text,
  address text not null default '',
  zone text not null default '',
  logo_url text,
  brand_name text not null default '',
  primary_color text not null default '#C2410C'
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  footer_text text not null default '',
  onboarded_at timestamptz,
  last_budget_number integer not null default 0,
  created_at timestamptz not null default now()
);

-- professional_id null = oficio del catálogo; con valor = oficio personalizado.
create table public.oficios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  unit text not null default 'unidad',
  category text not null default 'Personalizados',
  professional_id uuid references public.professionals (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index oficios_catalog_name_key on public.oficios (name) where professional_id is null;
create unique index oficios_custom_name_key on public.oficios (professional_id, lower(name)) where professional_id is not null;

create table public.professional_oficios (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  oficio_id uuid not null references public.oficios (id) on delete cascade,
  primary key (professional_id, oficio_id)
);
create index professional_oficios_oficio_idx on public.professional_oficios (oficio_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text not null default '',
  address text not null default '',
  email text,
  created_at timestamptz not null default now(),
  unique (id, professional_id)
);
create index clients_professional_idx on public.clients (professional_id);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  client_id uuid not null,
  number integer not null,
  date date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected')),
  validity_days integer not null default 15 check (validity_days >= 0),
  advance_percent numeric(5, 2) not null default 0 check (advance_percent between 0 and 100),
  warranty_days integer not null default 0 check (warranty_days >= 0),
  payment_method text not null default '',
  notes text not null default '',
  subtotal_labor numeric(14, 2) not null default 0,
  subtotal_materials numeric(14, 2) not null default 0,
  iva_percent numeric(4, 2) not null default 21 check (iva_percent in (0, 10.5, 21)),
  iva_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  pdf_url text,
  created_at timestamptz not null default now(),
  unique (id, professional_id),
  unique (professional_id, number),
  -- restrict: un presupuesto histórico no puede quedar sin cliente.
  foreign key (client_id, professional_id) references public.clients (id, professional_id) on delete restrict
);
create index budgets_client_idx on public.budgets (client_id);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  type text not null check (type in ('labor', 'material')),
  description text not null default '',
  quantity numeric(12, 3) not null default 1,
  unit text not null default 'unidad',
  -- Precio de venta unitario. En materiales es cost_price + markup.
  unit_price numeric(14, 2) not null default 0,
  cost_price numeric(14, 2),
  markup_percent numeric(6, 2),
  total numeric(14, 2) not null default 0,
  position integer not null default 0
);
create index budget_items_budget_idx on public.budget_items (budget_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null unique,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'finished', 'paid')),
  start_date date,
  end_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (budget_id, professional_id) references public.budgets (id, professional_id) on delete restrict
);
create index jobs_professional_idx on public.jobs (professional_id);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  url text not null, -- path en el bucket job-photos
  created_at timestamptz not null default now()
);
create index job_photos_job_idx on public.job_photos (job_id);

-- Historial de PDFs generados (budgets.pdf_url apunta al último).
create table public.budget_pdfs (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  url text not null, -- path en el bucket pdfs
  file_name text not null,
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  foreign key (budget_id, professional_id) references public.budgets (id, professional_id) on delete cascade
);
create index budget_pdfs_budget_idx on public.budget_pdfs (budget_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Cada usuario nuevo arranca con su fila de profesional; el onboarding la completa.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.professionals (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Número auto-incremental por profesional. El UPDATE serializa inserts concurrentes.
-- Ojo: los BEFORE INSERT también corren en un upsert que termina en conflicto, así que
-- solo se asigna cuando llega null; el cliente reenvía el número al editar uno existente
-- para no quemar correlativos.
create function public.assign_budget_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number is null then
    update public.professionals
       set last_budget_number = last_budget_number + 1
     where id = new.professional_id
     returning last_budget_number into new.number;
  end if;
  return new;
end;
$$;

create trigger budgets_assign_number
  before insert on public.budgets
  for each row execute function public.assign_budget_number();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- security definer para no reevaluar RLS de professionals dentro de cada policy.
create function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.professionals where user_id = (select auth.uid())
$$;

alter table public.professionals enable row level security;
alter table public.oficios enable row level security;
alter table public.professional_oficios enable row level security;
alter table public.clients enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;
alter table public.jobs enable row level security;
alter table public.job_photos enable row level security;
alter table public.budget_pdfs enable row level security;

create policy "propio perfil" on public.professionals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ver catálogo y propios" on public.oficios
  for select to authenticated
  using (professional_id is null or professional_id = (select public.current_professional_id()));
create policy "alta de propios" on public.oficios
  for insert to authenticated
  with check (professional_id = (select public.current_professional_id()));
create policy "edición de propios" on public.oficios
  for update to authenticated
  using (professional_id = (select public.current_professional_id()))
  with check (professional_id = (select public.current_professional_id()));
create policy "baja de propios" on public.oficios
  for delete to authenticated
  using (professional_id = (select public.current_professional_id()));

create policy "propios" on public.professional_oficios
  for all to authenticated
  using (professional_id = (select public.current_professional_id()))
  with check (
    professional_id = (select public.current_professional_id())
    and exists (
      select 1 from public.oficios o
      where o.id = oficio_id
        and (o.professional_id is null or o.professional_id = (select public.current_professional_id()))
    )
  );

create policy "propios" on public.clients
  for all to authenticated
  using (professional_id = (select public.current_professional_id()))
  with check (professional_id = (select public.current_professional_id()));

create policy "propios" on public.budgets
  for all to authenticated
  using (professional_id = (select public.current_professional_id()))
  with check (professional_id = (select public.current_professional_id()));

create policy "de presupuestos propios" on public.budget_items
  for all to authenticated
  using (exists (
    select 1 from public.budgets b
    where b.id = budget_id and b.professional_id = (select public.current_professional_id())
  ))
  with check (exists (
    select 1 from public.budgets b
    where b.id = budget_id and b.professional_id = (select public.current_professional_id())
  ));

create policy "propios" on public.jobs
  for all to authenticated
  using (professional_id = (select public.current_professional_id()))
  with check (professional_id = (select public.current_professional_id()));

create policy "de trabajos propios" on public.job_photos
  for all to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and j.professional_id = (select public.current_professional_id())
  ))
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_id and j.professional_id = (select public.current_professional_id())
  ));

create policy "propios" on public.budget_pdfs
  for all to authenticated
  using (professional_id = (select public.current_professional_id()))
  with check (professional_id = (select public.current_professional_id()));

-- ---------------------------------------------------------------------------
-- Storage: cada usuario escribe solo bajo la carpeta {auth.uid()}/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg']),
  ('pdfs', 'pdfs', false, 10485760, array['application/pdf']),
  ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "archivos propios: leer" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('logos', 'pdfs', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "archivos propios: subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('logos', 'pdfs', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "archivos propios: reemplazar" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('logos', 'pdfs', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('logos', 'pdfs', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "archivos propios: borrar" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('logos', 'pdfs', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
