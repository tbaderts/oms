// mcpText.test.ts - MCP tool text that arrives JSON-encoded is decoded (SPEC-0065, AC-10).
import { describe, expect, it } from 'vitest';
import { decodeToolText } from '../../src/shared/mcpText';

describe('decodeToolText (SPEC-0065, AC-10)', () => {
  it('decodes a JSON-encoded tool text, leaves other text alone', () => {
    const markdown = '## Knowledge base search: "cancel order"\nMode: hybrid — 2 of 72\n\n### 1. `oms-knowledge-base/a.md#b`\n';
    // What the knowledge server sent before SPEC-0065: Spring AI serialised the String with Jackson.
    expect(decodeToolText(JSON.stringify(markdown))).toBe(markdown);
    expect(decodeToolText(`  ${JSON.stringify(markdown)}\n`)).toBe(markdown);

    expect(decodeToolText(markdown)).toBe(markdown);
    expect(decodeToolText('{"query":"x","results":[]}')).toBe('{"query":"x","results":[]}');
    expect(decodeToolText('"quoted" and more "text"')).toBe('"quoted" and more "text"');
    expect(decodeToolText('"unterminated \\')).toBe('"unterminated \\');
    expect(decodeToolText('')).toBe('');
  });
});
