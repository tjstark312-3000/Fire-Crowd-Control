-- Supabase bootstrap for SFD Crowd Ops
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Role scaffold (admin/viewer) for auth users.
do $$
begin
  create type public.app_role as enum ('admin', 'viewer');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
as $$
  select coalesce((
    select role from public.profiles where id = auth.uid()
  ), 'viewer'::public.app_role);
$$;

create table if not exists public.cameras (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  stream_url text not null,
  enabled boolean not null default true,
  target_fps integer not null default 2 check (target_fps between 1 and 5),
  alert_threshold integer not null default 120 check (alert_threshold >= 1),
  status text not null default 'offline',
  last_latency_ms double precision,
  last_processed_fps double precision,
  last_crowd_count double precision,
  last_update_ts timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_latest (
  camera_id uuid primary key references public.cameras (id) on delete cascade,
  ts timestamptz,
  status text not null,
  processed_fps double precision not null default 0,
  latency_ms double precision not null default 0,
  crowd_count double precision not null default 0,
  density_overlay_png_base64 text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras (id) on delete cascade,
  ts timestamptz not null,
  type text not null,
  severity text not null,
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_camera_ts on public.alerts (camera_id, ts desc);
create index if not exists idx_alerts_resolved_ts on public.alerts (resolved, ts desc);
create index if not exists idx_cameras_created_at on public.cameras (created_at desc);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cameras_updated_at on public.cameras;
create trigger trg_cameras_updated_at
before update on public.cameras
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_analytics_latest_updated_at on public.analytics_latest;
create trigger trg_analytics_latest_updated_at
before update on public.analytics_latest
for each row execute function public.set_row_updated_at();

alter table public.profiles enable row level security;
alter table public.cameras enable row level security;
alter table public.analytics_latest enable row level security;
alter table public.alerts enable row level security;

-- Read access is public (anonymous + authenticated) so dashboards can load
-- without mandatory login. Writes remain admin-only.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles for select
using (auth.uid() = id);

drop policy if exists cameras_read_authenticated on public.cameras;
drop policy if exists cameras_read_public on public.cameras;
create policy cameras_read_public
on public.cameras for select
using (true);

drop policy if exists analytics_read_authenticated on public.analytics_latest;
drop policy if exists analytics_read_public on public.analytics_latest;
create policy analytics_read_public
on public.analytics_latest for select
using (true);

drop policy if exists alerts_read_authenticated on public.alerts;
drop policy if exists alerts_read_public on public.alerts;
create policy alerts_read_public
on public.alerts for select
using (true);

-- Admin-only write policies.
drop policy if exists cameras_admin_write on public.cameras;
create policy cameras_admin_write
on public.cameras for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists analytics_admin_write on public.analytics_latest;
create policy analytics_admin_write
on public.analytics_latest for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists alerts_admin_write on public.alerts;
create policy alerts_admin_write
on public.alerts for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Enable realtime stream for latest analytics + alerts.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'analytics_latest'
  ) then
    alter publication supabase_realtime add table public.analytics_latest;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;
end
$$;
