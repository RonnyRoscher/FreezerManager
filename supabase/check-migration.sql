-- FreezerManager: Prüfung der Haushalts-Umstellung (nur lesend, ändert nichts).
-- Im Supabase SQL Editor jeweils einen Teil markieren und ausführen.

-- ===========================================================================
-- TEIL 1: Zeilenzahlen je Tabelle
-- Läuft VOR und NACH 0002. Vor und nach der Umstellung müssen die Zahlen
-- identisch sein (bzw. im Test-Projekt mit denen der Produktion übereinstimmen).
-- ===========================================================================

select 'freezers' as tabelle, count(*) as zeilen from public.freezers
union all select 'compartments', count(*) from public.compartments
union all select 'categories', count(*) from public.categories
union all select 'items', count(*) from public.items
order by tabelle;

-- ===========================================================================
-- TEIL 2: Haushalte (erst NACH 0002 ausführen; vorher gibt es household_id nicht)
-- ===========================================================================

-- 2a) Zeilen je Haushalt. Nach der Umstellung steht alles bei "Unser Haushalt".
select h.name as haushalt,
       (select count(*) from public.freezers f where f.household_id = h.id) as freezers,
       (select count(*) from public.compartments c where c.household_id = h.id) as compartments,
       (select count(*) from public.categories k where k.household_id = h.id) as categories,
       (select count(*) from public.items i where i.household_id = h.id) as items,
       (select count(*) from public.profiles p where p.household_id = h.id) as mitglieder
from public.households h
order by h.name;

-- 2b) Zeilen ohne Haushalt: jede Zeile muss 0 sein.
select 'freezers' as tabelle, count(*) as ohne_haushalt from public.freezers where household_id is null
union all select 'compartments', count(*) from public.compartments where household_id is null
union all select 'categories', count(*) from public.categories where household_id is null
union all select 'items', count(*) from public.items where household_id is null
union all select 'profiles', count(*) from public.profiles where household_id is null
order by tabelle;
