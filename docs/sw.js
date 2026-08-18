/* Tu dong sinh boi build-static.js */
const CACHE = "quiz-y-khoa-20260818163205";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./icon.svg",
  "./manifest.webmanifest",
  "./data/library.json",
  "./data/questions.json",
  "./vendor/parser.js"
];

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
