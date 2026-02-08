interface FrontmatterInput {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  source: string;
  strategy?: string;
}

export function buildFrontmatter(meta: FrontmatterInput): string {
  const lines = ["---"];
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
