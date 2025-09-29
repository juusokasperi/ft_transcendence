export function log(message: string, context?: Record<string, unknown>) {
  const time = new Date().toISOString();
  const prefix = `[${time}] [MM]`;
  if (context) {
    console.log(`${prefix} ${message}`, JSON.stringify(context));
  } else console.log(`${prefix} ${message}`);
}
