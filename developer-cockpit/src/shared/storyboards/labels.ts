// Display labels derived from the current order; they are never stored in files, so reordering steps
// relabels alternate paths without rewriting any step file (source-spec §5.8).

/** 0-based step index → "1", "2", … */
export function stepLabel(stepIndex: number): string {
  return String(stepIndex + 1);
}

/** Step index and extension index → "2a", "2b", …, "2z", "2aa", … */
export function extensionLabel(stepIndex: number, extensionIndex: number): string {
  let letters = '';
  let n = extensionIndex;
  do {
    letters = String.fromCharCode(97 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${stepLabel(stepIndex)}${letters}`;
}
