import JSZip from "jszip";
import { uuid, emptyLibrary, validateLibrary } from "./model.js";
const MAX = 100 * 1024 * 1024;
export async function importFiles(files) {
  const entries = new Map();
  let size = 0;
  const put = (path, data) => {
    size += data.length;
    if (size > MAX)
      throw Error(
        "Import exceeds the 100 MB uncompressed limit. Split the library into notebooks.",
      );
    if (path.split("/").includes("..")) throw Error("Unsafe archive path.");
    entries.set(path, data);
  };
  if (files.length === 1 && files[0].name.endsWith(".json"))
    return {
      library: validateLibrary(JSON.parse(await files[0].text())),
      report: ["Folio backup imported."],
    };
  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
    if (files[0].size > MAX) throw Error("ZIP exceeds 100 MB.");
    const zip = await JSZip.loadAsync(await files[0].arrayBuffer());
    const all = Object.values(zip.files).filter(
      (f) => !f.dir && !f.name.includes("__MACOSX/"),
    );
    if (all.length > 20000) throw Error("Too many files in archive.");
    let expected = 0;
    for (const f of all) {
      expected += f._data?.uncompressedSize || 0;
      if (expected > MAX) throw Error("Archive expands beyond 100 MB.");
    }
    for (const f of all) put(f.name, await f.async("uint8array"));
  } else
    for (const f of files)
      put(
        f.webkitRelativePath || f.name,
        new Uint8Array(await f.arrayBuffer()),
      );
  return importEntries(entries);
}
export function importEntries(entries) {
  const library = emptyLibrary(),
    report = [];
  const decode = new TextDecoder();
  const json = (p) => JSON.parse(decode.decode(entries.get(p)));
  const books = new Map();
  for (const path of entries.keys())
    if (/\.qvnotebook\/meta\.json$/.test(path)) {
      const raw = json(path),
        id = String(raw.uuid || uuid());
      books.set(path.slice(0, -9), id);
      library.notebooks.push({
        id,
        name: String(raw.name || "Imported notebook"),
        rawMeta: raw,
        rev: uuid(),
        ancestors: [],
      });
    }
  const libraryMeta = [...entries.keys()].find((p) =>
    /\.qvlibrary\/meta\.json$/.test(p),
  );
  if (libraryMeta) library.meta = json(libraryMeta);
  for (const path of entries.keys())
    if (/\.qvnote\/content\.json$/.test(path)) {
      const dir = path.slice(0, -12),
        content = json(path),
        meta = entries.has(dir + "meta.json") ? json(dir + "meta.json") : {};
      if (
        !Array.isArray(content.cells) ||
        content.cells.some(
          (c) => typeof c.data !== "string" || typeof c.type !== "string",
        )
      )
        throw Error("Invalid cells in " + path + ". Nothing was imported.");
      const parent = dir.slice(0, dir.slice(0, -1).lastIndexOf("/") + 1);
      let notebookId = books.get(parent);
      if (!notebookId) {
        notebookId = "imported-inbox";
        if (!library.notebooks.find((b) => b.id === notebookId))
          library.notebooks.push({
            id: notebookId,
            name: "Imported notes",
            rev: uuid(),
            ancestors: [],
          });
      }
      const resources = {};
      for (const [p, data] of entries)
        if (p.startsWith(dir + "resources/"))
          resources[p.slice((dir + "resources/").length)] = bytesToBase64(data);
      const id = String(meta.uuid || uuid());
      if (library.notes.some((n) => n.id === id))
        throw Error("Duplicate note UUID: " + id);
      library.notes.push({
        id,
        notebookId,
        title: String(meta.title || content.title || "Untitled"),
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        created: Number(meta.created_at || Date.now() / 1000) * 1000,
        updated: Number(meta.updated_at || Date.now() / 1000) * 1000,
        cells: content.cells,
        resources,
        rawMeta: meta,
        rawContent: content,
        rev: uuid(),
        ancestors: [],
      });
    }
  if (!library.notes.length)
    throw Error(
      "No Quiver notes found. Compress the .qvlibrary or .qvnotebook package in Finder, then select the ZIP.",
    );
  const types = new Set(
    library.notes.flatMap((n) => n.cells.map((c) => c.type)),
  );
  report.push(
    `${library.notebooks.length} notebooks · ${library.notes.length} notes · ${library.notes.reduce((n, v) => n + Object.keys(v.resources).length, 0)} attachments`,
  );
  if (types.has("text"))
    report.push(
      "Rich text HTML preserved. Edit HTML source or preview its formatting.",
    );
  const unsupported = [...types].filter(
    (t) => !["text", "markdown", "code", "latex"].includes(t),
  );
  if (unsupported.length)
    report.push("Preserved as editable source: " + unsupported.join(", "));
  report.push(
    "Original files were not modified. Notebook hierarchy metadata is retained for export; navigation is flat in this release.",
  );
  return { library, report };
}
export const bytesToBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};
export const base64ToBytes = (s) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const safe = (s) => encodeURIComponent(s).replaceAll(".", "%2E");
export async function exportQuiver(library) {
  const zip = new JSZip();
  const root = zip.folder("Folio.qvlibrary");
  root.file("meta.json", JSON.stringify(library.meta || {}, null, 2));
  for (const b of library.notebooks) {
    const book = root.folder(safe(b.id) + ".qvnotebook");
    book.file(
      "meta.json",
      JSON.stringify({ ...b.rawMeta, name: b.name, uuid: b.id }, null, 2),
    );
    for (const n of library.notes.filter(
      (n) => n.notebookId === b.id && !n.deleted,
    )) {
      const folder = book.folder(safe(n.id) + ".qvnote");
      folder.file(
        "meta.json",
        JSON.stringify(
          {
            ...n.rawMeta,
            title: n.title,
            uuid: n.id,
            tags: n.tags,
            created_at: Math.floor(n.created / 1000),
            updated_at: Math.floor(n.updated / 1000),
          },
          null,
          2,
        ),
      );
      folder.file(
        "content.json",
        JSON.stringify(
          { ...n.rawContent, title: n.title, cells: n.cells },
          null,
          2,
        ),
      );
      for (const [name, data] of Object.entries(n.resources || {})) {
        if (name.split("/").includes("..") || name.startsWith("/"))
          throw Error("Unsafe attachment path.");
        folder.file("resources/" + name, data, { base64: true });
      }
    }
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
