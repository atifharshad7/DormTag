-- Dorm repair coordination — Postgres schema
-- Design rules:
--   1. Nothing user-visible is stored as text. Codes + i18n lookup.
--   2. Appointments are append-only. History is the product.
--   3. Location is a 5-level tree so WGs and studios share one model.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ----------------------------------------------------------------
-- enums
-- ----------------------------------------------------------------

create type unit_kind as enum ('studio', 'wg');
create type room_kind as enum ('private', 'shared');

create type ticket_state as enum (
  'reported',
  'accepted',
  'slots_offered',
  'scheduled',
  'waiting_for_parts',
  'done',
  'cancelled'
);

create type appointment_status as enum (
  'booked',
  'completed',
  'cancelled_by_tenant',
  'cancelled_by_staff',
  'no_access'          -- nobody home; the failed-visit metric
);

create type actor_kind as enum ('tenant', 'staff', 'system');
create type locale_code as enum ('de', 'en');

-- ----------------------------------------------------------------
-- location tree: building > unit > room > object
-- ----------------------------------------------------------------

create table buildings (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- 'A', 'B', 'C'
  name        text not null
);

-- A unit is one studio OR one WG. Tenancies attach to rooms, not units.
create table units (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings on delete restrict,
  code        text not null,                 -- '312'
  floor       int  not null,
  kind        unit_kind not null,
  unique (building_id, code)
);

create table room_types (
  code        text primary key               -- 'BEDROOM','KITCHEN','BATHROOM','HALLWAY','LAUNDRY'
);

create table rooms (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references units on delete restrict,
  code          text not null,               -- 'Z2','KU','BA'
  room_type_code text not null references room_types,
  kind          room_kind not null,          -- drives visibility AND access consent
  unique (unit_id, code)
);

create table object_types (
  code        text primary key,              -- 'SINK','STOVE','LIGHT','FRIDGE','RADIATOR'
  icon        text not null                  -- icon name for the tile picker
);

-- Which objects the picker offers for a given room type.
create table room_type_objects (
  room_type_code   text references room_types,
  object_type_code text references object_types,
  sort_order       int not null default 0,
  primary key (room_type_code, object_type_code)
);

create table objects (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references rooms on delete restrict,
  object_type_code text not null references object_types,
  ordinal          int not null default 1,   -- 'Maschine 3'
  qr_slug          text not null unique,     -- what the sticker encodes
  riser            text,                     -- plumbing/electrical stack; the repeat-fault dimension
  installed_on     date,
  unique (room_id, object_type_code, ordinal)
);

-- ----------------------------------------------------------------
-- people
-- ----------------------------------------------------------------

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  locale      locale_code not null default 'de',
  activated_at timestamptz
);

create table staff (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  display_name text not null,
  locale      locale_code not null default 'de',
  is_operator boolean not null default false  -- dashboard access
);

create table tenancies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete restrict,
  room_id     uuid not null references rooms on delete restrict,
  starts_on   date not null,
  ends_on     date,
  exclude using gist (
    room_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[)') with &&
  )
);

-- ----------------------------------------------------------------
-- tickets
-- ----------------------------------------------------------------

create table cause_codes (
  code             text primary key,          -- 'SEAL','BLOCKAGE','RISER','USER_DAMAGE','WEAR'
  indicates_systemic boolean not null default false  -- RISER = escalate to operator
);

create table tickets (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references objects on delete restrict,
  state         ticket_state not null default 'reported',
  reported_at   timestamptz not null default now(),
  closed_at     timestamptz,

  -- Access: derived from room kind at creation, but overridable
  needs_access  boolean not null,
  access_consent boolean not null default false,   -- "enter without me"

  note          text,                              -- free text, whatever language
  note_locale   locale_code,

  reschedule_count int not null default 0,
  check (closed_at is null or state in ('done', 'cancelled'))
);

create index on tickets (state) where state not in ('done', 'cancelled');
create index on tickets (object_id, reported_at desc);

-- Multiple people can report the same object. Each gets their own capability link.
create table ticket_reporters (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets on delete cascade,
  tenant_id   uuid references tenants,           -- null = anonymous common-area report
  email       text,
  locale      locale_code not null default 'de',
  token       text not null unique,              -- bearer capability, scoped to this ticket
  token_expires_at timestamptz,
  is_primary  boolean not null default false,    -- whose room it is; only they can consent
  created_at  timestamptz not null default now(),
  unique (ticket_id, tenant_id)                  -- dedupe: one row per person per ticket
);

-- Open-ticket dedupe: at most one live ticket per object.
create unique index one_open_ticket_per_object
  on tickets (object_id)
  where state not in ('done', 'cancelled');

-- ----------------------------------------------------------------
-- scheduling
-- ----------------------------------------------------------------

create table slot_offers (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets on delete cascade,
  staff_id    uuid not null references staff,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  offered_at  timestamptz not null default now(),
  expires_at  timestamptz not null,              -- unpicked offers must rot, not linger
  check (ends_at > starts_at)
);

create index on slot_offers (ticket_id, starts_at);

-- Append-only. Never UPDATE the slot; insert a new row and cancel the old.
create table appointments (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets on delete cascade,
  slot_offer_id uuid not null references slot_offers,
  staff_id      uuid not null references staff,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        appointment_status not null default 'booked',
  booked_by     actor_kind not null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  check (ends_at > starts_at)
);

-- One live appointment per ticket.
create unique index one_active_appointment_per_ticket
  on appointments (ticket_id)
  where status = 'booked';

-- A slot can only be claimed once.
create unique index slot_claimed_once
  on appointments (slot_offer_id)
  where status = 'booked';

-- Staff cannot be double-booked across tickets.
alter table appointments add constraint staff_not_double_booked
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked');

-- ----------------------------------------------------------------
-- resolution + parts
-- ----------------------------------------------------------------

create table parts_orders (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets on delete cascade,
  description   text not null,
  ordered_on    date not null default current_date,
  supplier_eta  text,                    -- 'KW 13' — the supplier's claim, never ours
  arrived_on    date
);

create table resolutions (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets on delete cascade,
  cause_code    text not null references cause_codes,
  staff_id      uuid not null references staff,
  note          text,
  photo_url     text,
  resolved_at   timestamptz not null default now(),
  unique (ticket_id)
);

-- ----------------------------------------------------------------
-- audit log — every state transition, no exceptions
-- ----------------------------------------------------------------

create table ticket_events (
  id          bigserial primary key,
  ticket_id   uuid not null references tickets on delete cascade,
  from_state  ticket_state,
  to_state    ticket_state not null,
  actor_kind  actor_kind not null,
  actor_id    uuid,
  reason      text,                      -- 'tenant_reschedule','no_access','part_ordered'
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index on ticket_events (ticket_id, created_at);

-- ----------------------------------------------------------------
-- i18n — every displayed label resolves through here
-- ----------------------------------------------------------------

create table i18n_strings (
  key         text not null,             -- 'object_type.SINK', 'cause.RISER', 'room_type.KITCHEN'
  locale      locale_code not null,
  text        text not null,
  primary key (key, locale)
);

-- ----------------------------------------------------------------
-- views
-- ----------------------------------------------------------------

create view v_ticket_location as
select
  t.id            as ticket_id,
  t.state,
  t.reported_at,
  t.closed_at,
  b.id            as building_id,
  b.code          as building_code,
  u.id            as unit_id,
  u.code          as unit_code,
  u.floor,
  r.id            as room_id,
  r.code          as room_code,
  r.kind          as room_kind,
  r.room_type_code,
  o.id            as object_id,
  o.object_type_code,
  o.riser
from tickets t
join objects   o on o.id = t.object_id
join rooms     r on r.id = o.room_id
join units     u on u.id = r.unit_id
join buildings b on b.id = u.building_id;

-- Repeat faults: the dashboard's headline query.
create view v_repeat_faults as
select
  building_code,
  riser,
  object_type_code,
  count(*)                                   as ticket_count,
  count(distinct room_id)                    as rooms_affected,
  count(*) filter (where cc.indicates_systemic) as systemic_causes
from v_ticket_location vtl
left join resolutions  res on res.ticket_id = vtl.ticket_id
left join cause_codes  cc  on cc.code = res.cause_code
where vtl.reported_at > now() - interval '12 months'
group by building_code, riser, object_type_code
having count(*) >= 3
order by ticket_count desc;

-- Failed-visit rate: the argument for appointment booking.
create view v_failed_visit_rate as
select
  vtl.building_code,
  count(*)                                              as visits,
  count(*) filter (where a.status = 'no_access')         as failed,
  round(100.0 * count(*) filter (where a.status = 'no_access') / nullif(count(*), 0), 1) as pct_failed
from appointments a
join v_ticket_location vtl on vtl.ticket_id = a.ticket_id
where a.status in ('completed', 'no_access')
group by vtl.building_code;
