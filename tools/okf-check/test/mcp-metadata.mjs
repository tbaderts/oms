// Port of oms-mcp-server MarkdownParser#extractMetadata
// (oms-mcp-server/src/main/java/org/example/mcp/docs/MarkdownParser.java).
// Keep in step with the Java source: same patterns, same 20-line window, last match wins.
const PATTERNS = {
  version: /^\*\*Version:\*\*\s*(.+)$/i,
  status: /^\*\*Status:\*\*\s*(.+)$/i,
  lastUpdated: /^\*\*Last Updated:\*\*\s*(.+)$/i,
  category: /^\*\*Category:\*\*\s*(.+)$/i,
};

export function extractMetadata(content) {
  const lines = content.split('\n');
  const limit = Math.min(lines.length, 20);
  const meta = { version: null, status: null, lastUpdated: null, category: null };
  for (let i = 0; i < limit; i++) {
    const line = lines[i].trim();
    for (const [key, re] of Object.entries(PATTERNS)) {
      const m = line.match(re);
      if (m) meta[key] = m[1].trim();
    }
  }
  return meta;
}
