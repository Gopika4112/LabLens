import { validateScene, type Scene } from "@lablens/engine";

/**
 * Share a lab as a link: the scene graph is deflated and base64url-encoded into the hash
 * (#/lab/~<data>). Nothing is uploaded; the link itself carries the lab. Anything decoded from a
 * link goes through the same Zod + semantic validation as an AI-parsed scene.
 */
export const SHARE_PREFIX = "~";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const out = src.pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeScene(scene: Scene): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(scene));
  return SHARE_PREFIX + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeScene(arg: string): Promise<Scene> {
  if (!arg.startsWith(SHARE_PREFIX)) throw new Error("not a shared lab");
  let raw: unknown;
  try {
    const bytes = await pipe(fromBase64Url(arg.slice(SHARE_PREFIX.length)), new DecompressionStream("deflate-raw"));
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("This share link is damaged or incomplete.");
  }
  const v = validateScene(raw);
  if (!v.ok) throw new Error("This share link doesn't contain a valid lab.");
  return v.scene;
}

export async function shareUrl(scene: Scene): Promise<string> {
  const base = `${location.origin}${location.pathname}${location.search}`;
  return `${base}#/lab/${await encodeScene(scene)}`;
}
