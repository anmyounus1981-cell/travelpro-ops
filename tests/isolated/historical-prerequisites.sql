-- Synthetic fixtures for historical data-specific assertions. No production rows copied.
insert into clients(id,company_name,contact_name,client_type)
select id::uuid,'Premier Group','SYNTHETIC FIXTURE','corporate' from unnest(array[
'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694','7f9ea86e-13b1-4a23-8e28-970f8a741af2','16c950ac-895c-4bde-9534-3f69f7acdd59','f528c626-f42b-42f9-b280-8b81cd6309c3']) id;
insert into travellers(id,client_id,full_name,passport_number)
values
('5a94e419-4605-4a00-96a8-55186a2c80ad','dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694','SYNTHETIC ONE','ISOLATED01'),
('a00744d8-88e6-4a65-b178-34da7f3b887e','7f9ea86e-13b1-4a23-8e28-970f8a741af2','SYNTHETIC TWO','ISOLATED02'),
('c5ab4bd8-3e11-4fd6-a57d-ee72caac8dca','16c950ac-895c-4bde-9534-3f69f7acdd59','SYNTHETIC THREE','ISOLATED03'),
('6249d5b9-a5ab-4ddb-8cf2-bab22b8278a9','f528c626-f42b-42f9-b280-8b81cd6309c3','SYNTHETIC FOUR','A06986048');
