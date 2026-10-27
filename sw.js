/* Service worker: bufrer selve appen for bruk uten nett, og henter bilder fra det private repoet med nøkkelen. */
const SHELL = "mp-shell-v1", ASSETS = "mp-assets";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
let CFG = null;
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("mp-shell-") && k !== SHELL) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("message", e => { if (e.data?.type === "cfg") CFG = { token: e.data.token, assets: e.data.assets || {} }; });
async function cfg() {
  if (CFG) return CFG;
  for (const c of await self.clients.matchAll()) c.postMessage({ type: "need-cfg" });
  for (let i = 0; i < 30 && !CFG; i++) await new Promise(r => setTimeout(r, 100));
  return CFG;
}
async function blob(req, id) {
  const cache = await caches.open(ASSETS); const hit = await cache.match(req); if (hit) return hit;
  const c = await cfg(); const file = c?.assets?.[id]; if (!c?.token || !file) return new Response("", { status: 404 });
  const r = await fetch(`https://api.github.com/repos/regg92s-hub/morgenpuls/contents/assets/${encodeURIComponent(file)}?ref=main`,
    { headers: { Authorization: "Bearer " + c.token, Accept: "application/vnd.github.raw+json" } });
  if (!r.ok) return new Response("", { status: r.status });
  const ext = file.split(".").pop().toLowerCase();
  const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", svg: "image/svg+xml" }[ext] || "application/octet-stream";
  const res = new Response(await r.arrayBuffer(), { headers: { "Content-Type": type, "Content-Security-Policy": "sandbox" } });
  await cache.put(req, res.clone()); return res;
}
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  const m = u.pathname.match(/\/_blob\/([0-9a-f]{32})$/);
  if (m) { e.respondWith(blob(e.request, m[1])); return; }
  if (e.request.mode === "navigate" || u.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(SHELL).then(x => x.put("index.html", c)); return r; }).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.open(SHELL).then(async c => { const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net; }));
});
