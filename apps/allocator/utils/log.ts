export function log(
  message: string,
  context?: Record<string, unknown>,
  level: 'log' | 'warn' | 'error' = 'log',
) {
  const time = new Date().toISOString();
  const prefix = `[${time}] [ALLOCATOR]`;
  const output = context
    ? `${prefix} ${message} ${JSON.stringify(context)}`
    : `${prefix} ${message}`;
  switch (level) {
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
    default:
      console.log(output);
  }
}
