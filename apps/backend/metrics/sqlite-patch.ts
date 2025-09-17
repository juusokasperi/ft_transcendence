import Database, { Statement } from 'better-sqlite3';
import { Histogram, Counter } from 'prom-client';

const PATCH_FLAG = Symbol.for('sqlite.metrics.patched');

// --- Prometheus Metrics ---
export const queryDuration = new Histogram({
  name: 'sqlite_query_duration_seconds',
  help: 'Time spent on SQLite queries',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
});

export const queryTotal = new Counter({
  name: 'sqlite_query_total',
  help: 'Total SQLite queries executed',
  labelNames: ['operation'],
});

export const queryErrors = new Counter({
  name: 'sqlite_query_errors_total',
  help: 'Number of SQLite query errors',
  labelNames: ['operation'],
});

// --- Patch Function ---
export function initSqliteMetrics(): void {
  const proto = Database.prototype as typeof Database & { [PATCH_FLAG]?: boolean };
  if (proto[PATCH_FLAG]) return; // idempotent
  proto[PATCH_FLAG] = true;

  const getSqlOp = (sql: string): string => sql.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';

  const originalPrepare = proto.prepare;
  proto.prepare = function (this: Database, sql: string, ...args: any[]) {
    const operation = getSqlOp(sql);
    const stmt = originalPrepare.call(this, sql, ...args);

    return wrapStatement(stmt, operation);
  };
}

// --- Statement Wrapper ---
function wrapStatement(stmt: Statement, operation: string): Statement {
  const methods: Array<keyof Statement> = ['run', 'get', 'all'];
  const wrapped = Object.create(stmt) as Statement;

  methods.forEach((method) => {
    const original = stmt[method] as (...args: any[]) => any;

    wrapped[method] = function (...args: any[]) {
      const end = queryDuration.startTimer({ operation });
      try {
        const result = original.apply(stmt, args);
        queryTotal.inc({ operation });
        return result;
      } catch (err) {
        queryErrors.inc({ operation });
        throw err;
      } finally {
        end();
      }
    };
  });

  return wrapped;
}
