-- FreezerManager: initial schema

create table freezers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table compartments (
  id uuid primary key default gen_random_uuid(),
  freezer_id uuid not null references freezers (id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_months int not null check (max_months > 0)
);

create table items (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  name text not null,
  details text,
  quantity text,
  category_id uuid not null references categories (id) on delete restrict,
  compartment_id uuid not null references compartments (id) on delete restrict,
  frozen_at date not null,
  created_at timestamptz not null default now()
);

-- Only signed-in users may read or write.
alter table freezers enable row level security;
alter table compartments enable row level security;
alter table categories enable row level security;
alter table items enable row level security;

create policy "authenticated full access" on freezers
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on compartments
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on categories
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on items
  for all to authenticated using (true) with check (true);

-- Live updates for the overview.
alter publication supabase_realtime add table items;

insert into categories (name, max_months) values
  ('Fleisch', 6),
  ('Geflügel', 6),
  ('Fisch', 4),
  ('Gemüse', 12),
  ('Obst', 12),
  ('Brot & Backwaren', 3),
  ('Fertiggerichte', 3),
  ('Suppen & Soßen', 4),
  ('Sonstiges', 6);
