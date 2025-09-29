import db from '../client';

// for debugging sql query counter
export function goodSql() {
  const stmt = db.prepare('SELECT * FROM Users');
  stmt.get();
}

// for debugging sql query error counter
// Prepare-time error: invalid SQL
export function badSqlPrepare(): void {
  // Intentionally invalid SQL (syntax error)
  const stmt = db.prepare('SELECT * FROM non_existent_table('); // throws at prepare
  stmt.get(); // never reached
}

// for debugging sql query error counter
// Execution-time error: constraint violation
export function badSqlExecute(): void {
  const stmt = db.prepare('INSERT INTO test_table(id, value) VALUES (?, ?)');
  stmt.run(1, 'ok'); // first insert succeeds
  stmt.run(1, 'ok'); // second insert fails → execution-time error
}
