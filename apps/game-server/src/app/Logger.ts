export interface Logger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

function log(level: 'debug' | 'info' | 'warn' | 'error', obj: unknown, msg?: string) {
  if (msg && typeof obj === 'object') {
    (console as any)[level](msg, obj);
  } else if (msg) {
    (console as any)[level](msg);
  } else if (typeof obj !== 'undefined') {
    (console as any)[level](obj);
  }
}

export function createConsoleLogger(): Logger {
  return {
    debug(obj, msg) {
      log('debug', obj, msg);
    },
    info(obj, msg) {
      log('info', obj, msg);
    },
    warn(obj, msg) {
      log('warn', obj, msg);
    },
    error(obj, msg) {
      log('error', obj, msg);
    },
  };
}
