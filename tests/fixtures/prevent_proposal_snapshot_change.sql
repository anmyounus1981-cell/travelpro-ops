CREATE OR REPLACE FUNCTION public.prevent_proposal_snapshot_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.quotation_id is distinct from new.quotation_id
    or old.proposal_number is distinct from new.proposal_number
    or old.version_number is distinct from new.version_number
    or old.snapshot is distinct from new.snapshot
  then
    raise exception 'Proposal version snapshots are immutable';
  end if;

  return new;
end;
$function$
