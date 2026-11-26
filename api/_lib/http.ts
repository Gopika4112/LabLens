/** Small HTTP helpers shared by the serverless functions. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Best-effort per-instance rate limit (serverless instances each keep their own window). */
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, perMinute = 20): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > perMinute;
}

/**
 * Pull the first complete JSON object out of a model reply. Free models wrap JSON in ``` fences,
 * prose, stray reasoning tags (e.g. `</thought>`) or add an extra closing brace, so this scans for a
 * balanced object (string-aware) instead of trusting the first "{" and last "}".
 */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<(think|thought|thinking)>[\s\S]*?<\/\1>/gi, "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
  const sources = fenced ? [fenced[1], cleaned] : [cleaned];
  for (const body of sources) {
    for (let start = body.indexOf("{"); start >= 0; start = body.indexOf("{", start + 1)) {
      const end = balancedEnd(body, start);
      if (end < 0) continue;
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        // not valid JSON from this brace; try the next one
      }
    }
  }
  throw new Error("no JSON object in reply");
}

function balancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Free models like LaTeX and markdown; the lab's chat shows plain text. */
export function plainText(s: string): string {
  return s
    .replace(/<\/?(think|thought|thinking)>/gi, "")
    .replace(/\$\$?([^$]+?)\$\$?/g, (_, m: string) =>
      m
        .replace(/\\(?:text|mathrm)\{([^}]*)\}/g, "$1")
        .replace(/_\{?(\w+)\}?/g, "$1")
        .replace(/\\cdot/g, "·")
        .replace(/\\times/g, "×")
        .replace(/\\theta/g, "θ")
        .replace(/\\mu/g, "μ")
        .replace(/\\(?:,|;| )/g, " ")
        .replace(/[{}]/g, ""),
    )
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}
