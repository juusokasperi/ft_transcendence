// src/shared/utils/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private static enabledLevels: Set<LogLevel> = new Set([
    "info",
    "warn",
    "error",
  ]);

  static setLevel(level: LogLevel) {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    const index = order.indexOf(level);
    this.enabledLevels = new Set(order.slice(index));
  }

  static log(level: LogLevel, context: string, ...args: unknown[]) {
    if (!this.enabledLevels.has(level)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
    switch (level) {
      case "debug":
        console.debug(prefix, ...args);
        break;
      case "info":
        console.info(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "error":
        console.error(prefix, ...args);
        break;
    }
  }

  static debug(ctx: string, ...a: unknown[]) {
    this.log("debug", ctx, ...a);
  }
  static info(ctx: string, ...a: unknown[]) {
    this.log("info", ctx, ...a);
  }
  static warn(ctx: string, ...a: unknown[]) {
    this.log("warn", ctx, ...a);
  }
  static error(ctx: string, ...a: unknown[]) {
    this.log("error", ctx, ...a);
  }
}

export default Logger;
