/**
 * MCP tool text that arrives as one JSON string literal, quoted and with escaped line breaks, is
 * decoded to its text (SPEC-0065). Spring AI's default result converter sent a tool's Markdown that
 * way, so a server that is not updated, or another MCP server, may still do it. Any other text
 * (plain text, a JSON object, malformed input) is returned unchanged.
 */
export function decodeToolText(text: string): string {
  const t = text.trim();
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return text;
  try {
    const decoded: unknown = JSON.parse(t);
    return typeof decoded === 'string' ? decoded : text;
  } catch {
    return text;
  }
}
