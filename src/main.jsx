import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { get, set } from "idb-keyval";
import {
  BookOpen,
  Plus,
  Search,
  Upload,
  Download,
  Cloud,
  Check,
  FileText,
  Code2,
  Hash,
  Trash2,
  PanelLeft,
  ChevronLeft,
  MoreHorizontal,
  X,
  Paperclip,
  Lock,
  Smartphone,
  ArrowUp,
  ArrowDown,
  Copy,
  Settings2,
  Feather,
  FolderOpen,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import "./style.css";
import { demoLibrary, revise, newNote, uuid, mergeLibraries } from "./model";
import {
  importFiles,
  exportQuiver,
  bytesToBase64,
  base64ToBytes,
} from "./quiver";
import { createKey, syncLibrary, validateKey } from "./sync";
const STORE = "folio-library-v1",
  KEY = "folio-sync-key-v1";
const mime = (name) =>
  ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
  })[name.split(".").pop().toLowerCase()] || "application/octet-stream";
const time = (t) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
function renderCell(cell, resources) {
  let html = "";
  try {
    if (cell.type === "markdown") html = marked.parse(cell.data);
    else if (cell.type === "text") html = cell.data;
    else if (cell.type === "latex")
      html = katex.renderToString(cell.data, {
        throwOnError: false,
        displayMode: true,
        trust: false,
      });
    else if (cell.type === "code")
      html =
        "<pre><code>" +
        (hljs.getLanguage(cell.language || "")
          ? hljs.highlight(cell.data, { language: cell.language }).value
          : hljs.highlightAuto(cell.data).value) +
        "</code></pre>";
    else return <pre>{cell.data}</pre>;
  } catch {
    return <pre>{cell.data}</pre>;
  }
  const safe = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "iframe", "form"],
    FORBID_ATTR: ["style"],
  });
  const doc = new DOMParser().parseFromString(safe, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src") || "";
    const name = src
      .replace(/^quiver-image-url\//, "")
      .replace(/^resources\//, "");
    if (resources[name])
      img.src = `data:${mime(name)};base64,${resources[name]}`;
    else if (!src.startsWith("data:image/")) {
      img.removeAttribute("src");
      img.alt = (img.alt || "Image") + " (external image blocked)";
    }
  }
  for (const link of doc.querySelectorAll("a")) {
    const href = link.getAttribute("href") || "";
    const name = href
      .replace(/^quiver-file-url\//, "")
      .replace(/^resources\//, "");
    if (resources[name]) {
      link.href = `data:${mime(name)};base64,${resources[name]}`;
      link.download = name;
    } else if (!/^https?:|^mailto:|^quiver-note-url\/|^#/.test(href))
      link.removeAttribute("href");
    link.rel = "noopener noreferrer";
    link.target = "_blank";
  }
  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: doc.body.innerHTML }}
    />
  );
}
function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Close dialog" className="icon" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [lib, setLib] = useState(null),
    [selected, setSelected] = useState(null),
    [book, setBook] = useState("all"),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState("read"),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState("Loading…"),
    [sidebar, setSidebar] = useState(false),
    [mobileNote, setMobileNote] = useState(false),
    [syncKey, setSyncKey] = useState(""),
    [keyInput, setKeyInput] = useState(""),
    [syncStatus, setSyncStatus] = useState("Device only"),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState([]),
    [newBook, setNewBook] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  const libRef = useRef(null),
    keyRef = useRef(""),
    busyRef = useRef(false),
    saveSequence = useRef(0),
    saveChain = useRef(Promise.resolve()),
    fileRef = useRef(),
    folderRef = useRef(),
    attachRef = useRef(),
    searchRef = useRef();
  function notify(t) {
    setToast(t);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  function update(next) {
    const sequence = ++saveSequence.current;
    libRef.current = next;
    setLib(next);
    setSaved("Saving…");
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        const persist = async () => {
          const stored = await get(STORE);
          const merged = stored ? mergeLibraries(next, stored).library : next;
          await set(STORE, merged);
          return merged;
        };
        return navigator.locks
          ? navigator.locks.request("folio-save", persist)
          : persist();
      })
      .then((merged) => {
        const current = mergeLibraries(libRef.current, merged).library;
        libRef.current = current;
        setLib(current);
        if (sequence === saveSequence.current) setSaved("Saved on device");
      })
      .catch(() => {
        setSaved("Save failed — export a backup");
        notify("Device storage could not save. Export a backup now.");
      });
  }
  useEffect(() => {
    Promise.all([get(STORE), get(KEY)])
      .then(([data, key]) => {
        const l = data || demoLibrary();
        update(l);
        setSelected(l.notes.find((n) => !n.deleted)?.id);
        keyRef.current = key || "";
        setSyncKey(key || "");
        setSyncStatus(key ? "Ready to sync" : "Device only");
      })
      .catch(() =>
        notify(
          "Could not open local storage. Please allow browser storage and reload.",
        ),
      );
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  async function sync(key = keyRef.current) {
    if (!key || !libRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSyncStatus("Syncing…");
    const snapshot = libRef.current;
    try {
      await saveChain.current;
      const result = await syncLibrary(snapshot, key);
      const merged = mergeLibraries(libRef.current, result.library);
      update(merged.library);
      setSelected(
        (prev) => prev || merged.library.notes.find((n) => !n.deleted)?.id,
      );
      setSyncStatus(
        "Synced " +
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
      if (result.conflicts.length || merged.conflicts.length)
        notify("Both edits were kept. Look for a note marked “conflict copy”.");
    } catch (e) {
      setSyncStatus("Sync needs attention");
      notify(e.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const t = setInterval(() => {
      if (navigator.onLine && !document.hidden) sync();
    }, 30000);
    const focus = () => sync();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, []);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        sync();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  if (!lib)
    return (
      <div className="loading">
        <Feather /> Opening your notebook…{toast && <p>{toast}</p>}
      </div>
    );
  const note = lib.notes.find((n) => n.id === selected),
    notebooks = lib.notebooks,
    activeNotes = lib.notes.filter((n) => !n.deleted),
    trash = lib.notes.filter((n) => n.deleted);
  const notes = lib.notes
    .filter(
      (n) =>
        (book === "trash" ? n.deleted : !n.deleted) &&
        (book === "all" || book === "trash" || n.notebookId === book) &&
        (!query ||
          [n.title, ...n.tags, ...n.cells.map((c) => c.data)]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) => b.updated - a.updated);
  const currentBook = notebooks.find((b) => b.id === note?.notebookId);
  const heading =
    book === "all"
      ? "All notes"
      : book === "trash"
        ? "Trash"
        : notebooks.find((b) => b.id === book)?.name || "Notes";
  function changeNote(changes) {
    if (!note) return;
    update({
      ...libRef.current,
      notes: libRef.current.notes.map((n) =>
        n.id === note.id ? revise(n, changes) : n,
      ),
    });
  }
  function addNote() {
    let notebookId =
      book !== "all" && book !== "trash" ? book : notebooks[0]?.id;
    let l = libRef.current;
    if (!notebookId) {
      notebookId = uuid();
      l = {
        ...l,
        notebooks: [
          ...l.notebooks,
          { id: notebookId, name: "My notebook", rev: uuid(), ancestors: [] },
        ],
      };
    }
    const n = newNote(notebookId);
    update({ ...l, notes: [...l.notes, n] });
    setSelected(n.id);
    setBook(notebookId);
    setMode("edit");
    setMobileNote(true);
    setSidebar(false);
  }
  async function handleImport(files) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { library, report } = await importFiles([...files]);
      const merged = mergeLibraries(libRef.current, library);
      update(merged.library);
      setReport([
        ...report,
        ...(merged.conflicts.length
          ? ["Existing notes with the same IDs were kept as conflict copies."]
          : []),
      ]);
      setSelected(library.notes[0]?.id);
      setBook("all");
      setMode("read");
      setModal("report");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  }
  async function exportZip() {
    try {
      download(
        await exportQuiver(libRef.current),
        "Folio.qvlibrary.zip",
        "application/zip",
      );
      notify(
        "Quiver ZIP exported. Unzip it, then open the .qvlibrary package in Quiver.",
      );
    } catch (e) {
      notify(e.message);
    }
  }
  async function pair(key) {
    try {
      validateKey(key);
      await set(KEY, key);
      keyRef.current = key;
      setSyncKey(key);
      setKeyInput("");
      await sync(key);
    } catch (e) {
      notify(e.message);
    }
  }
  const words =
    note?.cells
      .map((c) => c.data)
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length || 0;
  return (
    <div
      className={
        "app " +
        (mobileNote ? "show-note " : "") +
        (sidebar ? "show-sidebar" : "")
      }
    >
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Folio home">
          <span className="brand-icon">
            <Feather size={23} />
          </span>
          folio<span className="beta">BETA</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button
          className={"nav-item " + (book === "all" ? "active" : "")}
          onClick={() => {
            setBook("all");
            setSidebar(false);
            setMobileNote(false);
          }}
        >
          <FileText size={18} />
          All notes<span>{activeNotes.length}</span>
        </button>
        <div className="section-label">
          Notebooks
          <button
            className="icon"
            aria-label="New notebook"
            onClick={() => setModal("notebook")}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="notebooks">
          {notebooks.map((b, i) => (
            <button
              key={b.id}
              className={"nav-item " + (book === b.id ? "active" : "")}
              onClick={() => {
                setBook(b.id);
                setSidebar(false);
                setMobileNote(false);
              }}
            >
              <BookOpen
                size={17}
                style={{
                  color: ["#347e68", "#b18651", "#7f78ad", "#4b8aab"][i % 4],
                }}
              />
              <span className="book-name">{b.name}</span>
              <span>
                {activeNotes.filter((n) => n.notebookId === b.id).length}
              </span>
            </button>
          ))}
        </div>
        <button
          className={"nav-item trash-nav " + (book === "trash" ? "active" : "")}
          onClick={() => {
            setBook("trash");
            setMobileNote(false);
            setSidebar(false);
          }}
        >
          <Trash2 size={17} />
          Trash<span>{trash.length}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="import-card">
            <div className="import-card-icon">
              <FolderOpen size={22} />
            </div>
            <strong>A fresh home for your notes</strong>
            <p>
              Bring your Quiver library.
              <br />
              Keep everything that matters.
            </p>
            <button onClick={() => setModal("import")}>
              <Upload size={15} />
              Import library
            </button>
          </div>
          <button className="sync-nav" onClick={() => setModal("sync")}>
            <span className="sync-icon">
              <Cloud size={19} />
            </span>
            <span>
              <strong>
                {syncKey ? "Your devices, connected" : "Make room for anywhere"}
              </strong>
              <small>{online ? syncStatus : "Offline · saved on device"}</small>
            </span>
            <Settings2 size={16} />
          </button>
          <button className="help" onClick={() => setModal("about")}>
            About Folio & installation <ExternalLink size={12} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <section className="note-list">
        <header>
          <div className="list-heading">
            <button
              className="icon mobile-only"
              aria-label="Open notebooks"
              onClick={() => setSidebar(true)}
            >
              <PanelLeft size={21} />
            </button>
            <h1>{heading}</h1>
            <button
              className="new-note"
              aria-label="New note"
              onClick={addNote}
            >
              <Plus size={19} />
            </button>
          </div>
          <div className="search">
            <Search size={17} />
            <input
              ref={searchRef}
              placeholder="Search your notes"
              aria-label="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="list-meta">
            <span>
              {notes.length} {notes.length === 1 ? "note" : "notes"}
            </span>
            <span>Last updated</span>
          </div>
        </header>
        <div className="note-items">
          {notes.map((n) => (
            <button
              className={"note-card " + (selected === n.id ? "selected" : "")}
              key={n.id}
              onClick={() => {
                setSelected(n.id);
                setMobileNote(true);
                setMode("read");
              }}
            >
              <div className="note-card-top">
                <FileText size={14} />
                <span>
                  {notebooks.find((b) => b.id === n.notebookId)?.name ||
                    "Notes"}
                </span>
              </div>
              <h3>{n.title || "Untitled note"}</h3>
              <p>
                {n.cells
                  .map((c) => c.data.replace(/<[^>]*>|[#*`>]/g, ""))
                  .join(" ")
                  .slice(0, 110) || "A blank page, a new possibility."}
              </p>
              <div className="note-card-bottom">
                <span>{time(n.updated)}</span>
                {n.tags[0] && <span className="mini-tag">{n.tags[0]}</span>}
              </div>
            </button>
          ))}
          {!notes.length && (
            <div className="empty-list">
              <Search size={25} />
              <h3>{query ? "No matching notes" : "A little room to think"}</h3>
              <p>
                {query
                  ? "Try a different word or tag."
                  : book === "trash"
                    ? "Deleted notes will appear here."
                    : "Create a note or import a notebook."}
              </p>
              {!query && book !== "trash" && (
                <button onClick={addNote}>Create a note</button>
              )}
            </div>
          )}
        </div>
        <footer>Made for your train of thought.</footer>
      </section>
      <main className="editor">
        <div className="editor-toolbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-only"
              aria-label="Back to notes"
              onClick={() => setMobileNote(false)}
            >
              <ChevronLeft size={20} />
            </button>
            <BookOpen size={16} />
            <span>{currentBook?.name || "Your notebook"}</span>
          </div>
          <div className="toolbar-actions">
            <span
              className={
                "save-status " +
                (saved.startsWith("Save failed") ? "error" : "")
              }
            >
              <Check size={14} />
              {saved}
            </span>
            <button
              className="icon"
              aria-label="Sync devices"
              title="Sync devices"
              onClick={() => setModal("sync")}
            >
              <Cloud size={19} />
            </button>
            <button
              className="icon"
              aria-label="Export library"
              title="Export library"
              onClick={() => setModal("export")}
            >
              <Download size={18} />
            </button>
          </div>
        </div>
        {note ? (
          <>
            <div className="document-scroll">
              <div
                className="document"
                onClick={(e) => {
                  const link = e.target.closest("a");
                  const href = link?.getAttribute("href") || "";
                  if (href.startsWith("quiver-note-url/")) {
                    e.preventDefault();
                    const id = href
                      .slice("quiver-note-url/".length)
                      .split("#")[0];
                    if (lib.notes.some((n) => n.id === id)) {
                      setSelected(id);
                      setMode("read");
                    } else notify("The linked note is not in this library.");
                  }
                }}
              >
                <div className="document-eyebrow">
                  <span>
                    <FileText size={14} />{" "}
                    {note.deleted ? "IN TRASH" : "YOUR NOTE"}
                  </span>
                  <div className="mode-switch">
                    <button
                      className={mode === "read" ? "selected" : ""}
                      onClick={() => setMode("read")}
                    >
                      Preview
                    </button>
                    <button
                      className={mode === "edit" ? "selected" : ""}
                      onClick={() => setMode("edit")}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <input
                  className="note-title"
                  aria-label="Note title"
                  value={note.title}
                  placeholder="Untitled note"
                  onChange={(e) => changeNote({ title: e.target.value })}
                />
                <div className="note-details">
                  <span>Updated {time(note.updated)}</span>
                  <span className="detail-divider" />
                  <span>{words} words</span>
                  <button
                    className="icon delete-note"
                    aria-label={
                      note.deleted ? "Restore note" : "Move note to trash"
                    }
                    onClick={() => {
                      changeNote({ deleted: !note.deleted });
                      notify(
                        note.deleted
                          ? "Note restored."
                          : "Moved to Trash. You can restore it anytime.",
                      );
                    }}
                  >
                    {note.deleted ? (
                      <RefreshCw size={15} />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </div>
                <div className="tag-row">
                  <Hash size={14} />
                  {mode === "edit" ? (
                    <input
                      aria-label="Tags"
                      placeholder="Add tags, separated by commas"
                      value={note.tags.join(", ")}
                      onChange={(e) =>
                        changeNote({
                          tags: e.target.value
                            .split(",")
                            .map((t) => t.trimStart()),
                        })
                      }
                    />
                  ) : note.tags.length ? (
                    note.tags.map((t) => (
                      <button
                        key={t}
                        className="tag"
                        onClick={() => {
                          setQuery(t);
                          setMobileNote(false);
                        }}
                      >
                        {t}
                      </button>
                    ))
                  ) : (
                    <span className="muted">No tags yet</span>
                  )}
                  {mode === "edit" && (
                    <select
                      aria-label="Move to notebook"
                      value={note.notebookId}
                      onChange={(e) =>
                        changeNote({ notebookId: e.target.value })
                      }
                    >
                      {notebooks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="cells">
                  {note.cells.map((cell, i) => (
                    <section
                      key={i}
                      className={"cell " + (mode === "edit" ? "editing" : "")}
                    >
                      <div className="cell-label">
                        {cell.type === "code" ? (
                          <Code2 size={13} />
                        ) : (
                          <FileText size={13} />
                        )}
                        <span>
                          {cell.type === "text"
                            ? "Rich text / HTML"
                            : cell.type === "latex"
                              ? "Math"
                              : cell.type}
                        </span>
                        {cell.type === "code" &&
                          (mode === "edit" ? (
                            <input
                              aria-label={"Language " + (i + 1)}
                              placeholder="javascript"
                              value={cell.language || ""}
                              onChange={(e) =>
                                changeNote({
                                  cells: note.cells.map((c, j) =>
                                    j === i
                                      ? { ...c, language: e.target.value }
                                      : c,
                                  ),
                                })
                              }
                            />
                          ) : (
                            <span>{cell.language}</span>
                          ))}
                        {mode === "edit" && (
                          <div className="cell-actions">
                            <button
                              className="icon"
                              disabled={i === 0}
                              aria-label={"Move cell " + (i + 1) + " up"}
                              onClick={() => {
                                const cells = [...note.cells];
                                [cells[i - 1], cells[i]] = [
                                  cells[i],
                                  cells[i - 1],
                                ];
                                changeNote({ cells });
                              }}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              className="icon"
                              disabled={i === note.cells.length - 1}
                              aria-label={"Move cell " + (i + 1) + " down"}
                              onClick={() => {
                                const cells = [...note.cells];
                                [cells[i + 1], cells[i]] = [
                                  cells[i],
                                  cells[i + 1],
                                ];
                                changeNote({ cells });
                              }}
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              className="icon"
                              aria-label={"Delete cell " + (i + 1)}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Remove this cell? Export a backup first if you need its contents.",
                                  )
                                )
                                  changeNote({
                                    cells: note.cells.filter((_, j) => j !== i),
                                  });
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      {mode === "edit" ? (
                        <textarea
                          aria-label={"Cell " + (i + 1) + " content"}
                          spellCheck={cell.type !== "code"}
                          rows={Math.max(
                            4,
                            Math.min(24, cell.data.split("\n").length + 1),
                          )}
                          value={cell.data}
                          onChange={(e) =>
                            changeNote({
                              cells: note.cells.map((c, j) =>
                                j === i ? { ...c, data: e.target.value } : c,
                              ),
                            })
                          }
                        />
                      ) : (
                        renderCell(cell, note.resources || {})
                      )}
                    </section>
                  ))}
                </div>
                {mode === "edit" && (
                  <div className="add-cell">
                    <span>Add a cell</span>
                    {["markdown", "code", "text", "latex"].map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          changeNote({
                            cells: [
                              ...note.cells,
                              {
                                type,
                                data: "",
                                ...(type === "code"
                                  ? { language: "javascript" }
                                  : {}),
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={13} />
                        {type === "latex"
                          ? "Math"
                          : type === "text"
                            ? "HTML"
                            : type}
                      </button>
                    ))}
                  </div>
                )}
                <div className="attachments">
                  {Object.entries(note.resources || {}).map(([name, data]) => (
                    <button
                      className="attachment"
                      key={name}
                      onClick={() =>
                        download(base64ToBytes(data), name, mime(name))
                      }
                    >
                      <Paperclip size={14} />
                      {name}
                      <Download size={13} />
                    </button>
                  ))}
                  {mode === "edit" && (
                    <button
                      className="attach-button"
                      onClick={() => attachRef.current.click()}
                    >
                      <Paperclip size={15} />
                      Attach a file
                    </button>
                  )}
                </div>
                <div className="document-end">
                  <span /> <Feather size={15} /> <span />
                </div>
              </div>
            </div>
            <div className="editor-footer">
              <span>
                <Lock size={12} />
                {syncKey ? "Encrypted sync enabled" : "Private on this device"}
              </span>
              <span>{note.cells.length} cells · Folio</span>
            </div>
          </>
        ) : (
          <div className="empty-editor">
            <Feather size={42} />
            <h2>A thought starts here.</h2>
            <p>Choose a note, or make a little space for something new.</p>
            <button className="primary" onClick={addNote}>
              <Plus size={16} />
              New note
            </button>
          </div>
        )}
      </main>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.json"
        hidden
        onChange={(e) => handleImport(e.target.files)}
      />
      <input
        ref={folderRef}
        type="file"
        webkitdirectory=""
        multiple
        hidden
        onChange={(e) => handleImport(e.target.files)}
      />
      <input
        ref={attachRef}
        type="file"
        hidden
        onChange={async (e) => {
          const f = e.target.files[0];
          if (!f || !note) return;
          const targetId = note.id;
          if (f.size > 10 * 1024 * 1024) {
            notify("Choose a file smaller than 10 MB.");
            return;
          }
          const name = uuid() + "-" + f.name;
          const data = bytesToBase64(new Uint8Array(await f.arrayBuffer()));
          const current = libRef.current.notes.find((n) => n.id === targetId);
          update({
            ...libRef.current,
            notes: libRef.current.notes.map((n) =>
              n.id === targetId
                ? revise(current, {
                    resources: { ...current.resources, [name]: data },
                    cells: [
                      ...current.cells,
                      {
                        type: "markdown",
                        data: f.type.startsWith("image/")
                          ? `![${f.name}](quiver-image-url/${name})`
                          : `[${f.name}](quiver-file-url/${name})`,
                      },
                    ],
                  })
                : n,
            ),
          });
          e.target.value = "";
        }}
      />
      {modal && (
        <Modal
          title={
            {
              import: "Bring your notes home",
              export: "Your notes are yours",
              sync: "Together, on every device",
              notebook: "A new notebook",
              report: "Import complete",
              about: "Meet Folio",
            }[modal]
          }
          onClose={() => setModal("")}
        >
          {modal === "import" && (
            <>
              <p>
                In Finder, right-click your <strong>.qvlibrary</strong> or{" "}
                <strong>.qvnotebook</strong> package and choose{" "}
                <strong>Compress</strong>. Select that ZIP here.
              </p>
              <div className="callout">
                <Lock size={20} />
                <span>
                  Import runs on your device. Your original Quiver library is
                  never modified. Sync is optional.
                </span>
              </div>
              <button
                className="primary wide"
                disabled={busy}
                onClick={() => fileRef.current.click()}
              >
                <Upload size={18} />
                {busy ? "Importing…" : "Choose Quiver ZIP or Folio backup"}
              </button>
              <button
                className="secondary wide"
                onClick={() => folderRef.current.click()}
              >
                <FolderOpen size={17} />
                Choose a folder instead (desktop)
              </button>
              <p className="fine">
                Up to 100 MB uncompressed. Encrypted sync supports libraries up
                to 20 MB. Start with a copied notebook to check formatting
                before migrating your full library.
              </p>
            </>
          )}
          {modal === "report" && (
            <>
              <div className="success-symbol">
                <Check />
              </div>
              {report.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              <button className="primary wide" onClick={() => setModal("")}>
                Open my notes
              </button>
            </>
          )}
          {modal === "notebook" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newBook.trim()) return;
                const id = uuid();
                update({
                  ...lib,
                  notebooks: [
                    ...lib.notebooks,
                    { id, name: newBook.trim(), rev: uuid(), ancestors: [] },
                  ],
                });
                setBook(id);
                setNewBook("");
                setModal("");
                setMobileNote(false);
              }}
            >
              <label>
                Notebook name
                <input
                  autoFocus
                  className="field"
                  placeholder="Ideas, projects, everyday things…"
                  value={newBook}
                  onChange={(e) => setNewBook(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <button className="primary wide">Create notebook</button>
            </form>
          )}
          {modal === "export" && (
            <>
              <p>
                Keep an independent copy, or take your notes back to Quiver.
              </p>
              <button className="primary wide" onClick={exportZip}>
                <Download size={18} />
                Export Quiver library (.zip)
              </button>
              <button
                className="secondary wide"
                onClick={() =>
                  download(
                    JSON.stringify(lib, null, 2),
                    "Folio-backup.json",
                    "application/json",
                  )
                }
              >
                <Download size={18} />
                Full Folio backup (.json)
              </button>
              <p className="fine">
                Quiver export contains active notes and attachments. Folio
                backup also includes trash and revision metadata. Backups are
                unencrypted files: keep them somewhere private.
              </p>
            </>
          )}
          {modal === "sync" && (
            <>
              <p>
                Write on your Mac. Pick up on your iPhone. Pair devices with one
                private key—no account required.
              </p>
              <div className="callout">
                <Lock size={20} />
                <span>
                  Notes and attachments are encrypted on your device before
                  upload. Anyone with your pairing key can read and edit this
                  library. Save it securely; there is no key recovery.
                </span>
              </div>
              {syncKey ? (
                <>
                  <label>
                    Your pairing key
                    <div className="key-line">
                      <input
                        className="field"
                        aria-label="Pairing key"
                        type="password"
                        readOnly
                        value={syncKey}
                      />
                      <button
                        className="secondary"
                        aria-label="Copy pairing key"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(syncKey);
                            notify(
                              "Pairing key copied. Paste it on your other device.",
                            );
                          } catch {
                            notify(
                              "Clipboard unavailable. Use Reveal to copy your key.",
                            );
                          }
                        }}
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        className="secondary"
                        onClick={(e) => {
                          const input =
                            e.currentTarget.parentElement.querySelector(
                              "input",
                            );
                          input.type =
                            input.type === "password" ? "text" : "password";
                        }}
                      >
                        Reveal
                      </button>
                    </div>
                  </label>
                  <button
                    className="primary wide"
                    disabled={busy || !online}
                    onClick={() => sync()}
                  >
                    <RefreshCw size={17} className={busy ? "spin" : ""} />
                    {busy ? "Syncing…" : "Sync now"}
                  </button>
                  <p className="fine">
                    {syncStatus}. Auto-sync runs every 30 seconds while this app
                    is open, and when you return to it.
                  </p>
                  <button
                    className="text-button"
                    onClick={async () => {
                      await set(KEY, "");
                      keyRef.current = "";
                      setSyncKey("");
                      setSyncStatus("Device only");
                    }}
                  >
                    Disconnect this device
                  </button>
                </>
              ) : (
                <button
                  className="primary wide"
                  onClick={() => pair(createKey())}
                >
                  <Cloud size={18} />
                  Create a synced library
                </button>
              )}
              <div className="divider">Already have a pairing key?</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  pair(keyInput.trim());
                }}
              >
                <input
                  className="field"
                  aria-label="Enter pairing key"
                  placeholder="Paste the key from your other device"
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  autoComplete="off"
                />
                <button className="secondary wide" disabled={!keyInput || busy}>
                  Connect & merge libraries
                </button>
              </form>
              <p className="fine">
                Local notes are merged, never replaced. Concurrent edits are
                kept as conflict copies. 20 MB encrypted library limit in this
                release.
              </p>
            </>
          )}
          {modal === "about" && (
            <>
              <div className="about-mark">
                <Feather size={30} />
                <span>folio</span>
              </div>
              <p>
                A quiet home for your notes. Built for Quiver libraries and the
                places your thoughts take you.
              </p>
              <h3>Install on iPhone or iPad</h3>
              <p>
                Open this site in Safari, tap Share, then{" "}
                <strong>Add to Home Screen</strong>. Open the installed app and
                use your pairing key to connect it.
              </p>
              <h3>Install on Mac</h3>
              <p>
                In Safari, choose <strong>File → Add to Dock</strong>. Chrome
                also offers “Install Folio” in its menu. Open once online to
                cache the app for offline writing.
              </p>
              <h3>First-release notes</h3>
              <p>
                Rich text uses HTML source editing. Diagram cells are preserved
                as source. Notebook navigation is flat. Sync uses encrypted
                cloud storage, not iCloud. Export backups regularly; clearing
                browser data removes the local library and key.
              </p>
              <a
                className="repo-link"
                href="https://github.com/Jameslovecs/folio-notes"
                target="_blank"
                rel="noreferrer"
              >
                Source code & native app setup <ExternalLink size={14} />
              </a>
            </>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="icon"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
