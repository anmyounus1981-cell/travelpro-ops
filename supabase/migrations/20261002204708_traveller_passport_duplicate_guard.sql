-- Prevent duplicate non-empty passport numbers within one client.
-- Existing records are preserved.
-- Different clients may hold records for the same passport.

create unique index travellers_client_passport_unique
on public.travellers (
  client_id,
  upper(btrim(passport_number))
)
where nullif(btrim(passport_number), '') is not null;