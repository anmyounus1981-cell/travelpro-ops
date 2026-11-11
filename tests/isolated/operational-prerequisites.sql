-- Metadata only. No external upload, payment or GDS transaction.
insert into storage.objects(bucket_id,name,owner_id,metadata) values
('passports','drafts/isolated-fixture.png','00000000-0000-4000-8000-000000000002','{"mimetype":"image/png"}'),
('payment-evidence','df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png','00000000-0000-4000-8000-000000000002','{"mimetype":"image/png"}');
insert into bookings(id,case_id,pnr,pnr_source,quoted_amount,ttl,ttl_source,user_id)
select '00000000-0000-4000-8000-000000000003',id,'FXT001','gds',1,now()+interval '3 days','isolated fixture','00000000-0000-0000-0000-000000000001' from cases order by id limit 1;
insert into payments(id,booking_id,amount,evidence_file_path,user_id) values
('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003',1,'df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png','00000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select create_passport_review_draft('10000000-0000-0000-0000-000000000001','drafts/isolated-fixture.png');
select link_operational_document('payment','00000000-0000-4000-8000-000000000004');
reset role;
select set_config('request.jwt.claim.sub','',false);
