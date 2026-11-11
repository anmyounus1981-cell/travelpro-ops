-- Local PostgreSQL platform contracts only. No hosted project is used.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
create schema auth; create schema storage; create schema extensions; create schema cron;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,owner_id text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant all on all tables in schema storage to authenticated,service_role;
-- Record schedule declarations without running background jobs in the test cluster.
create table cron.job(jobid bigint generated always as identity,jobname text,schedule text,command text,active boolean default false);
create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid $$;

-- Platform-owned event trigger is not attached in this local fixture.
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;
