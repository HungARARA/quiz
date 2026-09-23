/**
 * Quiz Ôn Tập Y Khoa - Backend
 * ------------------
 * - Upload nhieu file .docx cung luc (multer) -> parse thanh cau hoi trac nghiem
 * - Doc truc tiep thu vien .docx tu thu muc "File study GPB" (khong can upload)
 *
 * Cac dinh dang cau hoi duoc ho tro:
 *   1) Danh dau dap an dung bang emoji:   A. Noi dung ✅ (hoac ✔, ✓, ☑, √, (dung))
 *   2) Dong dap an rieng:                 Dap an: B  /  Đáp án đúng: B  /  ĐA: B
 *   3) In dam dap an dung:                A. **Noi dung**
 *   4) Danh sach long nhau (ol/ul), danh sach phang, doan van <p> + <br>
 */

const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_FILES = 60;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB / file

// Thu muc chua san bo de .docx (uu tien theo thu tu).
// App khong gioi han o mon Giai Phau Benh: bat ky thu muc con nao (o goc
// workspace, ngoai quiz-app) chua file .docx dung dinh dang deu duoc nhan,
// moi thu muc con duoc coi la 1 "mon hoc" / bo de rieng.
const WORKSPACE_ROOT = path.join(__dirname, "..");

const LIBRARY_DIRS = [
  process.env.QUIZ_LIBRARY_DIR,
  path.join(__dirname, "..", "File study GPB"), // giu tuong thich cu
  path.join(__dirname, "library"),
  WORKSPACE_ROOT, // tu dong quet moi thu muc mon hoc canh quiz-app
].filter(Boolean);

// Cac thu muc bi loai khi tu dong quet WORKSPACE_ROOT (khong phai bo de)
const IGNORED_DIR_NAMES = new Set([
  "quiz-app",
  "node_modules",
  ".git",
  ".vscode",
  "docs", // ban web tinh do ra boi build-static.js
]);

/* ------------------------------------------------------------------ *
 * Helpers chung
 * ------------------------------------------------------------------ */

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Xoa file rac con lai trong uploads/ tu lan chay truoc */
function cleanUploadDir() {
  try {
    ensureUploadDir();
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, name));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Sua loi font ten file upload (latin1 -> utf8) */
function decodeFileName(name) {
  if (!name) return "file.docx";
  try {
    const fixed = Buffer.from(name, "latin1").toString("utf8");
    // Neu chuyen doi tao ra ky tu thay the thi giu nguyen ban goc
    return fixed.includes("\uFFFD") ? name : fixed;
  } catch {
    return name;
  }
}

function baseName(fileName) {
  return String(fileName)
    .replace(/\.docx$/i, "")
    .trim();
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/* == PARSER:BEGIN ==================================================== *
 * Vung nay la parser THUAN (khong dung fs/mammoth/express).
 * `build-static.js` cat nguyen van doan giua 2 moc PARSER:BEGIN/END ra
 * file docs/vendor/parser.js de trinh duyet dien thoai dung lai y het.
 * => Sua parser o day la ca server, script build va ban web tinh cung doi.
 * KHONG dat code can `require` vao giua 2 moc nay.
 * -------------------------------------------------------------------- */

/* ------------------------------------------------------------------ *
 * HTML -> danh sach "dong" co ngu canh
 * ------------------------------------------------------------------ */

const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  middot: "\u00B7",
  bull: "\u2022",
  deg: "\u00B0",
  times: "\u00D7",
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return m;
      }
    })
    .replace(/&#(\d+);/g, (m, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return m;
      }
    })
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = HTML_ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    });
}

function normalizeSpace(str) {
  return str
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BOLD_TAGS = new Set(["strong", "b"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const BREAK_TAGS = new Set([
  "p",
  "br",
  "li",
  "ul",
  "ol",
  "div",
  "tr",
  "td",
  "th",
  "table",
  "tbody",
  "thead",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "section",
  "article",
]);

/**
 * Duyet HTML cua mammoth, tra ve mang cac dong:
 * { text, bold, isListItem, listDepth, isHeading }
 */
function flattenHtml(html) {
  const lines = [];
  let buf = "";
  let boldBuf = "";
  let boldDepth = 0;
  let headingDepth = 0;
  let listDepth = 0;
  let inListItem = false;

  const flush = () => {
    const text = normalizeSpace(decodeEntities(buf));
    const bold = normalizeSpace(decodeEntities(boldBuf));
    buf = "";
    boldBuf = "";
    if (text) {
      lines.push({
        text,
        bold,
        isListItem: inListItem,
        listDepth: inListItem ? Math.max(listDepth, 1) : 0,
        isHeading: headingDepth > 0,
      });
    }
  };

  const addText = (txt) => {
    if (!txt) return;
    buf += txt;
    if (boldDepth > 0) boldBuf += txt;
  };

  const tagRe = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let cursor = 0;
  let m;

  while ((m = tagRe.exec(html)) !== null) {
    addText(html.slice(cursor, m.index));
    cursor = m.index + m[0].length;

    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();

    if (BOLD_TAGS.has(tag)) {
      if (closing) boldDepth = Math.max(0, boldDepth - 1);
      else boldDepth++;
      continue;
    }

    if (!BREAK_TAGS.has(tag)) continue;

    flush();

    if (HEADING_TAGS.has(tag)) {
      headingDepth += closing ? -1 : 1;
      headingDepth = Math.max(0, headingDepth);
    } else if (tag === "ol" || tag === "ul") {
      if (closing) {
        listDepth = Math.max(0, listDepth - 1);
        inListItem = listDepth > 0;
      } else {
        listDepth++;
        inListItem = false;
      }
    } else if (tag === "li") {
      inListItem = !closing ? true : listDepth > 0;
    }
  }

  addText(html.slice(cursor));
  flush();

  return lines;
}

/* ------------------------------------------------------------------ *
 * Nhan dien cac loai dong
 * ------------------------------------------------------------------ */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

// Dau hieu dap an dung ngay tren dong lua chon
const CORRECT_MARK_RE =
  /(?:\u2705|\u2714\uFE0F?|\u2713|\u2611\uFE0F?|\uD83D\uDDF9|\u221A|\(\s*(?:đúng|dung|correct)\s*\))/u;

// A. / A) / (A) / A- / A:
const OPTION_RE = /^\(?\s*([A-Ea-e])\s*[).．:\-\u2013\]]\s*(.+)$/;

// Cau 1: / Cau hoi 1. / Q1) / 1.
const QUESTION_LABEL_RE =
  /^(?:c[âa]u(?:\s*h[ỏo]i)?|question|quest|q)\s*[:.\-]?\s*(\d+)\s*[).:\-\u2013]?\s*(.*)$/i;
const QUESTION_NUMBER_RE = /^(\d{1,3})\s*[).:\-\u2013]\s*(.+)$/;

// Dap an: B / Đáp án đúng: B / ĐA: B / Answer: B / Key: B
const ANSWER_RE =
  /^[*\s]*(?:đ[áa]p\s*[áa]n(?:\s*đ[úu]ng)?|đ\s*\/?\s*a|answer|ans|key|ch[ọo]n)\s*(?:l[àa])?\s*[:.\-\u2013]?\s*\(?\s*([A-Ea-e])\s*\)?(?![\p{L}])/iu;

// Giai thich / Explanation
const EXPLANATION_RE =
  /^(?:gi[ảa]i\s*th[íi]ch|explanation|explain|l[ýy]\s*gi[ảa]i|nh[ậa]n\s*x[ée]t|ghi\s*ch[úu]|note)\s*[:.\-\u2013]?\s*(.*)$/i;

// Ghi chu do tool "do dap an" chen vao ngay duoi cac lua chon:
//   "( Cau nay AI lam ) - dap an AI: C. <ly do>"
// Nghia la dap an cau nay do AI suy luan, KHONG phai lay tu ngan hang de.
const AI_NOTE_RE =
  /^\(\s*c[âa]u\s*n[àa]y\s*AI\s*l[àa]m\s*\)\s*[-–—:.]*\s*(.*)$/iu;

// Trong ghi chu do, neu co "Ngan hang web goi y X" nghia la AI chon KHAC
// voi ngan hang de -> nen kiem tra lai cau nay truoc tien.
const AI_DIFF_RE = /ng[âa]n\s*h[àa]ng\s*web\s*g[ợo]i\s*[ýy]/iu;

/**
 * Bo moi cum co nhac den CHU CAI dap an trong ghi chu:
 *   "dap an AI: C."  |  "Ly do chon C:"  |  "Ngan hang web goi y D nhung..."
 * Chu cai do la thu tu GOC trong file Word, ma web co the dao thu tu dap an,
 * nen giu lai chi lam nguoi hoc doc nham. Dap an dung da co dau ✅, con viec
 * "AI chon khac ngan hang de" da duoc bao bang co aiCheck roi.
 * Phan con lai - ly do AI dua ra - moi la thu dang giu.
 */
function cleanAiNote(text) {
  return normalizeSpace(
    String(text || "")
      .replace(
        /^đ[áa]p\s*[áa]n\s*AI\s*[:.\-–]?\s*[A-Ea-e]\s*[).:\-–]?\s*/iu,
        "",
      )
      .replace(
        /ng[âa]n\s*h[àa]ng\s*web\s*g[ợo]i\s*[ýy][^.]*\.\s*/giu,
        "",
      )
      .replace(/l[ýy]\s*do\s*ch[ọo]n\s*[A-Ea-e]\s*[:.\-–]\s*/giu, ""),
  );
}

function stripCorrectMarks(text) {
  return normalizeSpace(
    text
      .replace(/[\u2705\u2714\u2713\u2611\u221A\uFE0F]/g, " ")
      .replace(/\uD83D\uDDF9/g, " ")
      .replace(/\(\s*(?:đúng|dung|correct)\s*\)/gi, " ")
      .replace(/^\**\s*|\s*\**$/g, ""),
  );
}

function cleanStem(text) {
  let out = text;

  // Bo tien to "Cau 12:" / "Question 3." ...
  const label = out.match(QUESTION_LABEL_RE);
  if (label) out = label[2];

  // Bo tien to danh so "12." / "12)" con lai
  const num = out.match(QUESTION_NUMBER_RE);
  if (num) out = num[2];

  out = out.replace(/^[\s.:)\-\u2013]+/, "");
  out = stripCorrectMarks(out);
  out = out.replace(/[:\s]+$/, "");
  return normalizeSpace(out);
}

/** Tieu de muc: "I. VIEM DA DAY", "PHAN II", "TRAM 2 (Cau 15 - 28)", chu hoa toan bo... */
function isSectionHeading(text) {
  // Tu khoa tieu de PHAI di kem so thu tu ("Tram 4", "Phan II", "Bai 3").
  // Neu chi doi tu khoa o dau dong thi cac cau hoi mo dau bang "Muc dich...",
  // "Muc tieu...", "Bai tiet..." bi hieu nham la tieu de: de bai that bi bo
  // qua va cau hoi doi lay dong phia tren (vd. "TRAM 4 (CAU 37-48)") lam de.
  if (
    /^(?:ph[ầa]n|ch[ươuo]ng|m[ụu]c|b[àa]i|tr[ạa]m|part|section|chapter|station)\s*[:.\-–]?\s*(?:\d+|[IVXLC]{1,6})(?![\p{L}\p{N}])/iu.test(
      text,
    )
  )
    return true;
  if (/^[IVXLC]+\s*[.).\-\u2013:]/.test(text)) return true;
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (
    letters.length >= 3 &&
    letters === letters.toUpperCase() &&
    text.length <= 90
  )
    return true;
  return false;
}

function letterIndex(label) {
  return LETTERS.indexOf(String(label || "").toUpperCase());
}

/** Chon de bai tot nhat tu cac dong text dang cho */
function pickStem(pendingLines) {
  if (!pendingLines.length) return "";

  const texts = pendingLines.map((p) => p.text);
  let i = texts.length - 1;

  // Uu tien dong cuoi khong phai tieu de muc
  while (i > 0 && isSectionHeading(texts[i])) i--;

  let stem = texts[i];
  const meaningful = (s) => s.replace(/[^\p{L}\p{N}]/gu, "").length;

  // Neu qua ngan -> ghep them dong phia truoc (de bai bi ngat dong)
  while (meaningful(stem) < 12 && i > 0 && !isSectionHeading(texts[i - 1])) {
    i--;
    stem = normalizeSpace(`${texts[i]} ${stem}`);
  }

  return cleanStem(stem);
}

function isMeaningfulBold(bold, optionText) {
  if (!bold) return false;
  const boldLetters = bold.replace(/[^\p{L}\p{N}]/gu, "");
  const optLetters = optionText.replace(/[^\p{L}\p{N}]/gu, "");
  if (boldLetters.length < 2) return false;
  // Bo qua truong hop chi in dam nhan "A."
  return boldLetters.length >= Math.min(3, optLetters.length);
}

/* ------------------------------------------------------------------ *
 * Parser chinh
 * ------------------------------------------------------------------ */

function createDraft(stem) {
  return {
    stem,
    options: [],
    answerLetter: null,
    explanation: "",
    aiAnswer: false, // dap an do AI suy luan
    aiCheck: false, // ... va khac voi goi y cua ngan hang de
    aiNote: "", // ly do AI dua ra
  };
}

function addOption(draft, label, rawText, line) {
  const marked =
    CORRECT_MARK_RE.test(rawText) || CORRECT_MARK_RE.test(line.bold || "");
  const text = stripCorrectMarks(rawText);
  if (!text) return;
  draft.options.push({
    label:
      label ||
      LETTERS[draft.options.length] ||
      String(draft.options.length + 1),
    text,
    marked,
    bold: isMeaningfulBold(line.bold, text),
  });
}

function finalizeDraft(draft, stats) {
  if (!draft) return null;

  const question = normalizeSpace(draft.stem);
  const options = draft.options;

  if (question.length < 5 || options.length < 2) {
    if (question.length >= 5 && options.length > 0) stats.skipped++;
    return null;
  }

  let correctIndex = options.findIndex((o) => o.marked);

  if (correctIndex < 0 && draft.answerLetter) {
    const letter = draft.answerLetter.toUpperCase();
    correctIndex = options.findIndex(
      (o) => String(o.label).toUpperCase() === letter,
    );
    if (correctIndex < 0) {
      const byPosition = LETTERS.indexOf(letter);
      if (byPosition >= 0 && byPosition < options.length)
        correctIndex = byPosition;
    }
  }

  if (correctIndex < 0) {
    const boldOnes = options.filter((o) => o.bold);
    if (boldOnes.length === 1) correctIndex = options.indexOf(boldOnes[0]);
  }

  if (correctIndex < 0 || correctIndex >= options.length) {
    stats.skipped++;
    stats.noAnswer++;
    return null;
  }

  const out = {
    question,
    options: options.map((o, i) => ({
      label: LETTERS[i] || o.label,
      text: o.text,
    })),
    correctIndex,
    explanation: normalizeSpace(draft.explanation) || null,
  };

  // Chi gan khi that su co ghi chu AI, de kho cau hoi khong phinh them
  if (draft.aiAnswer) {
    out.ai = true;
    if (draft.aiCheck) out.aiCheck = true;
    const note = cleanAiNote(draft.aiNote);
    if (note) out.aiNote = note;
  }

  return out;
}

/**
 * Parser huong "lua chon":
 * - Cac dong text thuong duoc gom vao `pending` (ung vien de bai).
 * - Khi gap dong "A. ..." -> chot de bai tu `pending` va mo cau hoi moi.
 * - Khi dang trong cau hoi ma gap lai nhan <= nhan truoc (vd A sau D) -> cau hoi moi.
 */
function parseQuestionsFromHtml(html) {
  const lines = flattenHtml(html);
  const stats = { skipped: 0, noAnswer: 0 };
  const questions = [];

  let draft = null;
  let pending = []; // cac dong text co the la de bai
  let lastLetterIdx = -1;

  const commit = () => {
    const q = finalizeDraft(draft, stats);
    if (q) questions.push(q);
    draft = null;
    lastLetterIdx = -1;
  };

  for (const line of lines) {
    const text = line.text;
    if (!text || text.length < 2) continue;

    // Mammoth bieu dien cac tieu de muc bang <h1>...<h6>. Giu ranh gioi
    // nay de "Van dung" khong bi ghep vao lua chon cuoi cua cau truoc.
    // Neu dong heading co nhan cau hoi, van xu ly nhu mot de bai binh thuong.
    if (
      line.isHeading &&
      !QUESTION_LABEL_RE.test(text) &&
      !QUESTION_NUMBER_RE.test(text)
    ) {
      commit();
      pending = [];
      continue;
    }

    // --- 0) Ghi chu "( Cau nay AI lam )" -------------------------
    // Dong nay khong phai de bai cung khong phai lua chon. Truoc day no roi
    // vao `pending` roi co luc bi lay lam DE BAI cua cau ke tiep (K44 cau 8).
    // Gio danh dau cau dang mo la "dap an do AI lam" roi bo qua dong do.
    const aiMatch = text.match(AI_NOTE_RE);
    if (aiMatch) {
      if (draft) {
        draft.aiAnswer = true;
        if (AI_DIFF_RE.test(text)) draft.aiCheck = true;
        draft.aiNote = normalizeSpace(`${draft.aiNote} ${aiMatch[1] || ""}`);
      }
      continue;
    }

    // --- 1) Dong "Dap an: X" -------------------------------------
    // Gioi han do dai chi de tranh nhan nham 1 doan van dai. Nguong cu 80
    // qua chat: dong 'Dap an: A (trang 47, Pocket Companion to Robbins...)'
    // dai 86 ky tu nen bi bo qua, roi bi hieu nham thanh mot LUA CHON va
    // duoc cham la dap an dung -> nguoi hoc tra loi dung van bi bao sai.
    // ANSWER_RE neo dau dong va doi ngay 1 chu cai A-E khong dinh chu khac,
    // nen noi nguong ra 200 van rat kho nhan nham.
    const ansMatch = text.length < 200 ? text.match(ANSWER_RE) : null;
    if (ansMatch) {
      if (draft) draft.answerLetter = ansMatch[1];
      continue;
    }

    // --- 2) Dong giai thich --------------------------------------
    const expMatch = text.match(EXPLANATION_RE);
    if (expMatch) {
      if (draft) {
        draft.explanation = normalizeSpace(
          `${draft.explanation} ${expMatch[1] || ""}`,
        );
      }
      continue;
    }

    // --- 3) Dong lua chon "A. ..." -------------------------------
    const optMatch = text.match(OPTION_RE);
    if (optMatch) {
      const idx = letterIndex(optMatch[1]);

      // Bat dau bo lua chon moi khi: chua co cau hoi, hoac nhan lui ve (A sau D)
      if (!draft || idx <= lastLetterIdx) {
        commit();
        draft = createDraft(pickStem(pending));
        pending = [];
      }

      addOption(
        draft,
        LETTERS[idx] || optMatch[1].toUpperCase(),
        optMatch[2],
        line,
      );
      lastLetterIdx = idx;
      continue;
    }

    // --- 4) Item danh sach con, thieu nhan chu cai ---------------
    if (
      draft &&
      draft.options.length > 0 &&
      line.isListItem &&
      line.listDepth >= 2 &&
      text.length <= 120 &&
      !/[?]$/.test(text) &&
      !isSectionHeading(text)
    ) {
      addOption(draft, null, text, line);
      lastLetterIdx = draft.options.length - 1;
      continue;
    }

    // --- 5) Dong text thuong ------------------------------------
    if (draft && draft.options.length > 0) {
      // Co the la dong noi tiep (wrap) cua lua chon cuoi
      const isContinuation =
        !line.isListItem &&
        text.length < 60 &&
        !/[?:]$/.test(text) &&
        !isSectionHeading(text) &&
        !QUESTION_LABEL_RE.test(text) &&
        !QUESTION_NUMBER_RE.test(text);

      if (isContinuation) {
        const last = draft.options[draft.options.length - 1];
        last.text = normalizeSpace(`${last.text} ${stripCorrectMarks(text)}`);
        if (CORRECT_MARK_RE.test(text)) last.marked = true;
        continue;
      }
      commit();
    }

    pending.push({ text, isListItem: line.isListItem, depth: line.listDepth });
    if (pending.length > 4) pending.shift();
  }

  commit();
  return { questions, stats };
}

/* ------------------------------------------------------------------ *
 * Doc & gop nhieu file
 * ------------------------------------------------------------------ */

function dedupeKey(q) {
  const opts = q.options
    .map((o) => o.text.toLowerCase())
    .sort()
    .join("|");
  return `${q.question.toLowerCase()}::${opts}`;
}

/* == PARSER:END ====================================================== */

/**
 * Doc 1 file docx -> { name, count, skipped, error }
 * Cau hoi duoc day vao `bucket` (co kiem tra trung lap qua `seen`)
 */
async function ingestDocx(filePath, displayName, bucket, seen) {
  const result = { name: displayName, count: 0, skipped: 0, error: null };
  try {
    const { value: html, messages } = await mammoth.convertToHtml({
      path: filePath,
    });
    if (messages && messages.length) {
      const errs = messages.filter((x) => x.type === "error");
      if (errs.length)
        console.warn(
          `[mammoth] ${displayName}:`,
          errs.map((x) => x.message).join("; "),
        );
    }

    const { questions, stats } = parseQuestionsFromHtml(html);
    result.skipped = stats.skipped;

    for (const q of questions) {
      const key = dedupeKey(q);
      if (seen.has(key)) {
        result.skipped++;
        continue;
      }
      seen.add(key);
      bucket.push({ ...q, source: displayName });
      result.count++;
    }
  } catch (err) {
    console.error(`Loi doc file "${displayName}":`, err.message);
    result.error = err.message;
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Thu vien de co san tren may
 * ------------------------------------------------------------------ */

function scanLibrary() {
  const found = new Map(); // id -> info
  const seenPaths = new Set(); // normalized fullPath, tranh trung lap giua nhieu root

  // subject = ten thu muc con cap 1 chua file (dung de nhom theo "mon hoc").
  // Neu file nam ngay trong thu muc goc thi lay ten thu muc goc lam subject.
  const walk = (root, current, depth, topLevelIgnored) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        if (depth === 0 && topLevelIgnored && topLevelIgnored.has(entry.name))
          continue;
        if (entry.name === "node_modules") continue;
        walk(root, full, depth + 1, topLevelIgnored);
      } else if (entry.isFile()) {
        if (!/\.docx$/i.test(entry.name) || entry.name.startsWith("~$"))
          continue;

        const normFull = path.normalize(full).toLowerCase();
        if (seenPaths.has(normFull)) continue;
        seenPaths.add(normFull);

        const id = path.relative(root, full).split(path.sep).join("/");
        let stat = null;
        try {
          stat = fs.statSync(full);
        } catch {
          /* ignore */
        }
        const relParts = id.split("/");
        const subject =
          relParts.length > 1 ? relParts[0] : baseName(path.basename(root));
        found.set(id, {
          id,
          name: baseName(entry.name),
          subject,
          fullPath: full,
          size: stat ? stat.size : 0,
          mtime: stat ? stat.mtimeMs : 0,
        });
      }
    }
  };

  for (const dir of LIBRARY_DIRS) {
    if (!dir || !fs.existsSync(dir)) continue;
    const ignored = dir === WORKSPACE_ROOT ? IGNORED_DIR_NAMES : null;
    walk(dir, dir, 0, ignored);
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/* ------------------------------------------------------------------ *
 * Middleware & Routes
 * ------------------------------------------------------------------ */

ensureUploadDir();
cleanUploadDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const safe = decodeFileName(file.originalname).replace(
      /[^\p{L}\p{N}. _-]/gu,
      "_",
    );
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const name = decodeFileName(file.originalname);
    const okExt = /\.docx$/i.test(name);
    const okMime =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "application/zip";
    if (okExt && okMime) return cb(null, true);
    return cb(
      new Error(
        `File "${name}" khong hop le. Chi chap nhan .docx (khong ho tro .doc cu)`,
      ),
    );
  },
});

app.use(express.json({ limit: "1mb" }));
app.use(
  express.static(path.join(__dirname, "public"), { extensions: ["html"] }),
);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    libraryDirs: LIBRARY_DIRS.filter((d) => fs.existsSync(d)),
  });
});

/** Danh sach file .docx co san tren may */
app.get("/api/library", (req, res) => {
  const items = scanLibrary();
  res.json({
    dirs: LIBRARY_DIRS.filter((d) => fs.existsSync(d)),
    total: items.length,
    files: items.map(({ id, name, subject, size, mtime }) => ({
      id,
      name,
      subject,
      size,
      mtime,
    })),
  });
});

/** Nap cau hoi tu thu vien tren may: { ids: [...] } (rong = nap tat ca) */
app.post("/api/library/load", async (req, res, next) => {
  try {
    const items = scanLibrary();
    if (items.length === 0) {
      return res.status(404).json({
        error:
          'Khong tim thay file .docx nao trong thu vien. Hay dat file (.docx dung dinh dang) vao mot thu muc mon hoc canh thu muc quiz-app, hoac vao thu muc "File study GPB".',
      });
    }

    const requested = Array.isArray(req.body && req.body.ids)
      ? req.body.ids
      : [];
    const targets = requested.length
      ? items.filter((f) => requested.includes(f.id))
      : items;

    if (targets.length === 0) {
      return res.status(400).json({ error: "Khong co file nao duoc chon." });
    }

    const bucket = [];
    const seen = new Set();
    const fileResults = [];

    for (const file of targets) {
      fileResults.push(
        await ingestDocx(file.fullPath, file.name, bucket, seen),
      );
    }

    if (bucket.length === 0) {
      return res.status(422).json({
        error:
          'Khong doc duoc cau hoi nao. Vui long kiem tra dinh dang de (dap an can duoc danh dau ✅ hoac ghi "Dap an: X").',
        files: fileResults,
      });
    }

    res.json({
      totalQuestions: bucket.length,
      questions: bucket,
      files: fileResults,
    });
  } catch (err) {
    next(err);
  }
});

/** Upload nhieu file .docx cung luc */
app.post("/api/upload", (req, res, next) => {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (err) return next(err);
    handleUpload(req, res, next);
  });
});

async function handleUpload(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    if (files.length === 0) {
      return res.status(400).json({
        error: "Chua chon file nao. Vui long chon it nhat 1 file .docx.",
      });
    }

    const bucket = [];
    const seen = new Set();
    const fileResults = [];

    for (const file of files) {
      const displayName = baseName(decodeFileName(file.originalname));
      fileResults.push(await ingestDocx(file.path, displayName, bucket, seen));
    }

    if (bucket.length === 0) {
      return res.status(422).json({
        error:
          'Khong tim thay cau hoi nao trong cac file da chon. Dap an can duoc danh dau ✅ hoac ghi "Dap an: X".',
        files: fileResults,
      });
    }

    res.json({
      totalQuestions: bucket.length,
      questions: bucket,
      files: fileResults,
    });
  } catch (err) {
    next(err);
  } finally {
    files.forEach((f) => safeUnlink(f.path));
  }
}

// 404 cho API
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API khong ton tai" }),
);

// Error handler
app.use((err, req, res, next) => {
  if (Array.isArray(req.files)) req.files.forEach((f) => safeUnlink(f.path));

  if (err instanceof multer.MulterError) {
    const map = {
      LIMIT_FILE_SIZE: `File qua lon. Toi da ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB moi file.`,
      LIMIT_FILE_COUNT: `Qua nhieu file. Toi da ${MAX_FILES} file moi lan.`,
      LIMIT_UNEXPECTED_FILE: 'Ten truong file khong dung (can dung "files").',
    };
    return res
      .status(400)
      .json({ error: map[err.code] || `Loi upload: ${err.message}` });
  }

  console.error(err);
  res
    .status(500)
    .json({ error: err.message || "Loi khong xac dinh tren server" });
});

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

// Chi khoi dong server khi chay truc tiep (`node server.js`),
// khong khoi dong khi bi require tu script test.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    const libs = LIBRARY_DIRS.filter((d) => fs.existsSync(d));
    console.log("");
    console.log("  ==========================================");
    console.log("   Quiz On Tap Y Khoa server da san sang!");
    console.log("  ==========================================");
    console.log(`   Dia chi : http://localhost:${PORT}`);
    console.log(
      `   Thu vien: ${libs.length ? libs.join(" | ") : "(khong tim thay)"}`,
    );
    console.log("   Ctrl+C de dung server");
    console.log("");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error("");
      console.error(
        `  [!] Port ${PORT} dang bi chiem - co the server da chay san.`,
      );
      console.error(`      Hay mo truc tiep: http://localhost:${PORT}`);
      console.error("      Hoac dong tien trinh node cu roi thu lai.");
      console.error("");
      process.exit(1);
    }
    console.error("Loi server:", err);
    process.exit(1);
  });

  const shutdown = () => {
    console.log("\n  Dang dung server...");
    cleanUploadDir();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Tranh crash toan bo app vi 1 loi le
  process.on("uncaughtException", (err) =>
    console.error("uncaughtException:", err),
  );
  process.on("unhandledRejection", (err) =>
    console.error("unhandledRejection:", err),
  );
}

module.exports = {
  app,
  parseQuestionsFromHtml,
  flattenHtml,
  // Dung boi build-static.js de dung ban web tinh cho dien thoai
  scanLibrary,
  ingestDocx,
  dedupeKey,
};
