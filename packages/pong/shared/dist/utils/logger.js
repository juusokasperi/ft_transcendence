class Logger {
    static enabledLevels = new Set(['info', 'warn', 'error']);
    static setLevel(level) {
        const order = ['debug', 'info', 'warn', 'error'];
        const index = order.indexOf(level);
        this.enabledLevels = new Set(order.slice(index));
    }
    static log(level, context, ...args) {
        if (!this.enabledLevels.has(level))
            return;
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
        switch (level) {
            case 'debug':
                console.debug(prefix, ...args);
                break;
            case 'info':
                console.info(prefix, ...args);
                break;
            case 'warn':
                console.warn(prefix, ...args);
                break;
            case 'error':
                console.error(prefix, ...args);
                break;
        }
    }
    static debug(ctx, ...a) {
        this.log('debug', ctx, ...a);
    }
    static info(ctx, ...a) {
        this.log('info', ctx, ...a);
    }
    static warn(ctx, ...a) {
        this.log('warn', ctx, ...a);
    }
    static error(ctx, ...a) {
        this.log('error', ctx, ...a);
    }
}
export default Logger;
//# sourceMappingURL=logger.js.map