-- Access control additions to schema.sql
-- Three principals, three mechanisms, one scoping rule set.

-- ----------------------------------------------------------------
-- staff sessions (Hausmeister + operator)
-- ----------------------------------------------------------------

create table staff_sessions (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff on delete cascade,
  token_hash    text not null unique,          -- store the hash, never the token
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz,
  user_agent    text,
  revoked_at    timestamptz
);

create index on staff_sessions (staff_id) where revoked_at is null;

create table magic_links (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  token_hash    text not null unique,
  purpose       text not null,                 -- 'staff_login' | 'tenant_activation'
  expires_at    timestamptz not null,
  consumed_at   timestamptz                    -- single use
);

-- Operator role needs a second factor. Keep it simple: TOTP.
alter table staff add column totp_secret text;
alter table staff add column totp_enabled_at timestamptz;

-- ----------------------------------------------------------------
-- which buildings a Hausmeister may see
-- ----------------------------------------------------------------

create table staff_buildings (
  staff_id     uuid references staff on delete cascade,
  building_id  uuid references buildings on delete cascade,
  primary key (staff_id, building_id)
);

-- ----------------------------------------------------------------
-- row-level security — belt and braces behind the application layer
-- ----------------------------------------------------------------

-- The app sets these per request, right after resolving the principal:
--   set local app.principal_kind = 'staff';
--   set local app.staff_id       = '...';
--   set local app.tenant_id      = '...';
--   set local app.ticket_id      = '...';   -- capability-token requests only

create or replace function app_staff_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.staff_id', true), '')::uuid
$$;

create or replace function app_tenant_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app_ticket_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.ticket_id', true), '')::uuid
$$;

alter table tickets enable row level security;

-- Operators see everything; a Hausmeister only their assigned buildings.
create policy tickets_staff on tickets for all to application_role
using (
  exists (
    select 1
    from staff s
    left join staff_buildings sb on sb.staff_id = s.id
    join v_ticket_location vtl on vtl.ticket_id = tickets.id
    where s.id = app_staff_id()
      and (s.is_operator or sb.building_id = vtl.building_id)
  )
);

-- A resident sees: their own private-room tickets, plus every shared-room
-- ticket in their unit. Never a flatmate's bedroom.
create policy tickets_tenant on tickets for select to application_role
using (
  exists (
    select 1
    from v_ticket_location vtl
    join rooms r    on r.id = vtl.room_id
    join tenancies tn on tn.tenant_id = app_tenant_id()
    join rooms mine on mine.id = tn.room_id
    where vtl.ticket_id = tickets.id
      and tn.ends_on is null
      and (
        (r.kind = 'private' and r.id = mine.id)
        or
        (r.kind = 'shared' and r.unit_id = mine.unit_id)
      )
  )
);

-- A capability token reaches exactly one ticket, nothing else.
create policy tickets_token on tickets for select to application_role
using (tickets.id = app_ticket_id());

-- Reporters' identities are never exposed to other reporters.
alter table ticket_reporters enable row level security;

create policy reporters_self on ticket_reporters for select to application_role
using (
  tenant_id = app_tenant_id()
  or exists (select 1 from staff where id = app_staff_id())
);
