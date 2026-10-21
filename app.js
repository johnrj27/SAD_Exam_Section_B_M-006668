// ===== CONFIG: paste your own values (anon key only, never the service-role key) =====
const SUPABASE_URL = "https://ntwgdhczuxbyxkiewrnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0Dodl_r9SZBcC2K8Z85pyg_bbw0Nz_i";
const configured =
  !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
let sb = null;
try {
  if (configured && typeof supabase !== "undefined")
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error(e);
}

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const manila = (t) =>
  new Date(t).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
const tag = (v, cls) =>
  `<span class="tag ${cls || v.split(" ").pop()}">${esc(v)}</span>`;
const YEARS = ["2025-2026", "2026-2027", "2027-2028"];

let me = null,
  profile = null,
  programs = [],
  scholars = [],
  subs = [],
  editing = null;
let tab = "subs",
  selYear = "2026-2027",
  selSem = 1;

function toast(msg, bad) {
  const t = $("toast");
  t.textContent = msg;
  t.style.background = bad ? "#b3261e" : "#1b7f4b";
  t.style.display = "block";
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.style.display = "none"), 4500);
}
async function run(p, okMsg) {
  // run a supabase call, show errors clearly
  const { data, error } = await p;
  if (error) {
    toast(error.message, true);
    return null;
  }
  if (okMsg) toast(okMsg);
  return data ?? true;
}

// ===== AUTH =====
function authView(mode = "in") {
  const up = mode === "up";
  $("who").innerHTML = "";
  $("app").innerHTML =
    `<div class="card" id="authcard" style="max-width:400px;margin:40px auto">
    <h2>${up ? "Create an account" : "Sign in"}</h2>
    <div class="row" style="flex-direction:column;align-items:stretch">
      <div><label for="a_email">Email</label><input id="a_email" type="email" autocomplete="username" style="width:100%"></div>
      <div><label for="a_pw">Password</label><input id="a_pw" type="password" autocomplete="${up ? "new-password" : "current-password"}" style="width:100%"></div>
      ${
        up
          ? `<div><label for="a_name">Full name</label><input id="a_name" style="width:100%"></div>
      <div><label for="a_sid">Student ID (as registered by staff)</label><input id="a_sid" style="width:100%"></div>`
          : ""
      }
      <button onclick="${up ? "signUp()" : "signIn()"}">${up ? "Create account" : "Sign in"}</button>
      <p class="small" style="margin:0;text-align:center">${up ? "Already have an account?" : "No account yet?"}
        <a href="#" onclick="authView('${up ? "in" : "up"}');return false">${up ? "Sign in" : "Sign up"}</a></p>
    </div></div>`;
  $("authcard").onkeydown = (e) => {
    if (e.key === "Enter") (up ? signUp : signIn)();
  };
  $("a_email").focus();
}
async function signIn() {
  const { error } = await sb.auth.signInWithPassword({
    email: $("a_email").value.trim(),
    password: $("a_pw").value,
  });
  if (error) return toast(error.message, true);
  boot();
}
async function signUp() {
  const full_name = $("a_name").value.trim(),
    student_id = $("a_sid").value.trim();
  if (!full_name || !student_id)
    return toast("Enter your full name and student ID.", true);
  const { error } = await sb.auth.signUp({
    email: $("a_email").value.trim(),
    password: $("a_pw").value,
    options: { data: { full_name, student_id } },
  });
  if (error) return toast(error.message, true);
  toast("Account created. You can sign in now.");
  boot();
}
async function signOut() {
  await sb.auth.signOut();
  me = null;
  authView();
}

async function boot() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return authView();
  me = session.user;
  const { data: p } = await sb
    .from("profiles")
    .select("*")
    .eq("id", me.id)
    .maybeSingle();
  profile = p;
  if (!profile) return authView();
  $("who").innerHTML =
    `${esc(profile.full_name || me.email)} (${profile.role}) <button class="alt sm" onclick="signOut()">Sign out</button>`;
  programs = (await run(sb.from("programs").select("*").order("id"))) || [];
  profile.role === "staff" ? staffLoad() : scholarLoad();
}

// ===== SCHOLAR =====
async function scholarLoad() {
  subs =
    (await run(
      sb
        .from("submissions")
        .select("*")
        .order("submitted_at", { ascending: false }),
    )) || [];
  const mine = (
    await run(sb.from("scholars").select("*, programs(name)"))
  )?.[0];
  const opt = (a) => a.map((y) => `<option>${y}</option>`).join("");
  const e = editing ? subs.find((s) => s.id === editing) : null;
  $("app").innerHTML = `
  <div class="card"><h2>${e ? "Correct and resubmit" : "Submit academic summary"}</h2>
    <p class="small">${mine ? `Program: ${esc(mine.programs?.name || "not assigned")}` : "Your account is not linked to a registered scholar record."}</p>
    <div class="row">
      <div><label for="f_year">Academic year</label><select id="f_year" ${e ? "disabled" : ""}>${opt(YEARS)}</select></div>
      <div><label for="f_sem">Semester</label><select id="f_sem" ${e ? "disabled" : ""}><option>1</option><option>2</option></select></div>
      <div><label for="f_gwa">GWA (1.00 to 5.00)</label><input id="f_gwa" size="6" value="${e ? e.gwa : ""}"></div>
      <div><label for="f_units">Enrolled units</label><input id="f_units" size="6" value="${e ? e.units : ""}"></div>
      <div><label for="f_failed">Failed</label><input id="f_failed" size="4" value="${e ? e.failed_count : 0}"></div>
      <div><label for="f_inc">Incomplete</label><input id="f_inc" size="4" value="${e ? e.inc_count : 0}"></div>
      <div><label for="f_drop">Dropped</label><input id="f_drop" size="4" value="${e ? e.dropped_count : 0}"></div>
      <div><label for="f_ev">Grade document reference</label><input id="f_ev" value="${e ? esc(e.evidence_ref) : ""}"></div>
      <button onclick="submitForm()">${e ? "Resubmit" : "Submit"}</button>
      ${e ? '<button class="alt" onclick="editing=null;scholarLoad()">Cancel</button>' : ""}
    </div></div>
  <div class="card"><h2>My submissions</h2><div class="wrap"><table>
    <tr><th>Term</th><th>GWA</th><th>Units</th><th>F / INC / D</th><th>Evidence</th><th>Submitted (Manila)</th><th>Verification</th><th>Compliance</th><th>Renewal</th><th></th></tr>
    ${
      subs
        .map(
          (
            s,
          ) => `<tr><td>${s.academic_year} S${s.semester}</td><td>${s.gwa}</td><td>${s.units}</td>
      <td>${s.failed_count} / ${s.inc_count} / ${s.dropped_count}</td><td>${esc(s.evidence_ref)}</td><td>${manila(s.submitted_at)}</td>
      <td>${tag(s.verification_status)}${s.verification_reason ? `<div class="small">${esc(s.verification_reason)}</div>` : ""}</td>
      <td>${s.compliance_result === "Not Evaluated" ? '<span class="none">Not evaluated</span>' : tag(s.compliance_result)}
          ${s.compliance_reasons.map((r) => `<div class="small">${esc(r)}</div>`).join("")}</td>
      <td>${s.renewal_decision === "None" ? '<span class="none">None yet</span>' : tag(s.renewal_decision)}${s.decision_note ? `<div class="small">${esc(s.decision_note)}</div>` : ""}</td>
      <td><div class="actions">${s.verification_status === "Returned" ? `<button class="sm" onclick="editing='${s.id}';scholarLoad()">Correct</button>` : ""}
        <button class="sm alt" onclick="showHistory('${s.id}')">History</button></div></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="10">No submissions yet. Fill in the form above to submit your first semester.</td></tr>'
    }
  </table></div></div><div id="hist"></div>`;
  if (e) {
    $("f_year").value = e.academic_year;
    $("f_sem").value = e.semester;
  }
}
function cnt(id, label) {
  const v = $(id).value.trim();
  if (!/^\d+$/.test(v))
    throw new Error(`${label} must be a non-negative whole number.`);
  return parseInt(v, 10);
}
async function submitForm() {
  try {
    const g = $("f_gwa").value.trim(),
      gwa = Number(g);
    if (g === "" || isNaN(gwa) || gwa < 1 || gwa > 5)
      throw new Error("GWA must be between 1.00 and 5.00.");
    const ev = $("f_ev").value.trim();
    if (!ev) throw new Error("Enter a grade document reference.");
    const a = {
      p_gwa: gwa,
      p_units: cnt("f_units", "Enrolled units"),
      p_failed: cnt("f_failed", "Failed count"),
      p_inc: cnt("f_inc", "Incomplete count"),
      p_drop: cnt("f_drop", "Dropped count"),
      p_evidence: ev,
    };
    const r = editing
      ? await run(
          sb.rpc("resubmit_grades", { p_id: editing, ...a }),
          "Resubmitted. Status is back to Pending.",
        )
      : await run(
          sb.rpc("submit_grades", {
            p_year: $("f_year").value,
            p_sem: +$("f_sem").value,
            ...a,
          }),
          "Submitted.",
        );
    if (r) {
      editing = null;
      scholarLoad();
    }
  } catch (e) {
    toast(e.message, true);
  }
}
async function showHistory(id) {
  const h =
    (await run(
      sb
        .from("history")
        .select("*")
        .eq("submission_id", id)
        .order("created_at"),
    )) || [];
  $("hist").innerHTML =
    `<div class="card"><h2>History</h2><table><tr><th>When (Manila)</th><th>Actor</th><th>Action</th><th>Detail</th></tr>
    ${h.map((x) => `<tr><td>${manila(x.created_at)}</td><td>${esc(x.actor_name)}</td><td>${esc(x.action)}</td><td>${esc(x.detail)}</td></tr>`).join("")}</table></div>`;
  $("hist").scrollIntoView();
}

// ===== STAFF =====
async function staffLoad() {
  scholars =
    (await run(sb.from("scholars").select("*").order("student_id"))) || [];
  subs =
    (await run(
      sb
        .from("submissions")
        .select("*, scholars(student_id, full_name, program_id)")
        .order("submitted_at"),
    )) || [];
  staffView();
}
const progName = (id) => programs.find((p) => p.id === id)?.name || "(none)";

function staffView() {
  const tabs = `<div class="tabs">${[
    ["subs", "Dashboard and submissions"],
    ["sch", "Scholars"],
    ["pol", "Policies"],
  ]
    .map(
      ([k, l]) =>
        `<button class="${tab === k ? "on" : ""}" onclick="tab='${k}';staffView()">${l}</button>`,
    )
    .join("")}</div>`;
  $("app").innerHTML = tabs + '<div id="pane"></div><div id="hist"></div>';
  ({ subs: subsPane, sch: schPane, pol: polPane })[tab]();
}

function subsPane() {
  const term = subs.filter(
    (s) => s.academic_year === selYear && s.semester === selSem,
  );
  const assigned = scholars.filter((s) => s.program_id).length;
  const n = (f) => term.filter(f).length;
  $("pane").innerHTML = `
  <div class="row" style="margin-bottom:12px">
    <div><label for="s_year">Academic year</label><select id="s_year" onchange="selYear=this.value;subsPane()">${YEARS.map((y) => `<option ${y === selYear ? "selected" : ""}>${y}</option>`).join("")}</select></div>
    <div><label for="s_sem">Semester</label><select id="s_sem" onchange="selSem=+this.value;subsPane()"><option ${selSem === 1 ? "selected" : ""}>1</option><option ${selSem === 2 ? "selected" : ""}>2</option></select></div>
  </div>
  <div class="stats">
    <div class="stat"><b>${assigned}</b>Assigned scholars</div>
    <div class="stat"><b>${n((s) => s.verification_status === "Pending")}</b>Pending verification</div>
    <div class="stat"><b>${n((s) => s.compliance_result === "Compliant")}</b>Compliant</div>
    <div class="stat"><b>${n((s) => s.compliance_result === "With Deficiency")}</b>With deficiency</div>
  </div>
  <div class="card"><div class="row">
    <div><label for="q">Search student ID or name</label><input id="q" oninput="drawRows()"></div>
    <div><label for="fp">Program</label><select id="fp" onchange="drawRows()"><option value="">All</option>${programs.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
    <div><label for="fc">Compliance</label><select id="fc" onchange="drawRows()"><option value="">All</option><option>Not Evaluated</option><option>Compliant</option><option>With Deficiency</option></select></div>
  </div></div>
  <div class="card wrap"><table id="tbl"></table></div>`;
  drawRows();
}
function drawRows() {
  const q = ($("q").value || "").toLowerCase(),
    fp = $("fp").value,
    fc = $("fc").value;
  const rows = subs
    .filter((s) => s.academic_year === selYear && s.semester === selSem)
    .filter(
      (s) =>
        !q ||
        (s.scholars.student_id + " " + s.scholars.full_name)
          .toLowerCase()
          .includes(q),
    )
    .filter((s) => !fp || String(s.scholars.program_id) === fp)
    .filter((s) => !fc || s.compliance_result === fc);
  $("tbl").innerHTML =
    `<tr><th>ID</th><th>Name</th><th>Program</th><th>GWA</th><th>Units</th><th>F/INC/D</th><th>Evidence</th><th>Submitted (Manila)</th><th>Verification</th><th>Compliance</th><th>Renewal</th><th>Actions</th></tr>` +
    (rows
      .map(
        (
          s,
        ) => `<tr><td>${esc(s.scholars.student_id)}</td><td>${esc(s.scholars.full_name)}</td><td>${esc(progName(s.scholars.program_id))}</td>
      <td>${s.gwa}</td><td>${s.units}</td><td>${s.failed_count}/${s.inc_count}/${s.dropped_count}</td><td>${esc(s.evidence_ref)}</td><td>${manila(s.submitted_at)}</td>
      <td>${tag(s.verification_status)}${s.verification_reason ? `<div class="small">${esc(s.verification_reason)}</div>` : ""}</td>
      <td>${s.compliance_result === "Not Evaluated" ? '<span class="none">Not evaluated</span>' : tag(s.compliance_result)}${s.compliance_reasons.map((r) => `<div class="small">${esc(r)}</div>`).join("")}</td>
      <td>${s.renewal_decision === "None" ? '<span class="none">None yet</span>' : tag(s.renewal_decision)}${s.decision_note ? `<div class="small">${esc(s.decision_note)}</div>` : ""}</td>
      <td><div class="actions">
        <button class="sm" onclick="verify('${s.id}','Verified')">Verify</button>
        <button class="sm bad" onclick="verify('${s.id}','Returned')">Return</button>
        <button class="sm" onclick="evalSub('${s.id}')">Evaluate</button>
        <button class="sm" onclick="decide('${s.id}','Approved')">Approve</button>
        <button class="sm alt" onclick="decide('${s.id}','Held')">Hold</button>
        <button class="sm alt" onclick="showHistory('${s.id}')">History</button></div></td></tr>`,
      )
      .join("") ||
      '<tr><td colspan="12">No submissions match this semester and filter.</td></tr>');
}
async function verify(id, status) {
  const reason =
    status === "Returned"
      ? prompt("Reason for returning the evidence:")
      : prompt("Optional verification note:") || "";
  if (reason === null) return;
  if (
    await run(
      sb.rpc("verify_submission", {
        p_id: id,
        p_status: status,
        p_reason: reason,
      }),
      status,
    )
  )
    staffLoad();
}
async function evalSub(id) {
  if (await run(sb.rpc("evaluate_submission", { p_id: id }), "Evaluated"))
    staffLoad();
}
async function decide(id, d) {
  const note = prompt(`Decision note for "${d}":`);
  if (note === null) return;
  if (
    await run(
      sb.rpc("decide_renewal", { p_id: id, p_decision: d, p_note: note }),
      `Renewal ${d}`,
    )
  )
    staffLoad();
}

function schPane() {
  $("pane").innerHTML = `
  <div class="card"><h2>Register a scholar</h2><div class="row">
    <div><label for="r_sid">Student ID</label><input id="r_sid"></div>
    <div><label for="r_name">Full name</label><input id="r_name"></div>
    <div><label for="r_prog">Program</label><select id="r_prog">${programs.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
    <button onclick="addScholar()">Register scholar</button></div></div>
  <div class="card wrap"><table><tr><th>Student ID</th><th>Name</th><th>Program</th><th>Login linked</th></tr>
  ${scholars
    .map(
      (s) => `<tr><td>${esc(s.student_id)}</td><td>${esc(s.full_name)}</td>
    <td><select onchange="setProgram('${s.id}',this.value)">${programs.map((p) => `<option value="${p.id}" ${p.id === s.program_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></td>
    <td>${s.user_id ? "Yes" : "Not yet"}</td></tr>`,
    )
    .join("")}</table></div>`;
}
async function addScholar() {
  const student_id = $("r_sid").value.trim(),
    full_name = $("r_name").value.trim();
  if (!student_id || !full_name)
    return toast("Enter both student ID and full name.", true);
  if (
    await run(
      sb
        .from("scholars")
        .insert({ student_id, full_name, program_id: +$("r_prog").value }),
      "Scholar registered",
    )
  )
    staffLoad().then(() => {
      tab = "sch";
      staffView();
    });
}
async function setProgram(id, pid) {
  if (
    await run(
      sb.from("scholars").update({ program_id: +pid }).eq("id", id),
      "Program updated",
    )
  )
    staffLoad().then(() => {
      tab = "sch";
      staffView();
    });
}

function polPane() {
  $("pane").innerHTML =
    `<div class="card wrap"><h2>Program policies (read from the database)</h2><table>
  <tr><th>Program</th><th>Max GWA</th><th>Min units</th><th>Max failed</th><th>Max INC</th><th>Max dropped</th><th>Deadline (Manila)</th></tr>
  ${programs.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.max_gwa}</td><td>${p.min_units}</td><td>${p.max_failed}</td><td>${p.max_inc}</td><td>${p.max_dropped}</td><td>${manila(p.deadline)}</td></tr>`).join("")}</table></div>`;
}

function setupMessage() {
  const why =
    typeof supabase === "undefined"
      ? "The Supabase library did not load. Check your internet connection and reload."
      : "Open app.js and paste your Supabase Project URL and anon key at the top (SUPABASE_URL and SUPABASE_ANON_KEY), then reload this page.";
  $("app").innerHTML =
    `<div class="card" style="max-width:560px;margin:40px auto"><h2>Setup needed</h2><p>${why}</p>
    <p class="small">Supabase dashboard: Project Settings > API (Project URL and anon public key).</p></div>`;
}
if (!sb) setupMessage();
else
  boot().catch((e) => {
    console.error(e);
    authView();
    toast(e.message || "Something went wrong.", true);
  });
