// sqlite-patch.ts
import Database from 'better-sqlite3';
import type { Statement, Database as DatabaseType } from 'better-sqlite3';
import { Histogram, Counter } from 'prom-client';

const PATCH_FLAG = Symbol.for('sqlite.metrics.patched');

// --- Prometheus Metrics ---
// Declare variables, but DO NOT initialize them here
let queryDuration: Histogram;
let queryTotal: Counter;
let queryErrors: Counter;

// --- Patch Function ---
export function initSqliteMetrics(): void {
  const proto = Database.prototype as DatabaseType & { [PATCH_FLAG]?: boolean };
  if (proto[PATCH_FLAG]) return; // idempotent
  proto[PATCH_FLAG] = true;

  // Initialize metrics INSIDE the function
  queryDuration = new Histogram({
    name: 'sqlite_query_duration_seconds',
    help: 'Time spent on SQLite queries',
    labelNames: ['operation', 'phase'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  });

  queryTotal = new Counter({
    name: 'sqlite_query_total',
    help: 'Total SQLite queries executed',
    labelNames: ['operation', 'phase'] as const,
  });

  queryErrors = new Counter({
    name: 'sqlite_query_errors_total',
    help: 'Number of SQLite query errors',
    labelNames: ['operation', 'phase'] as const,
  });

  const getSqlOp = (sql: string): string => sql.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';

  const originalPrepare = proto.prepare;

  proto.prepare = function (this: DatabaseType, sql: string) {
    const operation = getSqlOp(sql);
    const end = queryDuration.startTimer({ operation, phase: 'prepare' });

    try {
      const stmt = originalPrepare.call(this, sql); // may throw
      queryTotal.inc({ operation, phase: 'prepare' });
      return wrapStatement(stmt, operation);
    } catch (err) {
      queryErrors.inc({ operation, phase: 'prepare' });
      throw err;
    } finally {
      end();
    }
  } as typeof proto.prepare;
}

function wrapStatement(stmt: Statement, operation: string): Statement {
  const methods: Array<keyof Statement> = ['run', 'get', 'all'];
  const wrapped = Object.create(stmt) as Statement;

  methods.forEach((method) => {
    const original = stmt[method] as (...args: unknown[]) => unknown;

    (wrapped[method] as typeof original) = function (...args: unknown[]) {
      const end = queryDuration.startTimer({ operation, phase: 'execute' });

      try {
        const result = original.apply(stmt, args);
        queryTotal.inc({ operation, phase: 'execute' });
        return result;
      } catch (err) {
        queryErrors.inc({ operation, phase: 'execute' });
        throw err;
      } finally {
        end();
      }
    };
  });

  return wrapped;
}
