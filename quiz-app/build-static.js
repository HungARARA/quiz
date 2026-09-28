/**
 * build-static.js — Dung ban web TINH de dua len GitHub Pages (mien phi).
 * ---------------------------------------------------------------------
 * Chay:  node quiz-app/build-static.js      (hoac: npm run build)
 *
 * Ket qua nam trong thu muc  docs/  o goc workspace:
 *   docs/index.html, app.js, style.css   <- copy tu quiz-app/public
 *   docs/data/library.json               <- danh sach bo de (giong /api/library)
 *   docs/data/questions.json             <- { [id]: [cau hoi] } da doc san
 *   docs/vendor/parser.js                <- CAT tu server.js (vung PARSER:BEGIN/END)
 *   docs/vendor/mammoth.browser.min.js   <- de dien thoai tu doc file .docx
 *   docs/sw.js + manifest.webmanifest    <- chay offline, cai nhu app
 *
 * Ban tinh khong can Node/server: mo bang link la hoc duoc ngay tren dien thoai.
 */

const fs = require("fs");
const path = require("path");

const { scanLibrary, ingestDocx } = require("./server.js");

const ROOT = path.join(__dirname, ".."); // goc workspace
const PUBLIC_DIR = path.join(__dirname, "public");
const SERVER_FILE = path.join(__dirname, "server.js");
const OUT = path.join(ROOT, "docs");
const MAMMOTH_BROWSER = path.join(
  __dirname,
  "node_modules",
  "mammoth",
  "mammoth.browser.min.js",
);
const PUBLISHED_SUBJECTS = new Set([
  "TN Sâu Răng Học AI",
  "Sâu Răng Học Azota Thông Võ",
]);

/* ------------------------------------------------------------------ */

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  // Windows hay khoa file tam thoi (antivirus, Explorer dang mo thu muc...)
  // -> thu lai vai lan thay vi chet giua chung va de lai ban build cu.
  fs.rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 150,
  });
}

function mkDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  mkDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function kb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/** Cat vung parser thuan giua 2 moc trong server.js */
function extractParserSource() {
  const src = fs.readFileSync(SERVER_FILE, "utf8");
  const begin = src.indexOf("/* == PARSER:BEGIN");
  const end = src.indexOf("/* == PARSER:END");

  if (begin < 0 || end < 0 || end <= begin) {
    throw new Error(
      "Khong tim thay moc PARSER:BEGIN / PARSER:END trong server.js.\n" +
        "Hai dong comment do la ranh gioi de cat parser ra cho trinh duyet — dung xoa chung.",
    );
  }

  const body = src.slice(begin, end);

  return `/* Tu dong sinh boi quiz-app/build-static.js — DUNG SUA TAY.
 * Noi dung duoi day duoc cat nguyen van tu quiz-app/server.js
 * (vung giua PARSER:BEGIN va PARSER:END) de trinh duyet dung y het server.
 * Muon sua parser: sua trong server.js roi chay lai "npm run build".
 */
(function (global) {
  "use strict";

${body}

  global.QuizParser = {
    parseQuestionsFromHtml: parseQuestionsFromHtml,
    dedupeKey: dedupeKey,
    normalizeSpace: normalizeSpace,
  };
})(typeof window !== "undefined" ? window : this);
`;
}

/* ------------------------------------------------------------------ *
 * PWA: cho phep hoc offline va cai ra man hinh chinh dien thoai
 * ------------------------------------------------------------------ */

const MANIFEST = {
  name: "Quiz Ôn Tập Y Khoa",
  short_name: "Quiz Y Khoa",
  description:
    "Ôn tập trắc nghiệm y khoa — làm bài, ghim câu hỏi, ghi chú, random đề.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "portrait",
  background_color: "#fef7f9",
  theme_color: "#e8638a",
  icons: [
    {
      src: "./icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
};

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f7a8c4"/>
      <stop offset="50%" stop-color="#e8638a"/>
      <stop offset="100%" stop-color="#d94f7a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <text x="256" y="366" font-size="280" text-anchor="middle">🧬</text>
</svg>
`;

/**
 * Service worker: cache-first cho tai nguyen tinh.
 * Doi CACHE_VERSION moi lan build -> dien thoai tu lay ban moi.
 */
function serviceWorkerSource(version, assets) {
  return `/* Tu dong sinh boi build-static.js */
const CACHE = "quiz-y-khoa-${version}";
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // Chi cache tai nguyen cung goc, tra ve binh thuong
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch((err) => {
          // CHI mo lai trang chu khi nguoi dung dieu huong (mo trang).
          // Voi cac request du lieu (vd. api/library) phai de loi noi len,
          // neu khong app tuong server con song va khong chuyen sang che do tinh.
          if (req.mode === "navigate") return caches.match("./index.html");
          throw err;
        });
    })
  );
});
`;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

async function build() {
  console.log("");
  console.log("  ================================================");
  console.log("   Dung ban web tinh cho dien thoai");
  console.log("  ================================================");
  console.log("");

  // --- 1) Doc toan bo thu vien .docx ------------------------------
  const items = scanLibrary().filter((file) => PUBLISHED_SUBJECTS.has(file.subject));
  if (items.length === 0) {
    console.error("  [!] Khong tim thay file .docx nao. Dung build.");
    process.exit(1);
  }
  console.log(`  Tim thay ${items.length} file .docx. Dang doc...`);

  const libraryFiles = [];
  const questionsById = {};
  let totalQuestions = 0;
  const failed = [];

  for (const file of items) {
    // Moi file mot "seen" rieng: chong trung trong CUNG file, nhung van giu
    // duoc cau giong nhau o 2 file khac nhau (server gop nhieu file moi loc).
    const bucket = [];
    const seen = new Set();
    const isAzota = file.subject === "Sâu Răng Học Azota Thông Võ";
    if (!isAzota || file.name === "Bài 1") {
      const res = await ingestDocx(file.fullPath, file.name, bucket, seen);
      if (res.error || bucket.length === 0) {
        failed.push({ name: file.name, error: res.error || "khong doc duoc cau nao" });
        continue;
      }
    }

    // Keep the Azota text and option order verbatim. The generic DOCX parser
    // normalizes punctuation and inline arrows in some of these questions.
    if (isAzota) {
      const sourceName = file.name === "Bài 1"
        ? "azota-validated.json"
        : file.name === "Bài 2"
          ? "azota-bai2-validated.json"
          : file.name === "Bài 3"
            ? "azota-bai3-validated.json"
            : file.name === "Bài 4"
              ? "azota-bai4-validated.json"
          : null;
      if (!sourceName) throw new Error(`No Azota source mapping for ${file.name}`);
      const sourcePath = path.join(ROOT, file.subject, sourceName);
      const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      if (file.name === "Bài 1" && source.length !== bucket.length) {
        throw new Error(`Azota source/Word count differs: ${source.length}/${bucket.length}`);
      }
      if (["Bài 2", "Bài 3", "Bài 4"].includes(file.name)) {
        // Preserve Azota's original numbers, including any gaps from removed duplicates.
        // Count the Word question labels before publishing the validated source.
        const mammoth = require("mammoth");
        const word = await mammoth.extractRawText({ path: file.fullPath });
        const numbers = [...word.value.matchAll(/^Câu\s+(\d+)\./gm)].map((m) => Number(m[1]));
        if (numbers.length !== source.length || numbers.some((n, i) => n !== source[i].number)) {
          throw new Error(`Azota ${file.name} source/Word numbering differs: ${source.length}/${numbers.length}`);
        }
      }
      bucket.length = 0;
      for (const [index, q] of source.entries()) {
        const expectedNumber = file.name === "Bài 2" && index >= 50 ? index + 51 : index + 1;
        if (q.number !== expectedNumber || (q.answer !== null && !q.options.some((o) => o.label === q.answer))) {
          throw new Error(`Invalid Azota question ${index + 1}`);
        }
        bucket.push({
          question: q.question,
          options: q.options.map((o) => ({ label: o.label, text: o.text })),
          correctIndex: q.answer === null ? null : q.options.findIndex((o) => o.label === q.answer),
          explanation: q.explanation,
          source: file.name,
          sourceNumber: q.number,
          azotaId: q.azotaId,
        });
      }
    }

    libraryFiles.push({
      id: file.id,
      name: file.name,
      subject: file.subject,
      size: file.size,
      mtime: file.mtime,
      count: bucket.length,
    });
    questionsById[file.id] = bucket;
    totalQuestions += bucket.length;
    console.log(`    ${String(bucket.length).padStart(4)} cau  ${file.id}`);
  }

  if (libraryFiles.length === 0) {
    console.error("  [!] Khong doc duoc cau hoi nao tu file nao. Dung build.");
    process.exit(1);
  }

  // --- 2) Do file ra thu muc docs/ --------------------------------
  rmDir(OUT);
  mkDir(OUT);

  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    copyFile(path.join(PUBLIC_DIR, name), path.join(OUT, name));
  }

  mkDir(path.join(OUT, "data"));
  fs.writeFileSync(
    path.join(OUT, "data", "library.json"),
    JSON.stringify({ total: libraryFiles.length, files: libraryFiles }),
  );
  fs.writeFileSync(
    path.join(OUT, "data", "questions.json"),
    JSON.stringify(questionsById),
  );

  mkDir(path.join(OUT, "vendor"));
  fs.writeFileSync(path.join(OUT, "vendor", "parser.js"), extractParserSource());

  if (fs.existsSync(MAMMOTH_BROWSER)) {
    copyFile(MAMMOTH_BROWSER, path.join(OUT, "vendor", "mammoth.browser.min.js"));
  } else {
    console.warn(
      '  [!] Khong thay mammoth.browser.min.js — nut upload tren dien thoai se bao loi.\n' +
        '      Chay "npm install" trong quiz-app roi build lai.',
    );
  }

  // --- 3) PWA + file phu cho GitHub Pages -------------------------
  fs.writeFileSync(
    path.join(OUT, "manifest.webmanifest"),
    JSON.stringify(MANIFEST, null, 2),
  );
  fs.writeFileSync(path.join(OUT, "icon.svg"), ICON_SVG);

  // .nojekyll: bat buoc, neu khong GitHub Pages se bo qua file/thu muc la
  fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

  // Chan Google lap chi muc trang de
  fs.writeFileSync(
    path.join(OUT, "robots.txt"),
    "User-agent: *\nDisallow: /\n",
  );

  const version = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  // Cache san moi thu CAN de hoc offline.
  // Rieng mammoth (~620KB) chi dung khi upload file Word nen de tai sau,
  // tranh bat dien thoai tai them 620KB ngay lan mo dau tien.
  const assets = [
    "./",
    "./index.html",
    "./app.js",
    "./style.css",
    "./icon.svg",
    "./manifest.webmanifest",
    "./data/library.json",
    "./data/questions.json",
    "./vendor/parser.js",
  ];
  fs.writeFileSync(path.join(OUT, "sw.js"), serviceWorkerSource(version, assets));

  // --- 4) Tu kiem tra: ban build phai day du va dung ban moi nhat --
  const mustExist = [
    "index.html",
    "app.js",
    "style.css",
    "sw.js",
    "manifest.webmanifest",
    ".nojekyll",
    "data/library.json",
    "data/questions.json",
    "vendor/parser.js",
  ];
  const missing = mustExist.filter((f) => !fs.existsSync(path.join(OUT, f)));
  if (missing.length) {
    throw new Error(`Ban build thieu file: ${missing.join(", ")}`);
  }

  // So sanh app.js nguon voi ban da copy - bat truong hop copy hong/cu
  const srcApp = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8");
  const outApp = fs.readFileSync(path.join(OUT, "app.js"), "utf8");
  if (srcApp !== outApp) {
    throw new Error(
      "docs/app.js khong khop public/app.js — ban build cu chua bi ghi de.\n" +
        "Hay dong cac chuong trinh dang mo thu muc docs/ roi chay lai.",
    );
  }

  // --- 5) Bao cao -------------------------------------------------
  const qSize = sizeOf(path.join(OUT, "data", "questions.json"));
  let totalSize = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else totalSize += sizeOf(p);
    }
  };
  walk(OUT);

  console.log("");
  console.log(`  Xong! ${totalQuestions} cau tu ${libraryFiles.length} bo de.`);
  console.log(`  Kho cau hoi : ${kb(qSize)}`);
  console.log(`  Tong ban web: ${kb(totalSize)}`);
  console.log(`  Thu muc     : ${OUT}`);
  console.log(`  Phien ban SW: ${version}`);

  if (failed.length) {
    console.log("");
    console.log("  Cac file KHONG doc duoc cau hoi nao (da bo qua):");
    for (const f of failed) console.log(`    - ${f.name}: ${f.error}`);
  }

  console.log("");
  console.log("  Xem thu tren may truoc khi day len:");
  console.log("    npx serve docs        (hoac bat ky server tinh nao)");
  console.log("");
}

build().catch((err) => {
  console.error("  [!] Build that bai:", err.message);
  process.exit(1);
});
