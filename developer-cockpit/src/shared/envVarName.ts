/** A POSIX-style environment variable name; anything else (e.g. a pasted key) is not one (SPEC-0063 AC-9). */
export function isValidEnvVarName(name: string | undefined): boolean {
  return typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** What Settings may save in the env-var-name field: a valid name, or empty for "no fallback". */
export function isAcceptableEnvVarField(value: string | undefined): boolean {
  return !value || isValidEnvVarName(value);
}
