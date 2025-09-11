type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare class Logger {
    private static enabledLevels;
    static setLevel(level: LogLevel): void;
    static log(level: LogLevel, context: string, ...args: unknown[]): void;
    static debug(ctx: string, ...a: unknown[]): void;
    static info(ctx: string, ...a: unknown[]): void;
    static warn(ctx: string, ...a: unknown[]): void;
    static error(ctx: string, ...a: unknown[]): void;
}
export default Logger;
//# sourceMappingURL=logger.d.ts.map