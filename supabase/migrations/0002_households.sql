-- FreezerManager: multiple households
--
-- Runs once, as a single transaction, on a database that already holds data and users.
-- Every existing row and every existing account is assigned to the household
-- "Unser Haushalt". Nothing is deleted. The old app keeps working: triggers fill in
-- household_id for rows it inserts without one.

begin;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  household_id uuid references public.households (id) on delete restrict,
  active_household_id uuid references public.households (id) on delete set null,
  is_admin boolean not null default false
);

create index profiles_household_id_idx on public.profiles (household_id);
create index profiles_active_household_id_idx on public.profiles (active_household_id);

-- Locked down until the access policies are added further below; no policy = no access
-- for anon/authenticated (security definer functions still work).
alter table public.households enable row level security;
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- household_id on existing tables (nullable first, backfilled, then not null)
-- ---------------------------------------------------------------------------

alter table public.freezers
  add column household_id uuid references public.households (id) on delete restrict;
alter table public.compartments
  add column household_id uuid references public.households (id) on delete restrict;
alter table public.categories
  add column household_id uuid references public.households (id) on delete restrict;
alter table public.items
  add column household_id uuid references public.households (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Takeover of existing data and accounts
-- ---------------------------------------------------------------------------

-- households was created above in this transaction, so this is its only row.
insert into public.households (name) values ('Unser Haushalt');

update public.freezers set household_id = (select id from public.households);
update public.compartments set household_id = (select id from public.households);
update public.categories set household_id = (select id from public.households);
update public.items set household_id = (select id from public.households);

alter table public.freezers alter column household_id set not null;
alter table public.compartments alter column household_id set not null;
alter table public.categories alter column household_id set not null;
alter table public.items alter column household_id set not null;

create index freezers_household_id_idx on public.freezers (household_id);
create index compartments_household_id_idx on public.compartments (household_id);
create index categories_household_id_idx on public.categories (household_id);
create index items_household_id_idx on public.items (household_id);

insert into public.profiles (user_id, email, household_id)
  select u.id, u.email, (select id from public.households)
  from auth.users u
  on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Profile for every new account
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Current household of the signed-in user
-- ---------------------------------------------------------------------------

-- Admins: the household they currently look at (active), falling back to their own.
-- Everyone else: their own household. No profile / no household: null.
create function public.current_household() returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case when p.is_admin then coalesce(p.active_household_id, p.household_id)
              else p.household_id end
  from public.profiles p
  where p.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Household assignment of new and changed rows
-- ---------------------------------------------------------------------------
-- security definer so that the lookups of parent rows do not depend on what the
-- caller may read; whether the caller may write the resulting row is decided by RLS.

-- freezers, categories: explicit value, else (on update) the previous one, else the
-- caller's current household.
create function public.assign_household_from_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.household_id is null and tg_op = 'UPDATE' then
    new.household_id := old.household_id;
  end if;
  if new.household_id is null then
    new.household_id := public.current_household();
  end if;
  if new.household_id is null then
    raise exception 'Kein Haushalt zugeordnet';
  end if;
  return new;
end;
$$;

-- compartments: always the household of the freezer.
create function public.assign_compartment_household() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  select f.household_id into new.household_id
    from public.freezers f where f.id = new.freezer_id;
  -- Unknown freezer: leave household_id null; the foreign key / not null constraint
  -- reports the problem.
  return new;
end;
$$;

-- items: always the household of the compartment; the category must belong to it.
create function public.assign_item_household() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  category_household uuid;
begin
  select c.household_id into new.household_id
    from public.compartments c where c.id = new.compartment_id;
  select c.household_id into category_household
    from public.categories c where c.id = new.category_id;
  if new.household_id is not null and category_household is not null
     and category_household <> new.household_id then
    raise exception 'Kategorie gehört zu einem anderen Haushalt';
  end if;
  return new;
end;
$$;

create trigger assign_household
  before insert or update on public.freezers
  for each row execute function public.assign_household_from_user();

create trigger assign_household
  before insert or update on public.categories
  for each row execute function public.assign_household_from_user();

create trigger assign_household
  before insert or update of freezer_id, household_id on public.compartments
  for each row execute function public.assign_compartment_household();

create trigger assign_household
  before insert or update of compartment_id, category_id, household_id on public.items
  for each row execute function public.assign_item_household();

-- Trigger functions are only meant to run as triggers.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.assign_household_from_user() from public, anon, authenticated;
revoke execute on function public.assign_compartment_household() from public, anon, authenticated;
revoke execute on function public.assign_item_household() from public, anon, authenticated;

commit;
