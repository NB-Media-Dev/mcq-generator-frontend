const API_BASE = "https://mcq-generator-backend-c6o1.onrender.com";
const fileEl = document.getElementById("file");
const btn = document.getElementById("btn");
const standardSelect = document.getElementById("standardSelect");
const groupContainer = document.getElementById("groupContainer");
const groupSelect = document.getElementById("groupSelect");
const subjectSelect = document.getElementById("subjectSelect");
const customCountContainer = document.getElementById("customCountContainer");
const customCountInput = document.getElementById("customCountInput");
const VIEW_IDS = ["form-view", "history-view", "results-view"];

function showView(id) {
  VIEW_IDS.forEach(v => document.getElementById(v).classList.toggle("hidden", v !== id));
  document.getElementById("navBackHomeBtn").classList.toggle("hidden", id === "form-view");
  document.getElementById("navViewFilesBtn").classList.toggle("hidden", id === "history-view");
  window.scrollTo(0, 0);
}

async function apiFetchJson(url, opts = {}) {
  let res;
  const options = { cache: "no-store", ...opts };
  try {
    res = await fetch(url, options);
  } catch (err) {
    console.error("Network error calling", url, err);
    alert("Backend connection failed: " + err.message + "\n\nMake sure the API server is running at " + API_BASE + ".");
    return null;
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("Failed to parse response from", url, err);
    alert("Backend returned an unreadable response (HTTP " + res.status + ").");
    return null;
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    console.error("Backend error from", url, msg);
    alert("Error: " + msg);
    return null;
  }
  return data;
}

function parseServerDate(v) {
  if (!v) return null;
  let s = String(v).trim();
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) {
    s = s.replace(" ", "T") + "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatGeneratedAt(v) {
  const d = parseServerDate(v);
  if (!d) return "";
  return d.toLocaleString(void 0, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function timeAgo(v) {
  const d = parseServerDate(v);
  if (!d) return "";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec} sec ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return formatGeneratedAt(v);
}

function combinedTimestampLabel(v) {
  const abs = formatGeneratedAt(v);
  if (!abs) return "";
  const rel = timeAgo(v);
  return rel ? `${abs} (${rel})` : abs;
}

function refreshLiveTimestamps() {
  document.querySelectorAll("[data-generated-at]").forEach(el => {
    const label = el.dataset.label || "🕒";
    el.textContent = `${label} ${combinedTimestampLabel(el.dataset.generatedAt)}`;
  });
}
setInterval(refreshLiveTimestamps, 30000);


function setDownloadLinksEnabled(enabled) {
  ["downloadJsonBtn", "downloadTextBtn"].forEach(id => {
    const a = document.getElementById(id);
    if (!a) return;
    a.classList.toggle("disabled-link", !enabled);
    if (!enabled) {
      a.removeAttribute("href");
      a.setAttribute("href", "javascript:void(0)");
    }
  });
}

let currentPushFileKey = null;

function showResultsView(title, questions, query, fileKey, warnMsg, generatedAt) {
  setDownloadLinksEnabled(false);

  document.getElementById("viewTitle").textContent = title;
  const ts = `_ts=${Date.now()}`;

  const jsonBtn = document.getElementById("downloadJsonBtn");
  const textBtn = document.getElementById("downloadTextBtn");
  jsonBtn.href = `${API_BASE}/download/json?${query}&${ts}`;
  textBtn.href = `${API_BASE}/download/text?${query}&${ts}`;

  setDownloadLinksEnabled(true);

  const metaEl = document.getElementById("generatedMeta");
  if (generatedAt) {
    metaEl.dataset.generatedAt = generatedAt;
    metaEl.dataset.label = "🕒 Generated";
    metaEl.title = formatGeneratedAt(generatedAt);
    metaEl.textContent = `🕒 Generated ${combinedTimestampLabel(generatedAt)}`;
    metaEl.classList.remove("hidden");
  } else {
    delete metaEl.dataset.generatedAt;
    delete metaEl.dataset.label;
    metaEl.removeAttribute("title");
    metaEl.classList.add("hidden");
    metaEl.textContent = "";
  }

  const warnEl = document.getElementById("resultsWarnBanner");
  if (warnMsg) {
    warnEl.textContent = warnMsg;
    warnEl.classList.remove("hidden");
  } else {
    warnEl.classList.add("hidden");
    warnEl.textContent = "";
  }

  currentPushFileKey = fileKey || null;
  const pushBtn = document.getElementById("pushLiveBtn");
  pushBtn.disabled = !currentPushFileKey;
  pushBtn.textContent = currentPushFileKey ? "Push to Live DB" : "Push to Live DB (open a single file to enable)";

  const statusEl = document.getElementById("liveStatus");
  statusEl.textContent = "";
  statusEl.classList.remove("error-banner", "success", "error");

  renderQuestions(questions);
  showView("results-view");
}
setDownloadLinksEnabled(false);

document.getElementById("pushLiveBtn").onclick = async () => {
  if (!currentPushFileKey) return;
  const examType = document.getElementById("examTypeSelect").value;
  const statusEl = document.getElementById("liveStatus");
  const pushBtn = document.getElementById("pushLiveBtn");
  pushBtn.disabled = true;
  pushBtn.textContent = "Pushing... (this can take a little while for large batches)";
  statusEl.classList.remove("success", "error");
  statusEl.textContent = "Pushing questions to the live DB, please wait...";
  const force = document.getElementById("forceLivePush").checked;
  try {
    const data = await apiFetchJson(`${API_BASE}/push-to-live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_type: examType, file_key: currentPushFileKey, force })
    });
    if (!data) {
      statusEl.textContent = "Push failed — could not reach the server. See the alert above for details.";
      statusEl.classList.add("error");
      return;
    }
    if (data.status === "success") {
      statusEl.textContent = ` Pushed successfully! Pushed: ${data.pushed_count} | Already pushed before: ${data.skipped_already_pushed} | Failed: ${data.failed_count}` +
        (data.all_pushed ? " — all selected questions are now in the live DB, in the correct order." : "");
      statusEl.classList.add(data.failed_count > 0 ? "error" : "success");
      if (data.failed_count > 0) {
        console.error("Live push failures:", data.failed);
        alert(`${data.failed_count} question(s) still failed to push after automatic retries. Check the browser console for the exact error returned by the live DB for each one.`);
      }
    } else {
      statusEl.textContent = "Error: " + (data.detail || data.message || "Unknown error");
      statusEl.classList.add("error");
      alert("Error: " + (data.detail || data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Unexpected error while pushing to live DB:", err);
    statusEl.textContent = "Unexpected error while pushing — see console for details.";
    statusEl.classList.add("error");
  } finally {
    pushBtn.disabled = false;
    pushBtn.textContent = "Push to Live DB";
  }
};

const externalJsonFile = document.getElementById("externalJsonFile");
const externalJsonFileName = document.getElementById("externalJsonFileName");
const pushExternalJsonBtn = document.getElementById("pushExternalJsonBtn");
const externalJsonResult = document.getElementById("externalJsonResult");

externalJsonFile.onchange = () => {
  externalJsonFileName.textContent = externalJsonFile.files[0] ? externalJsonFile.files[0].name : "";
};

pushExternalJsonBtn.onclick = async () => {
  const file = externalJsonFile.files[0];
  if (!file) return alert("Choose a .json file from your system first.");
  const examType = document.getElementById("externalJsonExamType").value;
  const force = document.getElementById("externalJsonForce").checked;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exam_type", examType);
  formData.append("force", force);
  pushExternalJsonBtn.disabled = true;
  pushExternalJsonBtn.textContent = "Pushing... (this can take a little while for large files)";
  externalJsonResult.textContent = "";
  try {
    const data = await apiFetchJson(`${API_BASE}/push-json-to-live`, { method: "POST", body: formData });
    if (!data) return;
    if (data.status === "success") {
      let msg = ` Pushed successfully!\nFile had ${data.total_in_file} entries (${data.valid_count} valid).\nPushed: ${data.pushed_count} | Already pushed before: ${data.skipped_already_pushed} | Failed: ${data.failed_count}` +
        (data.all_pushed ? "\nAll valid questions are now in the live DB, in the correct order." : "");
      if (data.invalid_skipped && data.invalid_skipped.length) {
        msg += `\nSkipped (invalid): ${data.invalid_skipped.length}`;
        console.warn("Invalid entries skipped:", data.invalid_skipped);
      }
      if (data.failed_count > 0) console.error("Live push failures:", data.failed);
      externalJsonResult.textContent = msg;
    } else {
      externalJsonResult.textContent = "Error: " + (data.detail || data.message || "Unknown error");
    }
  } finally {
    pushExternalJsonBtn.disabled = false;
    pushExternalJsonBtn.textContent = "Push JSON File to Live DB";
  }
};

const DY_CODE_PATTERN = /^AI[A-Z0-9]{2,28}$/;
const dyCodeInput = document.getElementById("customDyCodeInput");
const dyCodeError = document.getElementById("dyCodeError");

function clearDyCodeError() {
  dyCodeInput.classList.remove("input-error");
  dyCodeError.classList.add("hidden");
  dyCodeError.textContent = "";
}
function showDyCodeError(msg) {
  dyCodeInput.classList.add("input-error");
  dyCodeError.textContent = msg;
  dyCodeError.classList.remove("hidden");
}
function getSelectedDyCode() {
  return dyCodeInput.value.trim().toUpperCase();
}
function validateDyCodeForSubmit() {
  const code = getSelectedDyCode();
  if (!code) {
    showDyCodeError('Exam Code is required — enter a code (must start with "AI").');
    dyCodeInput.focus();
    return null;
  }
  if (!DY_CODE_PATTERN.test(code)) {
    showDyCodeError('Invalid code: must start with "AI" and contain only letters/numbers (e.g. AITSB7S01).');
    dyCodeInput.focus();
    return null;
  }
  clearDyCodeError();
  return code;
}
dyCodeInput.addEventListener("input", () => {
  const start = dyCodeInput.selectionStart, end = dyCodeInput.selectionEnd;
  dyCodeInput.value = dyCodeInput.value.toUpperCase();
  dyCodeInput.setSelectionRange(start, end);
  clearDyCodeError();
});

const DY_QUES_PREFIX_PATTERN = /^[A-Z0-9]{2,20}$/;
const dyQuesPrefixInput = document.getElementById("customDyQuesPrefixInput");
const dyQuesPrefixError = document.getElementById("dyQuesPrefixError");

function validateDyQuesPrefixForSubmit() {
  const val = dyQuesPrefixInput.value.trim().toUpperCase();
  if (!val) return { ok: true, value: "" };
  if (!DY_QUES_PREFIX_PATTERN.test(val)) {
    dyQuesPrefixInput.classList.add("input-error");
    dyQuesPrefixError.textContent = "Invalid prefix: use only letters/numbers, 2-20 characters (e.g. AI8MA2).";
    dyQuesPrefixError.classList.remove("hidden");
    dyQuesPrefixInput.focus();
    return { ok: false, value: null };
  }
  dyQuesPrefixInput.classList.remove("input-error");
  dyQuesPrefixError.classList.add("hidden");
  return { ok: true, value: val };
}
dyQuesPrefixInput.addEventListener("input", () => {
  const start = dyQuesPrefixInput.selectionStart, end = dyQuesPrefixInput.selectionEnd;
  dyQuesPrefixInput.value = dyQuesPrefixInput.value.toUpperCase();
  dyQuesPrefixInput.setSelectionRange(start, end);
  dyQuesPrefixInput.classList.remove("input-error");
  dyQuesPrefixError.classList.add("hidden");
  dyQuesPrefixError.textContent = "";
});

document.querySelectorAll(".options").forEach(group => {
  group.addEventListener("click", e => {
    const label = e.target.closest("label");
    if (!label) return;
    group.querySelectorAll("label").forEach(l => l.classList.remove("selected"));
    label.classList.add("selected");
    const radio = label.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    if (group.dataset.group === "count") {
      if (radio && radio.value === "custom") {
        customCountContainer.classList.remove("hidden");
        customCountInput.focus();
      } else {
        customCountContainer.classList.add("hidden");
      }
    }
  });
});

fileEl.onchange = () => {
  document.getElementById("name").textContent = fileEl.files[0] ? fileEl.files[0].name : "CLICK HERE TO CHOOSE PDF FILE";
};

standardSelect.onchange = () => {
  const std = standardSelect.value;
  subjectSelect.innerHTML = '<option value="" disabled selected>Select Subject</option>';
  if (std === "11" || std === "12") {
    groupContainer.classList.remove("hidden");
    groupSelect.required = true;
  } else {
    groupContainer.classList.add("hidden");
    groupSelect.required = false;
    ["TAMIL", "ENGLISH", "MATHS", "SCIENCE", "SOCIAL"].forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      subjectSelect.appendChild(opt);
    });
  }
};

groupSelect.onchange = () => {
  const grp = groupSelect.value;
  subjectSelect.innerHTML = '<option value="" disabled selected>Select Subject</option>';
  let extra = [];
  if (grp === "BIO-MATHS") extra = ["MATHS", "BIOLOGY", "PHYSICS", "CHEMISTRY"];
  else if (grp === "COMPUTER-SCIENCE") extra = ["MATHS", "PHYSICS", "CHEMISTRY", "COMPUTER SCIENCE"];
  else if (grp === "COMMERCE") extra = ["ACCOUNTANCY", "COMMERCE", "ECONOMICS", "COMPUTER APPLICATION"];
  else if (grp === "PURE-SCIENCE") extra = ["PHYSICS", "CHEMISTRY", "BOTANY", "ZOOLOGY"];
  ["TAMIL", "ENGLISH", ...extra].forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    subjectSelect.appendChild(opt);
  });
};

const GEN_POLL_INTERVAL_MS = 2000;
const GEN_MAX_AUTO_CONTINUES = 25;
const GEN_OVERALL_TIMEOUT_MS = 20 * 60 * 1000; // 20 min safety net

const genProgressBox = document.getElementById("genProgressBox");
const gpStage = document.getElementById("gpStage");
const gpFill = document.getElementById("gpFill");
const gpCount = document.getElementById("gpCount");
const gpSub = document.getElementById("gpSub");
const gpCancelBtn = document.getElementById("gpCancelBtn");

let genCancelled = false;
gpCancelBtn.onclick = () => {
  genCancelled = true;
  gpStage.textContent = "Cancelling... (finishing current step)";
};

function setGenProgress(stage, achieved, target, sub) {
  genProgressBox.classList.remove("hidden");
  gpStage.textContent = stage;
  const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
  gpFill.style.width = pct + "%";
  gpCount.textContent = `${achieved} / ${target} questions`;
  gpSub.textContent = sub || "";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startGenerationJob(formFields) {
  const formData = new FormData();
  Object.entries(formFields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") formData.append(k, v); });
  const data = await apiFetchJson(`${API_BASE}/generate-questions/start`, { method: "POST", body: formData });
  return data && data.status === "success" ? data.job_id : null;
}

async function pollGenerationJob(jobId, overallAchievedBase, overallTarget) {
  while (true) {
    if (genCancelled) return { cancelled: true };
    const data = await apiFetchJson(`${API_BASE}/generate-questions/status?job_id=${encodeURIComponent(jobId)}`);
    if (!data) return { error: "Lost contact with the server while checking generation progress." };
    if (data.status === "error") return { error: data.detail || "Generation failed." };
    if (data.status === "done") return { result: data.result };

    const p = data.progress || {};
    const liveAchieved = overallAchievedBase + (p.generated || 0);
    setGenProgress(
      p.stage || "Working...",
      liveAchieved,
      overallTarget,
      p.wave ? `Round ${p.wave}` : ""
    );
    await sleep(GEN_POLL_INTERVAL_MS);
  }
}

async function runFullGeneration(baseFields, overallTarget) {
  genCancelled = false;
  let achievedSoFar = 0;
  let lastResult = null;
  let remaining = overallTarget;
  let attempt = 0;
  const overallDeadline = Date.now() + GEN_OVERALL_TIMEOUT_MS;

  while (attempt < GEN_MAX_AUTO_CONTINUES && Date.now() < overallDeadline) {
    attempt++;
    const jobId = await startGenerationJob({ ...baseFields, num_questions: remaining });
    if (!jobId) return { error: "Could not start the generation job." };

    setGenProgress(attempt === 1 ? "Starting..." : `Continuing (pass ${attempt})...`, achievedSoFar, overallTarget, "");
    const outcome = await pollGenerationJob(jobId, achievedSoFar, overallTarget);
    if (outcome.cancelled) return { cancelled: true, lastResult };
    if (outcome.error) return { error: outcome.error, lastResult };

    lastResult = outcome.result;
    achievedSoFar = lastResult.count;
    remaining = overallTarget - achievedSoFar;

    if (remaining <= 0) break;
    if (lastResult.quota_limited_reason !== "time_budget") break; 
  }

  return { result: lastResult, achievedSoFar };
}

document.getElementById("quizForm").onsubmit = async e => {
  e.preventDefault();
  if (!fileEl.files[0]) return alert("Please select a PDF file to generate questions.");
  if (!standardSelect.value) return alert("Please select a Standard.");
  if (!subjectSelect.value) return alert("Please select a Subject.");

  const dyCode = validateDyCodeForSubmit();
  if (!dyCode) return;

  const prefixResult = validateDyQuesPrefixForSubmit();
  if (!prefixResult.ok) return;

  const countRadio = document.querySelector('input[name="count"]:checked');
  let count = countRadio ? countRadio.value : "10";
  if (count === "custom") {
    const n = Number.parseInt(customCountInput.value.trim(), 10);
    if (Number.isNaN(n) || n < 1) {
      alert("Please enter a valid positive number for custom question count.");
      customCountInput.focus();
      return;
    }
    count = n.toString();
  }
  const requestedCount = Number.parseInt(count, 10);

  btn.textContent = "Generating...";
  btn.disabled = true;
  genCancelled = false;
  setGenProgress("Uploading PDF...", 0, requestedCount, "");

  const baseFields = {
    file: fileEl.files[0],
    board: document.querySelector('input[name="board"]:checked').value,
    standard: standardSelect.value,
    subject: subjectSelect.value,
    difficulty: document.querySelector('input[name="level"]:checked').value,
    dy_code: dyCode,
  };
  if (prefixResult.value) baseFields.dy_ques_prefix = prefixResult.value;

  try {
    const outcome = await runFullGeneration(baseFields, requestedCount);

    if (outcome.cancelled) {
      if (outcome.lastResult) {
        showResultsView(
          `File: ${outcome.lastResult.file_key} (Total Questions: ${outcome.lastResult.count})`,
          outcome.lastResult.questions,
          `file_key=${encodeURIComponent(outcome.lastResult.file_key)}`,
          outcome.lastResult.file_key,
          "Generation was cancelled -- showing what was saved so far. Generate again with the same Exam Code to append the rest.",
          outcome.lastResult.generated_at
        );
      } else {
        alert("Generation was cancelled before any questions were saved.");
      }
      return;
    }
    if (outcome.error) {
      alert("Error: " + outcome.error);
      return;
    }

    const data = outcome.result;
    const fileKey = data.file_key;
    let warnMsg = null;
    if (data.quota_limited) {
      warnMsg = data.message;
    } else if (data.count < requestedCount) {
      warnMsg = `Generated ${data.count} of ${requestedCount} requested questions.`;
    }
    showResultsView(
      `File: ${fileKey} (Total Questions: ${data.questions ? data.questions.length : 0})`,
      data.questions,
      `file_key=${encodeURIComponent(fileKey)}`,
      fileKey,
      warnMsg,
      data.generated_at
    );
  } finally {
    btn.textContent = "Generate & Append Questions";
    btn.disabled = false;
    genProgressBox.classList.add("hidden");
  }
};

document.getElementById("navViewFilesBtn").onclick = () => loadFilesHistory();
document.getElementById("navBackHomeBtn").onclick = () => showView("form-view");

let allStoredFiles = [];

async function loadFilesHistory() {
  const data = await apiFetchJson(`${API_BASE}/files-history`);
  if (!data) return;
  if (data.status === "success") {
    allStoredFiles = data.files || [];
    document.getElementById("historyFilterInput").value = "";
    renderFilesHistory(allStoredFiles);
    showView("history-view");
  } else {
    alert("Error: " + (data.detail || data.message || "Unknown error"));
  }
}

function renderFilesHistory(files) {
  const container = document.getElementById("historyListContainer");
  container.innerHTML = "";
  container.innerHTML = files.length ? "" : '<p class="empty-state">No stored files found.</p>';
  files.forEach(f => {
    const card = document.createElement("div");
    card.className = "file-card";

    const info = document.createElement("div");
    info.className = "file-info";
    info.addEventListener("click", () => openFileRecord(f.file_key, f.generated_at));

    const h4 = document.createElement("h4");
    h4.textContent = f.file_key;
    const p = document.createElement("p");
    p.textContent = `Standard: ${f.standard} | Subject: ${f.subject} | Board: ${f.board}`;
    info.appendChild(h4);
    info.appendChild(p);

    if (f.generated_at) {
      const timeP = document.createElement("p");
      timeP.className = "file-time";
      timeP.dataset.generatedAt = f.generated_at;
      timeP.dataset.label = "🕒 First generated";
      timeP.title = formatGeneratedAt(f.generated_at);
      timeP.textContent = `🕒 First generated ${combinedTimestampLabel(f.generated_at)}`;
      info.appendChild(timeP);
    }

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const countSpan = document.createElement("span");
    countSpan.style.fontWeight = "600";
    countSpan.style.color = "#4f46e5";
    countSpan.style.fontSize = "14px";
    countSpan.textContent = `${f.count} Qs`;

    const openBtn = document.createElement("button");
    openBtn.className = "btn-secondary";
    openBtn.style.padding = "8px 12px";
    openBtn.style.borderRadius = "8px";
    openBtn.style.fontWeight = "600";
    openBtn.style.fontSize = "13px";
    openBtn.style.cursor = "pointer";
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => openFileRecord(f.file_key, f.generated_at));

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteFileRecord(f.file_key));

    actions.appendChild(countSpan);
    actions.appendChild(openBtn);
    actions.appendChild(delBtn);
    card.appendChild(info);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

async function openFileRecord(fileKey, generatedAt) {
  const data = await apiFetchJson(`${API_BASE}/questions?file_key=${encodeURIComponent(fileKey)}`);
  if (!data) return;
  if (data.status === "success") {
    showResultsView(
      `File: ${fileKey} (${data.questions.length} Questions)`,
      data.questions,
      `file_key=${encodeURIComponent(fileKey)}`,
      fileKey,
      null,
      generatedAt
    );
  } else {
    alert("Error: " + (data.detail || data.message || "Unknown error"));
  }
}

async function deleteFileRecord(fileKey) {
  if (!confirm(`Are you sure you want to delete "${fileKey}" and all its questions?`)) return;
  const data = await apiFetchJson(`${API_BASE}/files?file_key=${encodeURIComponent(fileKey)}`, { method: "DELETE" });
  if (!data) return;
  if (data.status === "success") {
    loadFilesHistory();
  } else {
    alert("Error: " + (data.detail || data.message || "Unknown error"));
  }
}

function escapeHtml(v) {
  if (v == null) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildOptionsHtml(q) {
  let html = "";
  const opts = q.options || [q.dy_ans_1, q.dy_ans_2, q.dy_ans_3, q.dy_ans_4];
  if (opts && opts.length) {
    const labels = ["A", "B", "C", "D"];
    opts.forEach((opt, i) => {
      if (opt) html += `<div class="opt">${labels[i] || ""}. ${escapeHtml(opt)}</div>`;
    });
  }
  return html;
}

function buildBadgeHtml(q) {
  let html = "";
  if (q.is_new) html += '<span class="badge badge-new">NEW</span>';
  if (q.duplicate_attempts) {
    const word = q.duplicate_attempts === 1 ? "time" : "times";
    html += `<span class="badge badge-dup"> Regenerated ${q.duplicate_attempts} ${word} (not duplicated)</span>`;
  }
  return html;
}

function difficultyClass(q) {
  const d = (q.difficulty || "").toString().trim().toUpperCase();
  if (d === "EASY") return "diff-easy";
  if (d === "MODERATE") return "diff-moderate";
  if (d === "HARD") return "diff-hard";
  return "";
}

function dedupeQuestionsByText(list) {
  const seen = new Set();
  const out = [];
  list.forEach(q => {
    const key = q.question_text ? q.question_text.trim().toLowerCase() : "";
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  });
  return out;
}

function renderQuestions(list) {
  const output = document.getElementById("output");
  output.innerHTML = "";
  if (!list || !list.length) {
    output.innerHTML = '<p class="empty-state">No questions found.</p>';
    return;
  }
  const unique = dedupeQuestionsByText(list);
  if (!unique.length) {
    output.innerHTML = '<p class="empty-state">No unique questions available.</p>';
    return;
  }
  unique.forEach((q, i) => {
    const optsHtml = buildOptionsHtml(q);
    const badgeHtml = buildBadgeHtml(q);
    const diffClass = difficultyClass(q);
    output.innerHTML += `
                    <div class="q-block ${diffClass}">
                        <div class="q-header">
                            <div class="q-text"><b>[${escapeHtml(q.file_key || "General")}]</b> ${i + 1}. ${escapeHtml(q.question_text)}</div>
                            ${badgeHtml}
                        </div>
                        ${optsHtml}
                        <div class="ans-block">Correct Answer: ${escapeHtml(q.correct_answer)}</div>
                        <div class="explain-block">Explanation: ${escapeHtml(q.explanation)}</div>
                    </div>
                `;
  });
}

document.getElementById("historyFilterInput").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return renderFilesHistory(allStoredFiles);
  renderFilesHistory(allStoredFiles.filter(f =>
    (f.file_key || "").toLowerCase().includes(q) ||
    (f.subject || "").toLowerCase().includes(q) ||
    (f.standard || "").toLowerCase().includes(q) ||
    (f.board || "").toLowerCase().includes(q)
  ));
});

document.getElementById("searchDbBtn").onclick = async () => {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return alert("Please enter a search query.");
  const data = await apiFetchJson(`${API_BASE}/questions?search=${encodeURIComponent(q)}`);
  if (!data) return;
  if (data.status === "success") {
    showResultsView(`Search Results for: "${q}"`, data.questions, `search=${encodeURIComponent(q)}`);
  } else {
    alert("Error: " + (data.detail || data.message || "Unknown error"));
  }
};

document.getElementById("backToFormBtn").onclick = () => showView("form-view");
document.getElementById("backToHomeFromHistory").onclick = () => showView("form-view");
