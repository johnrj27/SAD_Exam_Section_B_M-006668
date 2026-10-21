
create table programs (
  id serial primary key,
  name text unique not null,
  max_gwa numeric(3,2) not null,
  min_units int not null,
  max_failed int not null,
  max_inc int not null,
  max_dropped int not null,
  deadline timestamptz not null
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'scholar' check (role in ('scholar','staff'))
);

create table scholars (
  id uuid primary key default gen_random_uuid(),
  student_id text unique not null,
  full_name text not null,
  program_id int references programs(id),
  user_id uuid unique references auth.users on delete set null
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null references scholars(id) on delete cascade,
  academic_year text not null,
  semester int not null check (semester in (1,2)),
  gwa numeric(3,2) not null check (gwa between 1 and 5),
  units int not null check (units >= 0),
  failed_count int not null check (failed_count >= 0),
  inc_count int not null check (inc_count >= 0),
  dropped_count int not null check (dropped_count >= 0),
  evidence_ref text not null check (length(trim(evidence_ref)) > 0),
  submitted_at timestamptz not null default now(),
  verification_status text not null default 'Pending' check (verification_status in ('Pending','Verified','Returned')),
  verification_reason text,
  compliance_result text not null default 'Not Evaluated' check (compliance_result in ('Not Evaluated','Compliant','With Deficiency')),
  compliance_reasons text[] not null default '{}',
  renewal_decision text not null default 'None' check (renewal_decision in ('None','Approved','Held')),
  decision_note text,
  unique (scholar_id, academic_year, semester)   -- duplicate prevention
);

create table history (
  id bigserial primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  actor uuid,
  actor_name text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- ========== POLICIES (thresholds live here, not in code) ==========
insert into programs (name, max_gwa, min_units, max_failed, max_inc, max_dropped, deadline) values
 ('Excellence Scholar', 2.00, 18, 0, 0, 0, '2026-11-06 17:00:00+08'),
 ('Access Scholar',     2.50, 15, 0, 0, 1, '2026-11-06 17:00:00+08');

-- ========== AUTH HELPERS ==========
create function is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'staff')
$$;

-- On sign-up: create profile (always role 'scholar') and link to the registered scholar by student ID.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  update scholars set user_id = new.id
   where student_id = new.raw_user_meta_data->>'student_id' and user_id is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ========== ROW LEVEL SECURITY ==========
alter table programs    enable row level security;
alter table profiles    enable row level security;
alter table scholars    enable row level security;
alter table submissions enable row level security;
alter table history     enable row level security;

create policy programs_read   on programs for select to authenticated using (true);
create policy programs_staff  on programs for update to authenticated using (is_staff()) with check (is_staff());

create policy profiles_read   on profiles for select to authenticated using (id = auth.uid() or is_staff());

create policy scholars_read   on scholars for select to authenticated using (is_staff() or user_id = auth.uid());
create policy scholars_insert on scholars for insert to authenticated with check (is_staff());
create policy scholars_update on scholars for update to authenticated using (is_staff()) with check (is_staff());

create policy subs_read on submissions for select to authenticated using (
  is_staff() or exists (select 1 from scholars s where s.id = scholar_id and s.user_id = auth.uid())
);
-- No insert/update/delete policies on submissions: all writes go through the functions below.

create policy history_read on history for select to authenticated using (
  is_staff() or exists (
    select 1 from submissions b join scholars s on s.id = b.scholar_id
    where b.id = submission_id and s.user_id = auth.uid())
);

-- ========== WRITE FUNCTIONS (rules enforced in the database) ==========
create function log_event(p_sub uuid, p_action text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into history (submission_id, actor, actor_name, action, detail)
  values (p_sub, auth.uid(), (select full_name from profiles where id = auth.uid()), p_action, p_detail);
end $$;

create function check_inputs(p_gwa numeric, p_units int, p_failed int, p_inc int, p_drop int, p_evidence text)
returns void language plpgsql as $$
begin
  if p_gwa is null or p_gwa < 1 or p_gwa > 5 then raise exception 'GWA must be between 1.00 and 5.00.'; end if;
  if p_units is null or p_units < 0 or p_failed is null or p_failed < 0
     or p_inc is null or p_inc < 0 or p_drop is null or p_drop < 0 then
    raise exception 'Units and subject counts must be non-negative whole numbers.';
  end if;
  if p_evidence is null or length(trim(p_evidence)) = 0 then
    raise exception 'A grade document reference is required.';
  end if;
end $$;

create function submit_grades(p_year text, p_sem int, p_gwa numeric, p_units int,
  p_failed int, p_inc int, p_drop int, p_evidence text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s scholars; new_id uuid;
begin
  select * into s from scholars where user_id = auth.uid();
  if s.id is null then raise exception 'Your account is not registered as a scholar. Ask staff to register your student ID.'; end if;
  if s.program_id is null then raise exception 'You have no scholarship program assigned yet.'; end if;
  if p_sem not in (1,2) or coalesce(trim(p_year),'') = '' then raise exception 'Select an academic year and semester.'; end if;
  perform check_inputs(p_gwa, p_units, p_failed, p_inc, p_drop, p_evidence);
  begin
    insert into submissions (scholar_id, academic_year, semester, gwa, units, failed_count, inc_count, dropped_count, evidence_ref)
    values (s.id, p_year, p_sem, p_gwa, p_units, p_failed, p_inc, p_drop, trim(p_evidence))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'A submission for % semester % already exists.', p_year, p_sem;
  end;
  perform log_event(new_id, 'Submitted', 'Academic summary submitted');
  return new_id;
end $$;

-- Corrections keep the original submitted_at (lateness is judged on the first submission);
-- the correction time is stored in the history log.
create function resubmit_grades(p_id uuid, p_gwa numeric, p_units int,
  p_failed int, p_inc int, p_drop int, p_evidence text) returns void
language plpgsql security definer set search_path = public as $$
declare b submissions;
begin
  select b2.* into b from submissions b2 join scholars s on s.id = b2.scholar_id
   where b2.id = p_id and s.user_id = auth.uid();
  if b.id is null then raise exception 'Submission not found.'; end if;
  if b.verification_status <> 'Returned' then raise exception 'Only returned submissions can be corrected.'; end if;
  perform check_inputs(p_gwa, p_units, p_failed, p_inc, p_drop, p_evidence);
  update submissions set gwa = p_gwa, units = p_units, failed_count = p_failed, inc_count = p_inc,
    dropped_count = p_drop, evidence_ref = trim(p_evidence),
    verification_status = 'Pending', verification_reason = null,
    compliance_result = 'Not Evaluated', compliance_reasons = '{}',
    renewal_decision = 'None', decision_note = null
   where id = p_id;
  perform log_event(p_id, 'Resubmitted', 'Corrected submission returned to Pending verification');
end $$;

create function verify_submission(p_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Only staff can verify submissions.'; end if;
  if p_status not in ('Verified','Returned') then raise exception 'Status must be Verified or Returned.'; end if;
  if p_status = 'Returned' and coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required when returning evidence.'; end if;
  update submissions set verification_status = p_status, verification_reason = nullif(trim(p_reason),''),
    compliance_result = 'Not Evaluated', compliance_reasons = '{}', renewal_decision = 'None', decision_note = null
   where id = p_id and verification_status = 'Pending';
  if not found then raise exception 'Only Pending submissions can be verified or returned.'; end if;
  perform log_event(p_id, p_status, p_reason);
end $$;

create function evaluate_submission(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b submissions; p programs; r text[] := '{}'; res text;
begin
  if not is_staff() then raise exception 'Only staff can evaluate submissions.'; end if;
  select * into b from submissions where id = p_id;
  if b.id is null then raise exception 'Submission not found.'; end if;
  if b.verification_status <> 'Verified' then raise exception 'Evidence must be Verified before evaluation.'; end if;
  select pr.* into p from programs pr join scholars s on s.program_id = pr.id where s.id = b.scholar_id;
  if p.id is null then raise exception 'Scholar has no program assigned.'; end if;

  if b.gwa > p.max_gwa then r := r || format('GWA %s is above the maximum of %s', b.gwa, p.max_gwa); end if;
  if b.units < p.min_units then r := r || format('Enrolled units %s are below the minimum of %s', b.units, p.min_units); end if;
  if b.failed_count > p.max_failed then r := r || format('Failed subjects %s exceed the allowed %s', b.failed_count, p.max_failed); end if;
  if b.inc_count > p.max_inc then r := r || format('Incomplete grades %s exceed the allowed %s', b.inc_count, p.max_inc); end if;
  if b.dropped_count > p.max_dropped then r := r || format('Dropped subjects %s exceed the allowed %s', b.dropped_count, p.max_dropped); end if;
  if b.submitted_at > p.deadline then r := r || 'Submitted late (after the deadline)'; end if;

  res := case when cardinality(r) = 0 then 'Compliant' else 'With Deficiency' end;
  update submissions set compliance_result = res, compliance_reasons = r,
    renewal_decision = 'None', decision_note = null where id = p_id;
  perform log_event(p_id, 'Evaluated', case when cardinality(r) = 0 then res else res || ': ' || array_to_string(r, '; ') end);
end $$;

create function decide_renewal(p_id uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b submissions;
begin
  if not is_staff() then raise exception 'Only staff can record renewal decisions.'; end if;
  if p_decision not in ('Approved','Held') then raise exception 'Decision must be Approved or Held.'; end if;
  select * into b from submissions where id = p_id;
  if b.id is null then raise exception 'Submission not found.'; end if;
  if b.verification_status <> 'Verified' or b.compliance_result = 'Not Evaluated' then
    raise exception 'Verify and evaluate the submission before recording a decision.';
  end if;
  if p_decision = 'Approved' and b.compliance_result <> 'Compliant' then
    raise exception 'A record With Deficiency cannot be approved. Hold it instead.';
  end if;
  update submissions set renewal_decision = p_decision, decision_note = p_note where id = p_id;
  perform log_event(p_id, 'Renewal ' || p_decision, p_note);
end $$;

grant execute on function submit_grades, resubmit_grades, verify_submission, evaluate_submission, decide_renewal to authenticated;
revoke execute on function log_event, check_inputs from public, anon, authenticated;



