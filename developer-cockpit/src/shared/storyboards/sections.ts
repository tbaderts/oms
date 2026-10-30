/** The body of the `## <name>` section (until the next heading of level ≤ 2), trimmed; '' when absent. */
export function sectionOf(body: string, name: string): string {
  const lines = body.split(/\r?\n/);
  const wanted = name.toLowerCase();
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase() === wanted);
  if (start < 0) return '';
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}
