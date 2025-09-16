import Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3'; // Type-only import
import { Histogram, Counter } from 'prom-client';

// ------------------------
// Prometheus metrics
// ------------------------
const queryDuration = new Histogram({
  name: 'sqlite_query_duration_seconds',
  help: 'Time spent on SQLite queries',
  labelNames: ['operation'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
});

const queryTotal = new Counter({
  name: 'sqlite_query_total',
  help: 'Total SQLite queries executed',
  labelNames: ['operation'],
});

const queryErrors = new Counter({
  name: 'sqlite_query_errors_total',
  help: 'Number of SQLite query errors',
  labelNames: ['operation'],
});

// ------------------------
// Helper: extract SQL op
// ------------------------
function getSqlOp(sql: string): string {
  return sql.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';
}

// ------------------------
// Monkey-patch Statement methods
// ------------------------
const patchMethods = ['run', 'get', 'all', 'iterate'] as const;

export function patchBetterSqlite() {
  const dummyDB = new Database(':memory:');
  const stmtProto = Object.getPrototypeOf(dummyDB.prepare('SELECT 1'));

  // Wrap run/get/all/iterate
  patchMethods.forEach((method) => {
    const origFn = stmtProto[method] as Function;

    stmtProto[method] = function (this: any, ...args: any[]) {
      const sql = (this as any).source ?? '';
      const op = getSqlOp(sql);

      const end = queryDuration.startTimer({ operation: op });
      try {
        const result = origFn.apply(this, args);
        queryTotal.inc({ operation: op });
        return result;
      } catch (err) {
        console.error('Incrementing queryErrors for operation', op, err.message);
        queryErrors.inc({ operation: op });
        throw err;
      } finally {
        end();
      }
    };
  });

  // Wrap Database.prototype.prepare
  const origPrepare = Database.prototype.prepare;
  Database.prototype.prepare = function (this: Database, sql: string, ...args: any[]) {
    const op = getSqlOp(sql);
    try {
      return origPrepare.call(this, sql, ...args);
    } catch (err) {
      queryErrors.inc({ operation: op });
      throw err;
    }
  };
}

// do the thing immediately on import
patchBetterSqlite();
