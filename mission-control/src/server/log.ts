/**
 * JSON-line logger. Every line carries a level, a message and the context fields given (runId,
 * orderId, clOrdId, …), so a run can be followed with a plain grep.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

type Sink = (line: string) => void;

export function createLogger(base: Fields = {}, sink: Sink = (l) => process.stdout.write(l + '\n')): Logger {
  const write = (level: Level, msg: string, fields?: Fields) => {
    const entry: Fields = { ts: new Date().toISOString(), level, msg, ...base, ...fields };
    if (entry.err instanceof Error) entry.err = { message: entry.err.message, stack: entry.err.stack };
    sink(JSON.stringify(entry));
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (f) => createLogger({ ...base, ...f }, sink),
  };
}

export const silentLogger: Logger = createLogger({}, () => {});
