/* =====================================================================
 * Quiz Ôn Tập Y Khoa - Frontend
 * - Upload nhiều file .docx cùng lúc (gộp thành 1 bài)
 * - Nạp đề từ thư viện có sẵn trên máy
 * - Đảo câu / đảo đáp án, giới hạn số câu, đếm thời gian, chấm điểm
 * ===================================================================== */

"use strict";

/* ------------------------------ State ------------------------------ */
const state = {
  questions: [], // toàn bộ câu hỏi lấy từ server
  quiz: [], // câu hỏi của lượt làm hiện tại (đã đảo)
  answers: {}, // { [index]: optionIndex }
  revealed: {}, // { [index]: true } - chế độ hiện đáp án ngay
  flags: {}, // { [index]: true } - câu đã ghim để xem lại
  notes: {}, // { [index]: "ghi chú của người dùng" }
  currentIndex: 0,
  totalTime: 0,
  timeRemaining: 0,
  timerId: null,
  isSubmitted: false,
  isReviewing: false,
  title: "Bài kiểm tra",
  sources: [],
  reviewFilter: "all",
};

let noteEditorOpen = false; // ô ghi chú đang mở hay đóng (nhớ khi chuyển câu)
let pickedFiles = []; // File[] người dùng đã chọn để upload
let libraryFiles = []; // [{id, name, size}]
const librarySelected = new Set();
const librarySubjectOpen = new Set(); // tên môn đang mở (mặc định: đóng hết)
let librarySearch = ""; // từ khóa lọc trong ô "Tìm đề / môn"
let libraryDefaultSub = ""; // dòng mô tả thư viện khi không tìm kiếm

/* ------------------------------ Helpers ---------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function formatSize(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/** Bỏ dấu tiếng Việt để tìm kiếm gõ "ngoai bl" vẫn ra "Ngoại BL" */
function foldVietnamese(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function shuffleArray(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------ DOM refs --------------------------- */
const uploadSection = $("#upload-section");
const uploadArea = $("#upload-area");
const fileInput = $("#file-input");
const filePanel = $("#file-panel");
const fileListEl = $("#file-list");
const fileCountEl = $("#file-count");
const loadingOverlay = $("#loading");
const loadingText = $(".loading-text");

const librarySub = $("#library-sub");
const libraryGrid = $("#library-grid");
const libSearchInput = $("#lib-search");
const btnLoadLibrary = $("#btn-load-library");
const libSelectedCount = $("#lib-selected-count");

const quizSection = $("#quiz-section");
const resultsSection = $("#results-section");
const timerBar = $("#timer-bar");
const timerText = $("#timer-text");
const timerFill = $("#timer-fill");
const progressText = $("#progress-text");
const questionsContainer = $("#questions-container");
const questionNav = $("#question-nav");
const btnPrev = $("#btn-prev");
const btnNext = $("#btn-next");
const btnSubmit = $("#btn-submit");
const btnBackResults = $("#btn-back-results");
const btnHome = $("#btn-home");

btnHome.addEventListener("click", goHome);

/* Về trang chủ. Nếu đang làm bài dở thì hỏi lại cho chắc. */
function goHome() {
  const inProgress = state.quiz.length > 0 && !state.isSubmitted;
  if (inProgress) {
    const ok = confirm(
      "Bạn đang làm bài dở. Về trang chủ sẽ mất toàn bộ kết quả bài này.\n\nVẫn về trang chủ?",
    );
    if (!ok) return;
  }
  resetToUpload();
}

/* =====================================================================
 * 1. Chọn & upload nhiều file
 * ===================================================================== */

uploadArea.addEventListener("click", () => fileInput.click());

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});

uploadArea.addEventListener("dragleave", () =>
  uploadArea.classList.remove("drag-over"),
);

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
  fileInput.value = ""; // cho phép chọn lại cùng file
});

function addFiles(fileList) {
  const incoming = Array.from(fileList || []);
  if (incoming.length === 0) return;

  const rejected = [];
  let added = 0;

  for (const f of incoming) {
    if (!/\.docx$/i.test(f.name)) {
      rejected.push(f.name);
      continue;
    }
    // tránh trùng (cùng tên + cùng size)
    if (pickedFiles.some((p) => p.name === f.name && p.size === f.size))
      continue;
    if (pickedFiles.length >= 60) {
      showToast("⚠️ Tối đa 60 file mỗi lần");
      break;
    }
    pickedFiles.push(f);
    added++;
  }

  if (rejected.length) {
    showToast(`❌ Bỏ qua ${rejected.length} file không phải .docx`);
  }
  if (added > 0) {
    showToast(`📎 Đã thêm ${added} file`);
  }
  renderFileList();
}

function removeFile(index) {
  pickedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  fileCountEl.textContent = pickedFiles.length;

  if (pickedFiles.length === 0) {
    filePanel.classList.add("hidden");
    fileListEl.innerHTML = "";
    return;
  }

  filePanel.classList.remove("hidden");
  fileListEl.innerHTML = pickedFiles
    .map(
      (f, i) => `
      <div class="file-item">
        <span class="file-item-icon">📄</span>
        <span class="file-item-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name.replace(/\.docx$/i, ""))}</span>
        <span class="file-item-size">${formatSize(f.size)}</span>
        <button class="file-item-remove" type="button" data-index="${i}" aria-label="Xóa file">✕</button>
      </div>`,
    )
    .join("");

  fileListEl.querySelectorAll(".file-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.index)));
  });
}

$("#btn-clear-files").addEventListener("click", () => {
  pickedFiles = [];
  renderFileList();
});

$("#btn-start-upload").addEventListener("click", uploadPickedFiles);

async function uploadPickedFiles() {
  if (pickedFiles.length === 0) {
    showToast("⚠️ Chưa chọn file nào");
    return;
  }

  const files = pickedFiles.slice();
  const label =
    files.length === 1
      ? files[0].name.replace(/\.docx$/i, "")
      : `Tổng hợp ${files.length} đề`;

  await requestQuestions(() => apiUpload(files), label);
}

/* =====================================================================
 * 1b. Chế độ tĩnh (không có server Node - vd. mở trên điện thoại)
 * ---------------------------------------------------------------------
 * Cùng một bộ code chạy được 2 chế độ:
 *   - Có server  : gọi /api/... như cũ (chạy bằng "Mở Quiz.bat" trên máy tính)
 *   - Không server: đọc kho đề dựng sẵn ở data/*.json, và tự đọc file .docx
 *                   ngay trong trình duyệt bằng mammoth + parser dùng chung.
 * Mọi đường dẫn đều TƯƠNG ĐỐI để chạy được ở thư mục con (GitHub Pages).
 * ===================================================================== */

let staticMode = false; // true = không có server, dùng kho đề dựng sẵn
let staticBank = null; // { [fileId]: [câu hỏi] } - nạp một lần rồi giữ lại

async function fetchJson(url, options) {
  const res = await fetch(url, options);

  // Phải đúng là JSON. Nếu server tĩnh trả về trang HTML 404/fallback thì
  // coi như thất bại, để bên gọi biết đường chuyển sang kho đề dựng sẵn.
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) {
    throw new Error(`Không phải JSON (${res.status})`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

/** Nạp kho câu hỏi dựng sẵn (chỉ tải đúng một lần) */
async function getStaticBank() {
  if (!staticBank) staticBank = await fetchJson("data/questions.json");
  return staticBank;
}

/**
 * Bản thay thế cho POST /api/library/load khi không có server.
 * Lọc câu trùng giữa các đề bằng đúng hàm dedupeKey của server, để chọn
 * nhiều đề cùng lúc cho ra kết quả y hệt bản chạy trên máy tính.
 */
async function staticLoadLibrary(ids) {
  const bank = await getStaticBank();
  await loadScript("vendor/parser.js"); // 13KB, không kéo theo mammoth
  const keyOf = window.QuizParser && window.QuizParser.dedupeKey;

  const targets = ids && ids.length ? ids : Object.keys(bank);

  const questions = [];
  const files = [];
  const seen = new Set();

  for (const id of targets) {
    const list = bank[id];
    if (!Array.isArray(list) || list.length === 0) continue;

    const name = (libraryFiles.find((f) => f.id === id) || {}).name || id;
    const res = { name, count: 0, skipped: 0, error: null };

    for (const q of list) {
      if (keyOf) {
        const key = keyOf(q);
        if (seen.has(key)) {
          res.skipped++;
          continue;
        }
        seen.add(key);
      }
      questions.push(q);
      res.count++;
    }
    files.push(res);
  }

  if (questions.length === 0) {
    throw new Error("Không tìm thấy câu hỏi nào trong các đề đã chọn.");
  }
  return { totalQuestions: questions.length, questions, files };
}

/** Tải một script ngoài, dùng lại nếu đã tải rồi */
const loadedScripts = new Map();
function loadScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);
  const p = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Không tải được ${src}`));
    document.head.appendChild(el);
  });
  loadedScripts.set(src, p);
  return p;
}

/**
 * Bản thay thế cho POST /api/upload khi không có server:
 * đọc thẳng file .docx trong trình duyệt (điện thoại cũng làm được).
 * mammoth ~600KB nên chỉ tải khi người dùng thực sự chọn file.
 */
async function staticParseDocxFiles(files) {
  loadingText.textContent = "Đang tải bộ đọc file Word (chỉ lần đầu)...";
  try {
    await loadScript("vendor/mammoth.browser.min.js");
    await loadScript("vendor/parser.js");
  } catch {
    throw new Error(
      navigator.onLine
        ? "Không tải được bộ đọc file Word. Hãy thử lại."
        : "Đang offline nên chưa tải được bộ đọc file Word (~600KB). " +
          "Hãy kết nối mạng một lần để tải, sau đó dùng offline thoải mái.",
    );
  }

  if (!window.mammoth || !window.QuizParser) {
    throw new Error("Thiếu bộ đọc file Word. Hãy chạy lại 'npm run build'.");
  }

  loadingText.textContent = "Đang đọc và phân tích file...";

  const questions = [];
  const results = [];
  const seen = new Set();

  for (const file of files) {
    const name = file.name.replace(/\.docx$/i, "");
    const res = { name, count: 0, skipped: 0, error: null };
    try {
      const buf = await file.arrayBuffer();
      const out = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      const parsed = window.QuizParser.parseQuestionsFromHtml(out.value);
      res.skipped = parsed.stats.skipped;

      for (const q of parsed.questions) {
        const key = window.QuizParser.dedupeKey(q);
        if (seen.has(key)) {
          res.skipped++;
          continue;
        }
        seen.add(key);
        questions.push({ ...q, source: name });
        res.count++;
      }
    } catch (err) {
      res.error = err.message;
    }
    results.push(res);
  }

  if (questions.length === 0) {
    throw new Error(
      'Không đọc được câu hỏi nào. Đáp án đúng cần được đánh dấu ✅ hoặc ghi "Đáp án: X".',
    );
  }
  return { totalQuestions: questions.length, questions, files: results };
}

/* =====================================================================
 * 2. Thư viện đề có sẵn trên máy
 * ===================================================================== */

async function loadLibraryList() {
  try {
    let data;
    try {
      // Đường dẫn tương đối: chạy được cả khi web nằm trong thư mục con
      data = await fetchJson("api/library");
    } catch {
      // Không có server -> dùng kho đề dựng sẵn
      staticMode = true;
      data = await fetchJson("data/library.json");
    }
    libraryFiles = Array.isArray(data.files) ? data.files : [];

    if (libraryFiles.length === 0) {
      librarySub.textContent =
        "Không tìm thấy file .docx nào. Hãy đặt file (đúng định dạng câu hỏi/đáp án) vào một thư mục môn học cạnh thư mục quiz-app.";
      libraryGrid.innerHTML = "";
      return;
    }

    const subjects = new Set(libraryFiles.map((f) => f.subject || "Khác"));
    libraryDefaultSub = `${libraryFiles.length} bộ đề trong ${subjects.size} môn — bấm vào tên môn để xem danh sách đề.`;
    librarySub.textContent = libraryDefaultSub;
    // Chỉ có 1 môn thì mở sẵn cho đỡ phải bấm thêm một lần
    if (subjects.size === 1) librarySubjectOpen.add(Array.from(subjects)[0]);
    renderLibraryGrid();
    renderRandomScope();
  } catch {
    librarySub.textContent = "Không kết nối được tới server để đọc thư viện.";
  }
}

function groupLibraryBySubject() {
  const groups = new Map();
  for (const f of libraryFiles) {
    const key = f.subject || "Khác";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return groups;
}

/**
 * Vẽ thư viện dạng "thư mục": mỗi môn là một hàng thu gọn, bấm vào mới xổ
 * danh sách đề của môn đó. Nhờ vậy thêm bao nhiêu môn trang vẫn ngắn.
 * Đề của môn đang đóng thì KHÔNG dựng ra DOM cho nhẹ máy.
 */
function renderLibraryGrid() {
  const groups = groupLibraryBySubject();
  const q = foldVietnamese(librarySearch.trim());
  const keepScroll = libraryGrid.scrollTop;
  const html = [];
  let matchCount = 0;

  for (const [subject, files] of groups) {
    // Đang tìm kiếm: chỉ giữ đề khớp, và mở sẵn môn để thấy ngay kết quả
    const shown = q
      ? files.filter((f) => foldVietnamese(`${f.name} ${subject}`).includes(q))
      : files;
    if (shown.length === 0) continue;
    matchCount += shown.length;

    const open = q ? true : librarySubjectOpen.has(subject);
    const picked = files.filter((f) => librarySelected.has(f.id)).length;
    const allPicked = picked === files.length;

    const body = open
      ? `<div class="lib-subject-grid">${shown
          .map(
            (f) => `
            <button class="lib-card${librarySelected.has(f.id) ? " selected" : ""}"
                    type="button" data-id="${escapeHtml(f.id)}">
              <span class="lib-check">${librarySelected.has(f.id) ? "✓" : ""}</span>
              <span class="lib-name">${escapeHtml(f.name)}</span>
            </button>`,
          )
          .join("")}</div>`
      : "";

    html.push(`
      <div class="lib-subject-group${open ? " open" : ""}">
        <div class="lib-subject-head">
          <button class="lib-subject-toggle" type="button"
                  data-subject="${escapeHtml(subject)}" aria-expanded="${open}">
            <span class="lib-caret">${open ? "▾" : "▸"}</span>
            <span class="lib-folder">${open ? "📂" : "📁"}</span>
            <span class="lib-subject-title">${escapeHtml(subject)}</span>
            <span class="lib-subject-meta">
              <span class="lib-subject-count">${shown.length} đề</span>
              ${picked ? `<span class="lib-subject-picked">✓ ${picked}</span>` : ""}
            </span>
          </button>
          <button class="lib-subject-all" type="button"
                  data-subject="${escapeHtml(subject)}"
                  title="${allPicked ? "Bỏ chọn cả môn" : "Chọn cả môn"}">
            ${allPicked ? "Bỏ chọn môn" : "Chọn cả môn"}
          </button>
        </div>
        ${body}
      </div>`);
  }

  libraryGrid.innerHTML = html.length
    ? html.join("")
    : `<div class="lib-empty">Không có đề nào khớp với "${escapeHtml(librarySearch)}"</div>`;

  if (q) librarySub.textContent = `Tìm thấy ${matchCount} đề khớp "${librarySearch.trim()}".`;
  else librarySub.textContent = libraryDefaultSub;

  libraryGrid.scrollTop = keepScroll;
  updateLibraryButton();
}

/* Một listener duy nhất cho cả lưới (không gắn lại mỗi lần vẽ) */
libraryGrid.addEventListener("click", (e) => {
  const toggle = e.target.closest(".lib-subject-toggle");
  if (toggle) {
    const subject = toggle.dataset.subject;
    if (librarySubjectOpen.has(subject)) librarySubjectOpen.delete(subject);
    else librarySubjectOpen.add(subject);
    renderLibraryGrid();
    return;
  }

  const selectAll = e.target.closest(".lib-subject-all");
  if (selectAll) {
    const files = groupLibraryBySubject().get(selectAll.dataset.subject) || [];
    const allPicked = files.every((f) => librarySelected.has(f.id));
    for (const f of files) {
      if (allPicked) librarySelected.delete(f.id);
      else librarySelected.add(f.id);
    }
    renderLibraryGrid();
    return;
  }

  const card = e.target.closest(".lib-card");
  if (card) {
    const id = card.dataset.id;
    if (librarySelected.has(id)) librarySelected.delete(id);
    else librarySelected.add(id);
    renderLibraryGrid();
  }
});

libSearchInput.addEventListener("input", () => {
  librarySearch = libSearchInput.value;
  renderLibraryGrid();
});

function updateLibraryButton() {
  const n = librarySelected.size;
  libSelectedCount.textContent = n;
  btnLoadLibrary.classList.toggle("hidden", n === 0);
}

$("#btn-lib-all").addEventListener("click", () => {
  libraryFiles.forEach((f) => librarySelected.add(f.id));
  renderLibraryGrid();
});

$("#btn-lib-none").addEventListener("click", () => {
  librarySelected.clear();
  renderLibraryGrid();
});

/* Đóng hết các môn đang mở (và xóa ô tìm kiếm) cho trang gọn lại */
$("#btn-lib-collapse").addEventListener("click", () => {
  librarySubjectOpen.clear();
  librarySearch = "";
  libSearchInput.value = "";
  renderLibraryGrid();
});

btnLoadLibrary.addEventListener("click", async () => {
  const ids = Array.from(librarySelected);
  if (ids.length === 0) return;

  const label =
    ids.length === 1
      ? (libraryFiles.find((f) => f.id === ids[0]) || {}).name || "Bài kiểm tra"
      : `Tổng hợp ${ids.length} đề`;

  await requestQuestions(() => apiLoadLibrary(ids), label);
});

/* =====================================================================
 * 2b. Random đề - bốc ngẫu nhiên N câu từ tài liệu
 * ===================================================================== */

const randomPanel = $("#random-panel");
const rndCount = $("#rnd-count");
const rndScope = $("#rnd-scope");

/** Đổ danh sách môn học vào ô "Lấy câu hỏi từ" */
function renderRandomScope() {
  if (libraryFiles.length === 0) {
    randomPanel.classList.add("hidden");
    return;
  }
  randomPanel.classList.remove("hidden");

  const groups = groupLibraryBySubject();
  const prev = rndScope.value;

  const opts = [
    `<option value="__all__">Tất cả môn học (${libraryFiles.length} đề)</option>`,
  ];
  for (const [subject, files] of groups) {
    opts.push(
      `<option value="${escapeHtml(subject)}">${escapeHtml(subject)} (${files.length} đề)</option>`,
    );
  }
  rndScope.innerHTML = opts.join("");

  // Giữ lựa chọn cũ nếu vẫn còn
  if (prev && rndScope.querySelector(`option[value="${CSS.escape(prev)}"]`)) {
    rndScope.value = prev;
  }
}

async function startRandomQuiz() {
  const wanted = Math.floor(Number(rndCount.value));
  if (!Number.isFinite(wanted) || wanted < 1) {
    showToast("❌ Hãy nhập số câu hợp lệ (từ 1 trở lên)");
    rndCount.focus();
    return;
  }

  const scope = rndScope.value || "__all__";
  const pool =
    scope === "__all__"
      ? libraryFiles
      : libraryFiles.filter((f) => (f.subject || "Khác") === scope);

  if (pool.length === 0) {
    showToast("❌ Không có đề nào trong phạm vi đã chọn");
    return;
  }

  const scopeName = scope === "__all__" ? "tất cả môn" : scope;

  await requestQuestions(
    () => apiLoadLibrary(pool.map((f) => f.id)),
    null,
    (data) => {
      const available = data.questions.length;
      const take = Math.min(wanted, available);

      if (wanted > available) {
        showToast(
          `⚠️ Kho chỉ có ${available} câu, đã lấy hết ${available} câu thay vì ${wanted}`,
        );
      }

      // Bốc ngẫu nhiên: luôn đảo câu và cắt đúng số câu người dùng gõ
      $("#opt-limit").value = String(take);
      $("#opt-shuffle-q").checked = true;

      return `🎲 Random ${take} câu — ${scopeName}`;
    },
  );
}

$("#btn-random").addEventListener("click", startRandomQuiz);

rndCount.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    startRandomQuiz();
  }
});

$$(".random-quick .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    rndCount.value = chip.dataset.n;
    startRandomQuiz();
  });
});

/* =====================================================================
 * 3. Gọi API + khởi tạo bài
 * ===================================================================== */

/** Nạp câu hỏi từ các đề trong thư viện (tự chọn server hay kho dựng sẵn) */
function apiLoadLibrary(ids) {
  if (staticMode) return staticLoadLibrary(ids);
  return fetchJson("api/library/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

/** Đọc các file .docx người dùng chọn (server hoặc đọc thẳng trong trình duyệt) */
function apiUpload(files) {
  if (staticMode) return staticParseDocxFiles(files);
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  return fetchJson("api/upload", { method: "POST", body: formData });
}

/**
 * Nạp câu hỏi rồi bắt đầu bài làm.
 * loader() trả về { totalQuestions, questions, files }.
 * onReady(data) chạy sau khi đã có state.questions, trước khi tạo bài;
 * nếu nó trả về chuỗi thì chuỗi đó được dùng làm tên bài.
 */
async function requestQuestions(loader, label, onReady) {
  loadingText.textContent = "Đang đọc và phân tích file...";
  loadingOverlay.classList.add("active");

  try {
    const data = await loader();

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("Không tìm thấy câu hỏi nào trong các file đã chọn.");
    }

    state.questions = data.questions;
    state.sources = Array.isArray(data.files) ? data.files : [];

    const okFiles = state.sources.filter((f) => f.count > 0).length;
    const failed = state.sources.filter((f) => f.error || f.count === 0);

    loadingOverlay.classList.remove("active");
    showToast(`✅ Đã nạp ${data.totalQuestions} câu từ ${okFiles} file`);

    if (failed.length) {
      console.warn("Các file không đọc được câu hỏi:", failed);
    }

    const finalLabel = (onReady && onReady(data)) || label;
    startNewQuiz(finalLabel);
  } catch (err) {
    loadingOverlay.classList.remove("active");
    showToast("❌ " + err.message);
  }
}

function readSettings() {
  const num = (sel, fallback) => {
    const v = Number($(sel).value);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  return {
    limit: Math.floor(num("#opt-limit", 0)),
    secondsPerQuestion: Math.floor(num("#opt-seconds", 30)),
    shuffleQuestions: $("#opt-shuffle-q").checked,
    shuffleOptions: $("#opt-shuffle-o").checked,
    instantFeedback: $("#opt-instant").checked,
    autoNext: $("#opt-auto-next").checked,
  };
}

function buildQuiz() {
  const cfg = readSettings();
  state.settings = cfg;

  let pool = state.questions.slice();
  if (cfg.shuffleQuestions) pool = shuffleArray(pool);
  if (cfg.limit > 0 && cfg.limit < pool.length) pool = pool.slice(0, cfg.limit);

  return pool.map((q) => {
    let options = q.options.slice();
    let correctIndex = q.correctIndex;

    if (cfg.shuffleOptions) {
      const correct = options[correctIndex];
      options = shuffleArray(options);
      correctIndex = options.indexOf(correct);
    }

    // Gán lại nhãn A, B, C, D theo vị trí mới
    const labels = ["A", "B", "C", "D", "E", "F"];
    options = options.map((o, i) => ({
      text: o.text,
      label: labels[i] || o.label,
    }));

    return {
      question: q.question,
      explanation: q.explanation || null,
      source: q.source || null,
      // Đáp án do AI suy luận (ghi chú "( Câu này AI làm )" trong file Word)
      ai: q.ai || false,
      aiCheck: q.aiCheck || false,
      aiNote: q.aiNote || null,
      options,
      correctIndex,
    };
  });
}

/* Nhãn cho câu có đáp án do AI làm - để người học biết mà cân nhắc */
function aiBadgeHtml(q) {
  if (!q.ai) return "";
  return q.aiCheck
    ? `<span class="ai-badge warn" title="AI chọn khác với gợi ý của ngân hàng đề — nên kiểm tra lại câu này">
         🤖 ( AI làm đáp án ) ⚠️ nên kiểm tra
       </span>`
    : `<span class="ai-badge" title="Đáp án do AI suy luận, không lấy từ ngân hàng đề">
         🤖 ( AI làm đáp án )
       </span>`;
}

/* Lý do AI chọn đáp án đó - chỉ hiện khi đã chấm bài / xem lại */
function aiNoteHtml(q) {
  if (!q.ai || !q.aiNote) return "";
  const warn = q.aiCheck
    ? `<div class="ai-note-warn">⚠️ Đáp án này KHÁC gợi ý của ngân hàng đề — nên tra lại sách trước khi tin.</div>`
    : "";
  return `
    <div class="ai-note-box${q.aiCheck ? " warn" : ""}">
      <strong>🤖 AI lý giải:</strong> ${escapeHtml(q.aiNote)}
      ${warn}
    </div>`;
}

function startNewQuiz(label) {
  if (label) state.title = label;

  const quiz = buildQuiz();
  if (quiz.length === 0) {
    showToast("❌ Không có câu hỏi nào để làm bài");
    return;
  }

  state.quiz = quiz;
  state.answers = {};
  state.revealed = {};
  state.flags = {};
  state.notes = {};
  state.currentIndex = 0;
  state.isSubmitted = false;
  state.isReviewing = false;
  state.reviewFilter = "all";
  noteEditorOpen = false;

  const perQ = state.settings.secondsPerQuestion;
  state.totalTime = perQ > 0 ? quiz.length * perQ : 0;
  state.timeRemaining = state.totalTime;

  $("#quiz-title").textContent = state.title;
  $("#total-questions").textContent = quiz.length;
  $("#total-time").textContent =
    state.totalTime > 0 ? Math.ceil(state.totalTime / 60) : "∞";

  renderSourceBadges();

  uploadSection.classList.add("hidden");
  resultsSection.classList.add("hidden");
  quizSection.classList.remove("hidden");
  timerBar.classList.remove("hidden");
  btnSubmit.classList.remove("hidden");
  btnBackResults.classList.add("hidden");
  btnHome.classList.remove("hidden");

  renderQuestionNav();
  renderQuestion(0);
  startTimer();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSourceBadges() {
  const el = $("#quiz-sources");
  if (!el) return;

  const counts = new Map();
  state.quiz.forEach((q) => {
    const key = q.source || "Không rõ nguồn";
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  if (counts.size <= 1) {
    el.innerHTML = "";
    el.classList.add("hidden");
    return;
  }

  el.classList.remove("hidden");
  el.innerHTML = Array.from(counts.entries())
    .map(
      ([name, n]) =>
        `<span class="source-badge">${escapeHtml(name)} · ${n}</span>`,
    )
    .join("");
}

/* =====================================================================
 * 4. Đồng hồ
 * ===================================================================== */

function startTimer() {
  if (state.timerId) clearInterval(state.timerId);
  updateTimerDisplay();

  if (state.totalTime === 0) return; // không giới hạn thời gian

  state.timerId = setInterval(() => {
    state.timeRemaining--;
    if (state.timeRemaining <= 0) {
      state.timeRemaining = 0;
      clearInterval(state.timerId);
      state.timerId = null;
      updateTimerDisplay();
      showToast("⏰ Hết thời gian! Bài đã được nộp tự động.");
      submitQuiz(true);
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  if (state.totalTime === 0) {
    timerText.textContent = "∞";
    timerText.className = "timer-text";
    timerFill.style.width = "100%";
    timerFill.className = "timer-progress-fill";
  } else {
    timerText.textContent = formatTime(state.timeRemaining);
    const percent = (state.timeRemaining / state.totalTime) * 100;
    timerFill.style.width = percent + "%";

    timerText.className = "timer-text";
    timerFill.className = "timer-progress-fill";
    if (percent < 10) {
      timerText.classList.add("danger");
      timerFill.classList.add("danger");
    } else if (percent < 25) {
      timerText.classList.add("warning");
      timerFill.classList.add("warning");
    }
  }

  const answered = Object.keys(state.answers).length;
  progressText.textContent = `${answered} / ${state.quiz.length} câu`;
  $("#answered-count").textContent = answered;
}

/* =====================================================================
 * 5. Render câu hỏi
 * ===================================================================== */

function renderQuestionNav() {
  questionNav.innerHTML = "";
  const frag = document.createDocumentFragment();

  state.quiz.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "q-nav-btn";
    btn.textContent = i + 1;
    btn.addEventListener("click", () => goToQuestion(i));
    frag.appendChild(btn);
  });

  questionNav.appendChild(frag);
  updateQuestionNav();
}

function updateQuestionNav() {
  const btns = questionNav.querySelectorAll(".q-nav-btn");
  btns.forEach((btn, i) => {
    btn.className = "q-nav-btn";
    const answer = state.answers[i];
    const graded = state.isSubmitted || state.revealed[i];

    if (graded) {
      if (answer === undefined) btn.classList.add("skipped-nav");
      else if (answer === state.quiz[i].correctIndex)
        btn.classList.add("correct-nav");
      else btn.classList.add("wrong-nav");
    } else if (isMarked(i)) {
      // Chưa chấm: câu đã ghim/ghi chú đổi hẳn màu cho nổi bật
      btn.classList.add("marked-nav");
    } else if (answer !== undefined) {
      btn.classList.add("answered");
    }

    // Chấm rồi thì giữ màu đúng/sai, chỉ gắn thêm chấm tròn góc trên
    if (isMarked(i)) {
      btn.classList.add("has-mark");
      const bits = [];
      if (state.flags[i]) bits.push("đã ghim");
      if ((state.notes[i] || "").trim()) bits.push("có ghi chú");
      btn.title = `Câu ${i + 1} — ${bits.join(", ")}`;
    } else {
      btn.removeAttribute("title");
    }

    if (i === state.currentIndex) btn.classList.add("current");
  });
}

function goToQuestion(index) {
  if (index < 0 || index >= state.quiz.length) return;
  state.currentIndex = index;
  renderQuestion(index);
  updateQuestionNav();
}

function renderQuestion(index) {
  const q = state.quiz[index];
  if (!q) return;

  const userAnswer = state.answers[index];
  const graded = state.isSubmitted || !!state.revealed[index];

  const optionsHtml = q.options
    .map((opt, i) => {
      let classes = "option-item";
      let icon = "";

      if (graded) {
        classes += " disabled";
        if (i === q.correctIndex) {
          classes += " correct";
          icon = '<span class="option-result-icon">✅</span>';
        } else if (i === userAnswer) {
          classes += " wrong";
          icon = '<span class="option-result-icon">❌</span>';
        }
      } else if (userAnswer === i) {
        classes += " selected";
      }

      return `
        <button class="${classes}" type="button" data-opt="${i}">
          <span class="option-radio"></span>
          <span class="option-label">${escapeHtml(opt.label)}.</span>
          <span class="option-text">${escapeHtml(opt.text)}</span>
          ${icon}
        </button>`;
    })
    .join("");

  const sourceHtml = q.source
    ? `<span class="question-source" title="Nguồn đề">📚 ${escapeHtml(q.source)}</span>`
    : "";

  const explanationHtml =
    graded && q.explanation
      ? `<div class="explanation-box"><strong>💡 Giải thích:</strong> ${escapeHtml(q.explanation)}</div>`
      : "";

  // Nhãn AI hiện ngay khi đang làm bài; lý do của AI để dành lúc chấm xong
  const aiHtml = graded ? aiNoteHtml(q) : "";

  const flagged = !!state.flags[index];
  const note = state.notes[index] || "";
  // Có ghi chú thì luôn mở sẵn ô soạn thảo cho dễ đọc
  const noteOpen = noteEditorOpen || note.length > 0;

  const flagBtnHtml = `
    <button class="flag-btn${flagged ? " active" : ""}" id="btn-flag" type="button"
            title="Ghim câu này để xem lại (phím G)">
      ${flagged ? "🔖 Đã ghim" : "🔖 Ghim câu này"}
    </button>`;

  const noteHtml = `
    <div class="note-block${noteOpen ? " open" : ""}">
      <button class="note-toggle" id="btn-note-toggle" type="button">
        📝 Ghi chú${note ? " (đã có)" : ""}
        <span class="note-caret">${noteOpen ? "▾" : "▸"}</span>
      </button>
      <textarea class="note-input" id="note-input" rows="3"
        placeholder="Ghi lại điều cần nhớ ở câu này: mẹo, kiến thức dễ nhầm, lý do chọn sai...">${escapeHtml(note)}</textarea>
    </div>`;

  questionsContainer.innerHTML = `
    <div class="question-card${flagged ? " flagged" : ""}">
      <div class="question-meta">
        <span class="question-number"><span>📌</span> Câu ${index + 1} / ${state.quiz.length}</span>
        <span class="question-meta-right">${flagBtnHtml}${sourceHtml}</span>
      </div>
      <div class="question-text">${escapeHtml(q.question)}</div>
      ${aiBadgeHtml(q)}
      <div class="options-list">${optionsHtml}</div>
      ${explanationHtml}
      ${aiHtml}
      ${noteHtml}
    </div>`;

  questionsContainer.querySelectorAll(".option-item").forEach((el) => {
    el.addEventListener("click", () =>
      selectOption(index, Number(el.dataset.opt)),
    );
  });

  $("#btn-flag").addEventListener("click", () => toggleFlag(index));

  $("#btn-note-toggle").addEventListener("click", () => {
    noteEditorOpen = !$(".note-block").classList.contains("open");
    $(".note-block").classList.toggle("open", noteEditorOpen);
    if (noteEditorOpen) $("#note-input").focus();
  });

  // Lưu ngay từng ký tự -> không mất chữ khi thẻ câu hỏi được vẽ lại
  $("#note-input").addEventListener("input", (e) => {
    const text = e.target.value;
    if (text.trim()) state.notes[index] = text;
    else delete state.notes[index];
    updateQuestionNav();
  });

  updateNavButtons();
}

/** Ghim / bỏ ghim câu hỏi */
function toggleFlag(index) {
  if (state.flags[index]) delete state.flags[index];
  else state.flags[index] = true;

  renderQuestion(index);
  updateQuestionNav();
  showToast(state.flags[index] ? "🔖 Đã ghim câu này" : "Đã bỏ ghim câu này");
}

/** Câu được đánh dấu = có ghim hoặc có ghi chú */
function isMarked(index) {
  return !!state.flags[index] || !!(state.notes[index] || "").trim();
}

function markedIndexes() {
  return state.quiz.map((_, i) => i).filter(isMarked);
}

function selectOption(qIndex, optIndex) {
  if (state.isSubmitted) return;
  if (state.revealed[qIndex]) return; // đã hiện đáp án -> không đổi
  const q = state.quiz[qIndex];
  if (!q || optIndex < 0 || optIndex >= q.options.length) return;

  state.answers[qIndex] = optIndex;

  const instant = state.settings.instantFeedback;
  if (instant) state.revealed[qIndex] = true;

  renderQuestion(qIndex);
  updateQuestionNav();
  updateTimerDisplay();

  const isLast = qIndex >= state.quiz.length - 1;
  if (state.settings.autoNext && !isLast) {
    const delay = instant ? 900 : 350;
    setTimeout(() => {
      if (state.currentIndex === qIndex && !state.isSubmitted)
        navigateQuestion(1);
    }, delay);
  }
}

/* =====================================================================
 * 6. Điều hướng
 * ===================================================================== */

function navigateQuestion(dir) {
  const next = state.currentIndex + dir;
  if (next < 0 || next >= state.quiz.length) return;
  goToQuestion(next);
}

function updateNavButtons() {
  btnPrev.disabled = state.currentIndex === 0;
  btnNext.disabled = state.currentIndex === state.quiz.length - 1;

  if (state.isSubmitted) {
    btnSubmit.classList.add("hidden");
    btnBackResults.classList.remove("hidden");
  } else {
    btnSubmit.classList.remove("hidden");
    btnBackResults.classList.add("hidden");
  }
}

btnPrev.addEventListener("click", () => navigateQuestion(-1));
btnNext.addEventListener("click", () => navigateQuestion(1));
btnSubmit.addEventListener("click", () => submitQuiz(false));
btnBackResults.addEventListener("click", showResults);

/* =====================================================================
 * 7. Nộp bài & kết quả
 * ===================================================================== */

function submitQuiz(force) {
  if (state.isSubmitted) return;

  const answered = Object.keys(state.answers).length;
  const total = state.quiz.length;

  if (!force && answered < total) {
    if (
      !confirm(
        `Bạn mới trả lời ${answered}/${total} câu.\nBạn có chắc muốn nộp bài?`,
      )
    )
      return;
  }

  state.isSubmitted = true;
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  showResults();
}

function computeScore() {
  const total = state.quiz.length;
  let correct = 0;
  let wrong = 0;

  state.quiz.forEach((q, i) => {
    const a = state.answers[i];
    if (a === undefined) return;
    if (a === q.correctIndex) correct++;
    else wrong++;
  });

  const unanswered = total - correct - wrong;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, wrong, unanswered, percent };
}

function showResults() {
  const { total, correct, wrong, unanswered, percent } = computeScore();
  const markedCount = markedIndexes().length;
  const timeTaken =
    state.totalTime > 0 ? state.totalTime - state.timeRemaining : null;

  let emoji, message;
  if (percent >= 90) {
    emoji = "🏆";
    message = "Xuất sắc!";
  } else if (percent >= 70) {
    emoji = "🎉";
    message = "Tốt lắm!";
  } else if (percent >= 50) {
    emoji = "💪";
    message = "Cần cố gắng thêm!";
  } else {
    emoji = "📚";
    message = "Hãy ôn tập thêm nhé!";
  }

  const timeHtml = timeTaken === null ? "—" : formatTime(timeTaken);

  resultsSection.innerHTML = `
    <div class="results-container">
      <div class="results-hero">
        <span class="results-emoji">${emoji}</span>
        <div class="results-title">${message}</div>
        <div class="results-subtitle">${escapeHtml(state.title)}</div>

        <div class="score-circle">
          <svg viewBox="0 0 180 180">
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f7a8c4"/>
                <stop offset="50%" stop-color="#e8638a"/>
                <stop offset="100%" stop-color="#d94f7a"/>
              </linearGradient>
            </defs>
            <circle class="bg-ring" cx="90" cy="90" r="80"/>
            <circle class="score-ring" id="score-ring" cx="90" cy="90" r="80"/>
          </svg>
          <div class="score-value">
            <div class="score-percent">${percent}%</div>
            <div class="score-label">${correct}/${total} câu đúng</div>
          </div>
        </div>

        <div class="results-stats">
          <div class="stat-card correct-stat">
            <div class="stat-icon">✅</div>
            <div class="stat-number">${correct}</div>
            <div class="stat-desc">Câu đúng</div>
          </div>
          <div class="stat-card wrong-stat">
            <div class="stat-icon">❌</div>
            <div class="stat-number">${wrong}</div>
            <div class="stat-desc">Câu sai</div>
          </div>
          <div class="stat-card skip-stat">
            <div class="stat-icon">➖</div>
            <div class="stat-number">${unanswered}</div>
            <div class="stat-desc">Chưa làm</div>
          </div>
          <div class="stat-card time-stat">
            <div class="stat-icon">⏱️</div>
            <div class="stat-number">${timeHtml}</div>
            <div class="stat-desc">Thời gian</div>
          </div>
        </div>

        <div class="results-actions">
          <button class="btn btn-secondary" id="btn-review" type="button">📋 Xem lại đáp án</button>
          <button class="btn btn-primary" id="btn-retry" type="button">🔄 Làm lại (đảo mới)</button>
          <button class="btn btn-secondary" id="btn-retry-wrong" type="button">🎯 Luyện câu sai</button>
          <button class="btn btn-secondary" id="btn-new" type="button">🏠 Về trang chủ</button>
        </div>
      </div>

      <div class="review-list-wrapper">
        <div class="review-header">
          <h2>Chi tiết bài làm</h2>
          <div class="review-filters">
            <button class="filter-btn active" data-filter="all" type="button">Tất cả (${total})</button>
            <button class="filter-btn" data-filter="wrong" type="button">Sai (${wrong})</button>
            <button class="filter-btn" data-filter="skipped" type="button">Chưa làm (${unanswered})</button>
            <button class="filter-btn" data-filter="correct" type="button">Đúng (${correct})</button>
            <button class="filter-btn filter-marked" data-filter="marked" type="button">🔖 Đã ghim / ghi chú (${markedCount})</button>
          </div>
        </div>
        <div id="review-list"></div>
      </div>
    </div>`;

  quizSection.classList.add("hidden");
  timerBar.classList.add("hidden");
  resultsSection.classList.remove("hidden");

  $("#btn-review").addEventListener("click", enterReviewMode);
  $("#btn-retry").addEventListener("click", () => startNewQuiz(state.title));
  $("#btn-retry-wrong").addEventListener("click", retryWrongOnly);
  $("#btn-new").addEventListener("click", resetToUpload);

  resultsSection.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      resultsSection
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.reviewFilter = btn.dataset.filter;
      renderReviewList();
    });
  });

  renderReviewList();

  setTimeout(() => {
    const ring = $("#score-ring");
    if (ring) {
      const c = 2 * Math.PI * 80;
      ring.style.strokeDashoffset = String(c - (c * percent) / 100);
    }
  }, 100);

  if (percent >= 70) createConfetti();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderReviewList() {
  const listEl = $("#review-list");
  if (!listEl) return;

  const items = state.quiz
    .map((q, i) => ({ q, i, answer: state.answers[i] }))
    .filter(({ q, i, answer }) => {
      const isCorrect = answer === q.correctIndex;
      switch (state.reviewFilter) {
        case "wrong":
          return answer !== undefined && !isCorrect;
        case "correct":
          return isCorrect;
        case "skipped":
          return answer === undefined;
        case "marked":
          return isMarked(i);
        default:
          return true;
      }
    });

  if (items.length === 0) {
    listEl.innerHTML =
      state.reviewFilter === "marked"
        ? '<div class="review-empty">Bạn chưa ghim hay ghi chú câu nào. Trong lúc làm bài, bấm 🔖 <strong>Ghim câu này</strong> (hoặc phím <kbd>G</kbd>) để đánh dấu câu cần xem lại.</div>'
        : '<div class="review-empty">Không có câu nào trong nhóm này 🎉</div>';
    return;
  }

  listEl.innerHTML = items
    .map(({ q, i, answer }) => {
      const isCorrect = answer === q.correctIndex;
      const status =
        answer === undefined
          ? '<span class="review-badge skipped">Chưa làm</span>'
          : isCorrect
            ? '<span class="review-badge correct">Đúng</span>'
            : '<span class="review-badge wrong">Sai</span>';

      const opts = q.options
        .map((opt, oi) => {
          let cls = "review-option";
          let mark = "";
          if (oi === q.correctIndex) {
            cls += " correct";
            mark = "✅";
          } else if (oi === answer) {
            cls += " wrong";
            mark = "❌";
          }
          return `<div class="${cls}"><span class="review-mark">${mark}</span><strong>${escapeHtml(opt.label)}.</strong> ${escapeHtml(opt.text)}</div>`;
        })
        .join("");

      const exp = q.explanation
        ? `<div class="explanation-box"><strong>💡 Giải thích:</strong> ${escapeHtml(q.explanation)}</div>`
        : "";

      const src = q.source
        ? `<span class="question-source">📚 ${escapeHtml(q.source)}</span>`
        : "";

      const flagBadge = state.flags[i]
        ? '<span class="review-badge marked">🔖 Đã ghim</span>'
        : "";

      const noteText = (state.notes[i] || "").trim();
      const noteBox = noteText
        ? `<div class="note-box"><strong>📝 Ghi chú của bạn:</strong> ${escapeHtml(noteText)}</div>`
        : "";

      return `
        <div class="review-card${isMarked(i) ? " marked" : ""}">
          <div class="review-card-head">
            <span class="review-index">Câu ${i + 1}</span>
            ${status}
            ${flagBadge}
            ${src}
          </div>
          <div class="review-question">${escapeHtml(q.question)}</div>
          ${aiBadgeHtml(q)}
          <div class="review-options">${opts}</div>
          ${exp}
          ${aiNoteHtml(q)}
          ${noteBox}
        </div>`;
    })
    .join("");
}

function enterReviewMode() {
  state.isReviewing = true;
  resultsSection.classList.add("hidden");
  quizSection.classList.remove("hidden");
  timerBar.classList.add("hidden");
  renderQuestion(state.currentIndex);
  updateQuestionNav();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function retryWrongOnly() {
  const wrongQuestions = state.quiz.filter(
    (q, i) => state.answers[i] !== q.correctIndex,
  );

  if (wrongQuestions.length === 0) {
    showToast("🎉 Bạn không có câu nào sai!");
    return;
  }

  state.questions = wrongQuestions.map((q) => ({
    question: q.question,
    options: q.options.map((o) => ({ label: o.label, text: o.text })),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    source: q.source,
    ai: q.ai,
    aiCheck: q.aiCheck,
    aiNote: q.aiNote,
  }));

  // Bỏ giới hạn số câu để làm hết các câu sai
  $("#opt-limit").value = "0";
  startNewQuiz(`Luyện lại ${wrongQuestions.length} câu sai`);
}

function resetToUpload() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.questions = [];
  state.quiz = [];
  state.answers = {};
  state.revealed = {};
  state.flags = {};
  state.notes = {};
  state.currentIndex = 0;
  state.isSubmitted = false;
  state.isReviewing = false;
  noteEditorOpen = false;

  pickedFiles = [];
  renderFileList();

  uploadSection.classList.remove("hidden");
  quizSection.classList.add("hidden");
  resultsSection.classList.add("hidden");
  timerBar.classList.add("hidden");
  btnHome.classList.add("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =====================================================================
 * 8. Toast & confetti
 * ===================================================================== */

let toastTimer = null;
function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function createConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const container = document.createElement("div");
  container.className = "confetti-container";
  document.body.appendChild(container);

  const colors = [
    "#e8638a",
    "#f7a8c4",
    "#ffc2d4",
    "#ff6b8a",
    "#ffb041",
    "#34c77b",
  ];

  for (let i = 0; i < 80; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "%";
    c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 2 + "s";
    c.style.animationDuration = 2 + Math.random() * 2 + "s";
    const size = 6 + Math.random() * 8;
    c.style.width = size + "px";
    c.style.height = size + "px";
    c.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    container.appendChild(c);
  }

  setTimeout(() => container.remove(), 5000);
}

/* =====================================================================
 * 9. Bàn phím
 * ===================================================================== */

document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (quizSection.classList.contains("hidden")) return;

  const key = e.key;

  if (key === "ArrowLeft") {
    e.preventDefault();
    navigateQuestion(-1);
    return;
  }
  if (key === "ArrowRight" || key === "Enter") {
    e.preventDefault();
    navigateQuestion(1);
    return;
  }
  if (key === "Escape") {
    e.preventDefault();
    if (!state.isSubmitted) submitQuiz(false);
    else showResults();
    return;
  }
  if (key.toLowerCase() === "g") {
    e.preventDefault();
    toggleFlag(state.currentIndex);
    return;
  }
  if (key.toLowerCase() === "n") {
    e.preventDefault();
    const toggle = $("#btn-note-toggle");
    if (toggle) toggle.click();
    return;
  }

  if (state.isSubmitted) return;

  const letterMap = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
  const lower = key.toLowerCase();

  let optIndex = -1;
  if (lower in letterMap) optIndex = letterMap[lower];
  else if (/^[1-6]$/.test(key)) optIndex = Number(key) - 1;

  if (optIndex >= 0) {
    e.preventDefault();
    selectOption(state.currentIndex, optIndex);
  }
});

// Cảnh báo khi đóng tab giữa lúc đang làm bài
window.addEventListener("beforeunload", (e) => {
  const doing =
    state.quiz.length > 0 &&
    !state.isSubmitted &&
    Object.keys(state.answers).length > 0;
  if (!doing) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ------------------------------ Init ------------------------------- */
state.settings = readSettings();
loadLibraryList();

/**
 * Service worker: chỉ có ở bản web tĩnh (docs/), giúp học được cả khi mất mạng
 * và cài ra màn hình chính điện thoại. Chạy bằng "Mở Quiz.bat" thì không có
 * file sw.js nên lệnh dưới thất bại im lặng — đúng như mong muốn.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* không có bản tĩnh -> bỏ qua */
    });
  });
}
