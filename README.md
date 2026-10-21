# Scholarship Monitoring and Academic Compliance System

SAD Comprehensive Laboratory Examination, Section B

Name: Romy John L. Astronomo
Student ID: M-006668
Program and year: BSIT 3-B

## About

This is my Scholarship Monitoring system for the exam. Scholars can submit their semester grades and staff can verify them, check if the scholar is compliant, and decide on renewal. It uses HTML, CSS and JavaScript for the pages and Supabase for the database and login.

## Files

- `index.html` - the page
- `style.css` - the design
- `app.js` - the code (login, scholar pages, staff pages)
- `schema.sql` - tables, access rules, functions and the seed data
- `README.md` - this file

## How to set it up

1. Make a new project in Supabase.
2. Go to Authentication, Sign In / Providers, Email and turn off "Confirm email".
3. Open the SQL Editor, paste everything in `schema.sql` and run it. This makes the tables, the two programs (Excellence Scholar and Access Scholar), and the six test scholars B01 to B06.
4. Open `app.js` and put your own Supabase Project URL and anon key at the top:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Make the two test accounts in Authentication, Users, Add user (check "Auto Confirm User"):
   - one staff account
   - one scholar account
6. Run this in the SQL Editor to set up the accounts (change the emails to yours):

```sql
insert into profiles (id, full_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

update profiles set role = 'staff'
where id = (select id from auth.users where email = 'staff@test.com');

update scholars set user_id = (select id from auth.users where email = 'scholar@test.com')
where student_id = 'B02';
```

7. Open `index.html` in the browser and sign in.

The scholar account is linked to B02, so that scholar only sees B02's record.

I did not put any passwords or the service-role key in the code. The test account logins were given to the instructor privately.

## How to run

Just open `index.html` in Chrome. It needs internet because it loads the Supabase library from a CDN. If hosting fails, this local copy is what I would use.

## What it does

Scholar:

- sign in and see only their own submissions
- submit academic year, semester, GWA, units, failed, incomplete and dropped counts, and the grade document reference
- see the status (Pending, Verified or Returned) with the reason
- fix and resubmit a returned record
- see the history

Staff:

- see all submissions
- register a scholar and assign a program
- mark evidence as Verified or Returned (needs a reason)
- evaluate a verified submission and see the reasons for any deficiency
- approve or hold renewal with a note
- dashboard counts, search by student ID or name, filter by program or compliance
- see the history of each submission

## About the rules

The rules are checked in the database (in the SQL functions), not just in the buttons:

- a scholar can only read their own records (row level security)
- submissions can only be changed through the functions in `schema.sql`
- duplicate semester is blocked by a unique key
- GWA must be 1.00 to 5.00 and the counts cannot be negative
- only verified submissions can be evaluated
- a record with deficiency cannot be approved, only held
- the program limits (max GWA, minimum units, allowed failed, incomplete and dropped, and the deadline) are read from the `programs` table
- deadline is 2026-11-06 5:00 PM Manila time. Exactly 5:00 PM is on time, after that is late

## Expected results for the test records

| ID  | Expected        | Reason                                                           |
| --- | --------------- | ---------------------------------------------------------------- |
| B01 | Compliant       | GWA 2.00 and the deadline are both exactly on the limit          |
| B02 | With Deficiency | GWA 2.01 is above 2.00                                           |
| B03 | Compliant       | Access Scholar can have 1 dropped subject                        |
| B04 | With Deficiency | units 14 is below 15, and 1 incomplete grade                     |
| B05 | With Deficiency | 1 failed subject, and submitted 1 minute late                    |
| B06 | Blocked         | evidence is still Pending, so it cannot be evaluated or approved |

## Test results

| Test | What I did                                                          | Expected                                        | Actual | Pass/Fail | Evidence |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------- | ------ | --------- | -------- |
| TC01 | Evaluate B01                                                        | Compliant                                       |        |           |          |
| TC02 | Evaluate B02                                                        | With Deficiency (GWA)                           |        |           |          |
| TC03 | Evaluate B03                                                        | Compliant                                       |        |           |          |
| TC04 | Evaluate B04                                                        | Low units and incomplete grade                  |        |           |          |
| TC05 | Evaluate B05                                                        | Failed subject and late                         |        |           |          |
| TC06 | Evaluate and approve B06                                            | Both blocked                                    |        |           |          |
| TC07 | Duplicate semester, GWA 0.50, negative count                        | Rejected with a message                         |        |           |          |
| TC08 | Signed in as a scholar, tried to read another scholar and verify    | Denied                                          |        |           |          |
| TC09 | Return a record, correct it, resubmit, refresh                      | Pending, history is kept                        |        |           |          |
| TC10 | Approve a compliant record, try to approve a deficient one, hold it | Approve works, deficient is blocked, hold works |        |           |          |

Screenshots are in the screenshots folder.

## Known problems

- The program limits can only be changed in the Supabase Table Editor. The Policies tab just shows them.
- When a scholar fixes a returned record, it keeps the first submission time, so lateness is based on the first submission.
- Anyone who signs up with a student ID that staff registered gets linked to that record. This is okay for the exam because the data is fake.
