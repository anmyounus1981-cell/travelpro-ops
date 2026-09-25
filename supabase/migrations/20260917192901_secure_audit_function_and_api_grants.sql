alter function public.prevent_audit_change() set search_path = '';

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table
  public.app_users,
  public.clients,
  public.travellers,
  public.cases,
  public.quotations,
  public.bookings,
  public.payments,
  public.tickets,
  public.service_cases,
  public.documents,
  public.reminders
to anon, authenticated;

grant select, insert on table public.audit_logs to anon, authenticated;
