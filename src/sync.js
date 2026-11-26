import { bytesToBase64, base64ToBytes } from "./quiver.js";
import { mergeLibraries, emptyLibrary, validateLibrary } from "./model.js";
const encoder = new TextEncoder();
export const createKey = () =>
  bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export function validateKey(key) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key))
    throw Error("Paste the complete 43-character pairing key.");
  return key;
}
const digest = async (text) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
export async function credentials(key) {
  validateKey(key);
  return {
    token: bytesToBase64(await digest("folio-auth-v1:" + key)),
    aes: await crypto.subtle.importKey(
      "raw",
      await digest("folio-encryption-v1:" + key),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    ),
  };
}
export async function encrypt(library, aes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aes,
    encoder.encode(JSON.stringify(library)),
  );
  return JSON.stringify({
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(data)),
  });
}
export async function decrypt(body, aes) {
  const p = JSON.parse(body);
  if (p.v !== 1) throw Error("Unsupported encrypted vault version.");
  return validateLibrary(
    JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(p.iv) },
          aes,
          base64ToBytes(p.data),
        ),
      ),
    ),
  );
}
export async function syncLibrary(local, key, fetcher = fetch) {
  const { token, aes } = await credentials(key);
  let merged = local,
    conflicts = [];
  for (let i = 0; i < 4; i++) {
    const response = await fetcher("/api/vault", {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!response.ok && response.status !== 404)
      throw Error(
        "Sync unavailable (" +
          response.status +
          "). Your notes are saved on this device.",
      );
    const remote =
      response.status === 404
        ? emptyLibrary()
        : await decrypt(await response.text(), aes);
    const result = mergeLibraries(merged, remote);
    merged = result.library;
    conflicts.push(...result.conflicts);
    const body = await encrypt(merged, aes);
    if (new Blob([body]).size > 20 * 1024 * 1024)
      throw Error(
        "Encrypted library exceeds the 20 MB sync limit. Local editing and export still work.",
      );
    const put = await fetcher("/api/vault", {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...(response.status === 404
          ? { "If-None-Match": "*" }
          : {
              "If-Match":
                response.headers.get("x-folio-version") ||
                response.headers.get("etag"),
            }),
      },
      body,
    });
    if (put.status === 412) continue;
    if (!put.ok)
      throw Error(
        "Sync could not save (" + put.status + "). Local copy is safe.",
      );
    return { library: merged, conflicts: [...new Set(conflicts)] };
  }
  throw Error("Another device is editing. Please sync again.");
}
