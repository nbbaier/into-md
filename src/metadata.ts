interface FrontmatterInput {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  source: string;
  strategy?: string;
  extraFields?: Record<string, string>;
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/;

export function parseFrontmatter(markdown: string): {
  fields: Record<string, string>;
  body: string;
} {
  const match = FRONTMATTER_REGEX.exec(markdown);
  if (!match) {
    return { fields: {}, body: markdown };
  }

  const fields: Record<string, string> = {};
  const rawBlock = match[1] ?? "";
  for (const line of rawBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    // Strip surrounding quotes
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      fields[key] = value;
    }
  }

  const body = markdown.slice(match[0].length);
  return { fields, body };
}

export function buildFrontmatter(meta: FrontmatterInput): string {
  const lines = ["---"];

  // Emit extra (server) fields first, excluding keys handled explicitly below
  const knownKeys = new Set([
    "title",
    "description",
    "author",
    "date",
    "strategy",
    "source",
  ]);
  if (meta.extraFields) {
    for (const [key, value] of Object.entries(meta.extraFields)) {
      if (!knownKeys.has(key)) {
        lines.push(`${key}: "${escapeFrontmatter(value)}"`);
      }
    }
  }

  if (meta.title) {
    lines.push(`title: "${escapeFrontmatter(meta.title)}"`);
  }
  if (meta.description) {
    lines.push(`description: "${escapeFrontmatter(meta.description)}"`);
  }
  if (meta.author) {
    lines.push(`author: "${escapeFrontmatter(meta.author)}"`);
  }
  if (meta.date) {
    lines.push(`date: "${escapeFrontmatter(meta.date)}"`);
  }
  if (meta.strategy) {
    lines.push(`strategy: "${escapeFrontmatter(meta.strategy)}"`);
  }
  lines.push(`source: "${escapeFrontmatter(meta.source)}"`);
  lines.push("---");
  return lines.join("\n");
}

function escapeFrontmatter(value: string): string {
  return value.replaceAll('"', String.raw`\"`);
}
