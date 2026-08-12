const FETCH_TIMEOUT_MS = 12000;
const MAX_TEXT_CHARS = 15000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string) {
  return text.replace(/&(#\d+|\w+);/g, (match, entity: string) => {
    if (entity in ENTITIES) return ENTITIES[entity];
    if (entity.startsWith("#")) {
      const code = Number(entity.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

// Best-effort, no-JS-rendering text extraction from a landing page -- fine
// since this only ever feeds ad concepts as loose extra context, nothing
// depends on it being complete. Client-side-rendered pages will yield thin
// results (just the initial HTML shell), which is a known limitation.
export async function fetchLandingPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CreativeEngineBot/1.0)" },
    });
    if (!response.ok) {
      throw new Error(`Landing page fetch returned ${response.status}`);
    }
    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  const withoutNoise = html
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const titleMatch = withoutNoise.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  const bodyText = decodeEntities(withoutNoise.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  const combined = title ? `Page title: ${title}\n\n${bodyText}` : bodyText;
  return combined.slice(0, MAX_TEXT_CHARS);
}
