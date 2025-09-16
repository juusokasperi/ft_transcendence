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

const queryErrors = new Counter({
  name: 'sqlite_query_errors_total',
  help: 'Number of SQLite query errors',
  labelNames: ['operation'],
});

// ------------------------
// Monkey-patch Statement methods
// ------------------------
const patchMethods = ['run', 'get', 'all', 'iterate'] as const;

const patchStatement = () => {
  // Create a dummy statement to get the prototype
  const dummyDB = new Database(':memory:');
  const stmtProto = Object.getPrototypeOf(dummyDB.prepare('SELECT 1'));

  patchMethods.forEach((method) => {
    const origFn = stmtProto[method] as Function;

    stmtProto[method] = function (...args: any[]) {
      const op = method.toLowerCase();
      const end = queryDuration.startTimer({ operation: op });
      try {
        const result = origFn.apply(this, args);
        end();
        return result;
      } catch (err) {
        end();
        queryErrors.inc({ operation: op });
        throw err;
      }
    };
  });
};

// Run patch immediately
patchStatement();
