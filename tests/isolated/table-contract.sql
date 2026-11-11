select c.relname table_name,c.relrowsecurity rls,
(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) order by a.attname) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,
(select jsonb_agg(pg_get_constraintdef(k.oid) order by pg_get_constraintdef(k.oid)) from pg_constraint k where k.conrelid=c.oid) constraints,
(select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid) policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('app_users','clients','cases','quotations','bookings','reminders','reminder_rules','reminder_attempts','owner_alerts','payments','tickets','audit_logs') order by c.relname;
