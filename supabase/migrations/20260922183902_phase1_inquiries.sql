create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('web','email','whatsapp')),
  source_message_id text,
  client_type text not null default 'personal' check (client_type in ('corporate','personal')),
  corporate_client_name text,
  matched_client_id uuid references clients on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  raw_message text not null,
  parsed_fields jsonb not null default '{}'::jsonb,
  parsing_status text not null default 'pending' check (parsing_status in ('pending','parsed','needs_review','failed')),
  parser_source text,
  parser_confidence numeric check (parser_confidence between 0 and 1),
  channel_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','converted','dismissed')),
  converted_case_id uuid references cases on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists inquiries_source_message_id_unique on inquiries(source, source_message_id) where source_message_id is not null;
create index if not exists inquiries_status_created_at_idx on inquiries(status, created_at desc);
alter table inquiries enable row level security;
drop policy if exists demo_all on inquiries;
create policy demo_all on inquiries for all using (true) with check (true);
grant select, insert, update on inquiries to anon, authenticated;
comment on table inquiries is 'Raw multichannel intake. A human must confirm an inquiry before it becomes an operational case.';;
