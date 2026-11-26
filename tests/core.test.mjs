import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { importEntries, exportQuiver } from "../src/quiver.js";
import { demoLibrary, mergeLibraries, revise } from "../src/model.js";
import {
  createKey,
  credentials,
  encrypt,
  decrypt,
  syncLibrary,
} from "../src/sync.js";
import { api } from "../worker/api.js";
const fixture = () =>
  new Map(
    Object.entries({
      "Test.qvlibrary/meta.json": JSON.stringify({
        children: [{ uuid: "book" }],
      }),
      "Test.qvlibrary/book.qvnotebook/meta.json": JSON.stringify({
        uuid: "book",
        name: "Research",
        custom: "kept",
      }),
      "Test.qvlibrary/book.qvnotebook/note.qvnote/meta.json": JSON.stringify({
        uuid: "note",
        title: "A real note",
        tags: ["tag"],
        created_at: 100,
        updated_at: 200,
      }),
      "Test.qvlibrary/book.qvnotebook/note.qvnote/content.json": JSON.stringify(
        {
          title: "A real note",
          custom: "keep",
          cells: [
            { type: "text", data: "<p>Hello <b>world</b></p>" },
            { type: "markdown", data: "![pic](quiver-image-url/pic.png)" },
            { type: "code", language: "python", data: "print(1)" },
            {
              type: "diagram",
              diagram_type: "flowchart",
              data: "a=>start: Start",
            },
          ],
        },
      ),
      "Test.qvlibrary/book.qvnotebook/note.qvnote/resources/pic.png": "binary",
    }).map(([p, s]) => [p, new TextEncoder().encode(s)]),
  );
test("Quiver import/export round-trip preserves notebook, metadata, mixed cells and bytes", async () => {
  const { library, report } = importEntries(fixture());
  assert.equal(library.notebooks.length, 1);
  assert.equal(library.notes[0].notebookId, "book");
  assert.equal(library.notes[0].created, 100000);
  assert.ok(report.some((r) => r.includes("diagram")));
  const bytes = await exportQuiver(library);
  const zip = await JSZip.loadAsync(bytes);
  const entries = new Map();
  for (const f of Object.values(zip.files))
    if (!f.dir) entries.set(f.name, await f.async("uint8array"));
  const again = importEntries(entries).library;
  assert.deepEqual(again.notes[0].cells, library.notes[0].cells);
  assert.deepEqual(again.notes[0].resources, library.notes[0].resources);
  assert.equal(again.notebooks[0].rawMeta.custom, "kept");
  assert.equal(again.notes[0].rawContent.custom, "keep");
  assert.deepEqual(again.meta, library.meta);
});
test("Malformed import fails before partial changes", () => {
  const entries = fixture();
  entries.set("bad.qvnote/content.json", new TextEncoder().encode("{"));
  assert.throws(() => importEntries(entries));
});
test("Concurrent changes survive deterministic and repeated merge", () => {
  const base = demoLibrary(),
    a = structuredClone(base),
    b = structuredClone(base);
  a.notes[0] = revise(a.notes[0], { title: "Mac edit" });
  b.notes[0] = revise(b.notes[0], { title: "Phone edit" });
  const ab = mergeLibraries(a, b),
    ba = mergeLibraries(b, a);
  assert.deepEqual(ab.library, ba.library);
  assert.equal(ab.library.notes.length, 2);
  assert.ok(ab.library.notes.some((n) => n.title.startsWith("Mac edit")));
  assert.ok(ab.library.notes.some((n) => n.title.startsWith("Phone edit")));
  assert.equal(mergeLibraries(ab.library, b).library.notes.length, 2);
});
test("Sequential edits and deletion do not resurrect stale notes", () => {
  const a = demoLibrary(),
    b = structuredClone(a);
  b.notes[0] = revise(b.notes[0], { deleted: true });
  const result = mergeLibraries(a, b);
  assert.equal(result.library.notes.length, 1);
  assert.equal(result.library.notes[0].deleted, true);
});
test("Encryption rejects wrong key and tampered payloads", async () => {
  const a = await credentials(createKey()),
    b = await credentials(createKey()),
    l = demoLibrary(),
    cipher = await encrypt(l, a.aes);
  assert.ok(!cipher.includes("big ideas"));
  assert.deepEqual(await decrypt(cipher, a.aes), l);
  await assert.rejects(() => decrypt(cipher, b.aes));
  const body = JSON.parse(cipher);
  body.data = "AAAA" + body.data.slice(4);
  await assert.rejects(() => decrypt(JSON.stringify(body), a.aes));
});
function bucket() {
  const objects = new Map();
  return {
    async get(key) {
      const obj = objects.get(key);
      return obj ? { ...obj, body: obj.content } : null;
    },
    async put(key, content, { onlyIf }) {
      const old = objects.get(key);
      if (
        (onlyIf.etagDoesNotMatch === "*" && old) ||
        (onlyIf.etagMatches && old?.etag !== onlyIf.etagMatches)
      )
        return null;
      const etag = crypto.randomUUID(),
        obj = { etag, httpEtag: '"' + etag + '"', content };
      objects.set(key, obj);
      return obj;
    },
  };
}
test("Two devices sync, merge offline edits and keep concurrent versions", async () => {
  const env = { BUCKET: bucket() },
    key = createKey(),
    fetcher = (url, init = {}) =>
      api(new Request("https://example.test" + url, init), env);
  let mac = demoLibrary(),
    phone = demoLibrary();
  mac = (await syncLibrary(mac, key, fetcher)).library;
  phone = (await syncLibrary(phone, key, fetcher)).library;
  mac.notes[0] = revise(mac.notes[0], { title: "Mac offline" });
  phone.notes[0] = revise(phone.notes[0], { title: "Phone offline" });
  await syncLibrary(mac, key, fetcher);
  const result = await syncLibrary(phone, key, fetcher);
  assert.equal(result.library.notes.length, 2);
  assert.equal(result.conflicts.length, 1);
  mac = (await syncLibrary(mac, key, fetcher)).library;
  assert.equal(mac.notes.length, 2);
});
test("Vault rejects unauthenticated access and stale conditional writes", async () => {
  const env = { BUCKET: bucket() };
  assert.equal(
    (await api(new Request("https://example.test/api/vault"), env)).status,
    401,
  );
  const c = await credentials(createKey()),
    body = await encrypt(demoLibrary(), c.aes),
    headers = { Authorization: "Bearer " + c.token, "If-None-Match": "*" };
  const req = () =>
    new Request("https://example.test/api/vault", {
      method: "PUT",
      headers,
      body,
    });
  assert.equal((await api(req(), env)).status, 204);
  assert.equal((await api(req(), env)).status, 412);
});
