/* Tu dong sinh boi quiz-app/build-static.js — DUNG SUA TAY.
 * Noi dung duoi day duoc cat nguyen van tu quiz-app/server.js
 * (vung giua PARSER:BEGIN va PARSER:END) de trinh duyet dung y het server.
 * Muon sua parser: sua trong server.js roi chay lai "npm run build".
 */
(function (global) {
  "use strict";

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
 * { text, bold, isListItem, listDepth }
 */
function flattenHtml(html) {
  const lines = [];
  let buf = "";
  let boldBuf = "";
  let boldDepth = 0;
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

    if (tag === "ol" || tag === "ul") {
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

/** Tieu de muc: "I. VIEM DA DAY", "PHAN II", chu hoa toan bo... */
function isSectionHeading(text) {
  if (
    /^(?:ph[ầa]n|ch[ươuo]ng|m[ụu]c|b[àa]i|part|section|chapter)\b/i.test(text)
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
  return { stem, options: [], answerLetter: null, explanation: "" };
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

  return {
    question,
    options: options.map((o, i) => ({
      label: LETTERS[i] || o.label,
      text: o.text,
    })),
    correctIndex,
    explanation: normalizeSpace(draft.explanation) || null,
  };
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

    // --- 1) Dong "Dap an: X" -------------------------------------
    const ansMatch = text.length < 80 ? text.match(ANSWER_RE) : null;
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



  global.QuizParser = {
    parseQuestionsFromHtml: parseQuestionsFromHtml,
    dedupeKey: dedupeKey,
    normalizeSpace: normalizeSpace,
  };
})(typeof window !== "undefined" ? window : this);
