import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { build } from "esbuild";
const root = "dist/client";
async function walk(dir) {
  const files = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + d.name;
    if (d.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
const files = await walk(root);
const version = process.env.FOLIO_VERSION || new Date().toISOString();
const precache = files.map((p) => "/" + p.slice(root.length + 1));
const sw = `const CACHE=${JSON.stringify("folio-" + version)};const ASSETS=${JSON.stringify(["/", ...precache])};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('folio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin||new URL(e.request.url).pathname.startsWith('/api/'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('/'):Response.error()))));});`;
await writeFile(root + "/sw.js", sw);
files.push(root + "/sw.js");
const types = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css",
  svg: "image/svg+xml",
  png: "image/png",
  webmanifest: "application/manifest+json",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
};
const assets = {};
for (const file of files)
  assets["/" + file.slice(root.length + 1)] = {
    body: (await readFile(file)).toString("base64"),
    type: types[file.split(".").pop()] || "application/octet-stream",
  };
const source = `import {api} from '../../worker/api.js';const assets=${JSON.stringify(assets)};export default {async fetch(request,env){const u=new URL(request.url);try{if(u.pathname==='/api/vault')return await api(request,env);if(u.pathname==='/api/health')return Response.json({status:'ok',storage:!!env.BUCKET});if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const a=assets[u.pathname==='/'?'/index.html':u.pathname];if(!a)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(a.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':a.type,'Cache-Control':u.pathname==='/sw.js'?'no-cache':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}});}catch{return Response.json({error:'Service unavailable. Your device copy is unchanged.'},{status:503});}}};`;
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await writeFile("dist/server/entry.js", source);
await build({
  entryPoints: ["dist/server/entry.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Worker built with", files.length, "bundled assets.");
