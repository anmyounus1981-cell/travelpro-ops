CREATE OR REPLACE FUNCTION public.prevent_audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin raise exception 'audit logs are append-only'; end $function$
