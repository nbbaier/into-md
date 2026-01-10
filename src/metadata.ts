export interface FrontmatterInput {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  source: string;
}

export function buildFrontmatter(meta: FrontmatterInput): string {
  const lines = ["---"];
  if (meta.title) {
    lines.push(`title: "${escape(meta.title)}"`);
  }
  if (meta.description) {
    lines.push(`description: "${escape(meta.description)}"`);
  }
  if (meta.author) {
    lines.push(`author: "${escape(meta.author)}"`);
  }
  if (meta.date) {
    lines.push(`date: "${escape(meta.date)}"`);
  }
  lines.push(`source: "${escape(meta.source)}"`);
  lines.push("---");
  return lines.join("\n");
}

function escape(value: string): string {
  return value.replaceAll('"', String.raw`\"`);
}
