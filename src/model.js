export const uuid = () => crypto.randomUUID();
export const emptyLibrary = () => ({
  version: 1,
  notebooks: [],
  notes: [],
  meta: {},
});
export function revise(item, changes) {
  return {
    ...item,
    ...changes,
    ancestors: [
      ...new Set([...(item.ancestors || []), item.rev].filter(Boolean)),
    ],
    rev: uuid(),
    updated: Date.now(),
  };
}
export function newNote(notebookId, title = "Untitled note") {
  return {
    id: uuid(),
    notebookId,
    title,
    tags: [],
    cells: [{ type: "markdown", data: "" }],
    resources: {},
    created: Date.now(),
    updated: Date.now(),
    rev: uuid(),
    ancestors: [],
  };
}
function mergeItems(a, b, conflicts) {
  const items = new Map(a.map((i) => [i.id, i]));
  for (const remote of b) {
    const local = items.get(remote.id);
    if (!local) {
      items.set(remote.id, remote);
      continue;
    }
    if (local.rev === remote.rev) continue;
    if ((local.ancestors || []).includes(remote.rev)) continue;
    if ((remote.ancestors || []).includes(local.rev)) {
      items.set(remote.id, remote);
      continue;
    }
    // Deterministic winner and copy IDs make repeated merges idempotent.
    const [winner, other] = [local, remote].sort((x, y) =>
      x.rev.localeCompare(y.rev),
    );
    items.set(winner.id, winner);
    const id = other.id + "-conflict-" + other.rev;
    if (!items.has(id)) {
      items.set(id, {
        ...other,
        id,
        deleted: false,
        title: other.title ? other.title + " (conflict copy)" : undefined,
        name: other.name ? other.name + " (conflict copy)" : undefined,
      });
      conflicts.push(id);
    }
  }
  return [...items.values()];
}
export function mergeLibraries(a, b) {
  const conflicts = [];
  return {
    library: {
      version: 1,
      meta: { ...b.meta, ...a.meta },
      notebooks: mergeItems(a.notebooks, b.notebooks, conflicts),
      notes: mergeItems(a.notes, b.notes, conflicts),
    },
    conflicts,
  };
}
export function demoLibrary() {
  const book = {
    id: "folio-welcome",
    name: "Getting started",
    rev: "initial-book",
    ancestors: [],
  };
  return {
    version: 1,
    meta: {},
    notebooks: [book],
    notes: [
      {
        ...newNote(book.id, "A little space for big ideas"),
        id: "folio-welcome-note",
        rev: "initial-note",
        tags: ["welcome"],
        cells: [
          {
            type: "markdown",
            data: "# Your thoughts, in good company.\n\nWelcome to **Folio**. A quiet home for your notes, code snippets, and everything worth keeping.\n\nStart writing here, or bring your Quiver library along. Your notes save on this device as you type.\n\n### Make yourself at home\n\n- **Import your library** from a Quiver ZIP, keeping the original untouched.\n- **Mix your media** with Markdown, text, code, math, and attachments.\n- **Take it with you**: open Sync to pair your Mac and iPhone.\n\n> A notebook should fit the way you think.",
          },
          {
            type: "code",
            language: "javascript",
            data: 'const idea = {\n  place: "anywhere",\n  possibilities: Infinity\n};',
          },
          {
            type: "markdown",
            data: "### One small thing before you go\n\nUse **Export** to keep an independent backup. Folio is a first release: diagram cells are preserved as source, and rich-text HTML can be edited in source mode.",
          },
        ],
      },
    ],
  };
}
export function validateLibrary(l) {
  if (
    l?.version !== 1 ||
    !Array.isArray(l.notes) ||
    !Array.isArray(l.notebooks)
  )
    throw Error("This is not a Folio library.");
  for (const n of l.notes)
    if (
      typeof n.id !== "string" ||
      typeof n.rev !== "string" ||
      !Array.isArray(n.cells) ||
      n.cells.some((c) => typeof c.data !== "string")
    )
      throw Error("Invalid note in backup.");
  for (const b of l.notebooks)
    if (
      typeof b.id !== "string" ||
      typeof b.rev !== "string" ||
      typeof b.name !== "string"
    )
      throw Error("Invalid notebook in backup.");
  return l;
}
