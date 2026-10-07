-- Apply only after production Server Actions use approved RPCs.
-- Preserve authenticated reads under existing RLS policies.

revoke all privileges on table
  public.travellers,
  public.case_travellers,
  public.passport_extraction_drafts,
  public.documents,
  public.audit_logs
from public, anon, authenticated;

grant select on table
  public.travellers,
  public.case_travellers,
  public.passport_extraction_drafts,
  public.documents,
  public.audit_logs
to authenticated;

-- Legacy helpers remain callable internally by privileged RPCs.
-- Direct client execution is prohibited.

revoke all on function public.create_traveller_atomic(
  uuid, text, text, date, date, text, text
) from public, anon, authenticated;

revoke all on function public.create_traveller_atomic(
  uuid, text, text, text, date, date, text, text
) from public, anon, authenticated;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, date, date, text, jsonb
) from public, anon, authenticated;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, text, date, date, text, jsonb
) from public, anon, authenticated;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;