-- Internal trigger functions are not client RPC entry points.
-- Preserve their bodies and existing trigger bindings.

alter function public.prevent_reminder_attempt_change()
  set search_path = '';

revoke all on function public.prevent_reminder_attempt_change()
  from public, anon, authenticated;

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated;