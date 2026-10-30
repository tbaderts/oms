/**
 * Remove a leading YAML front matter block (OKF metadata) so the markdown renderer
 * only sees the document body. Content without a closed block is returned unchanged.
 */
export function stripFrontMatter(content: string): string {
  const text = content.replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (!match) return content;
  return text.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');
}
