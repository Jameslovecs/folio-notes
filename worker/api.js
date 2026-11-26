const MAX = 20 * 1024 * 1024;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function api(request, env) {
  if (!env.BUCKET)
    return json({ error: "Sync storage is not configured." }, 503);
  if (!["GET", "PUT"].includes(request.method))
    return json({ error: "Method not allowed" }, 405);
  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer [A-Za-z0-9+/]{43}=$/.test(auth))
    return json({ error: "A pairing credential is required." }, 401);
  const key =
    "vaults/" +
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(auth)),
      ),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  if (request.method === "GET") {
    const obj = await env.BUCKET.get(key);
    if (!obj) return json({ error: "Not found" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": "application/json",
        ETag: obj.httpEtag,
        "X-Folio-Version": obj.etag,
        "Cache-Control": "no-store",
      },
    });
  }
  const match = request.headers.get("If-Match"),
    none = request.headers.get("If-None-Match");
  if (!match && none !== "*")
    return json({ error: "Conditional update required" }, 428);
  if (Number(request.headers.get("Content-Length")) > MAX)
    return json({ error: "20 MB sync limit" }, 413);
  // Bound chunked requests too, before buffering or parsing the entire payload.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Body required" }, 400);
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX) {
      await reader.cancel();
      return json({ error: "20 MB sync limit" }, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const body = new TextDecoder().decode(bytes);
  try {
    const p = JSON.parse(body);
    if (
      p.v !== 1 ||
      typeof p.iv !== "string" ||
      !/^[A-Za-z0-9+/]{16}$/.test(p.iv) ||
      typeof p.data !== "string" ||
      p.data.length < 24 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(p.data)
    )
      return json({ error: "Encrypted payload required" }, 400);
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }
  const obj = await env.BUCKET.put(key, body, {
    onlyIf: match
      ? { etagMatches: match.replace(/^W\//, "").replaceAll('"', "") }
      : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  if (!obj) return json({ error: "Library changed; merge and retry" }, 412);
  return new Response(null, {
    status: 204,
    headers: { ETag: obj.httpEtag, "Cache-Control": "no-store" },
  });
}
