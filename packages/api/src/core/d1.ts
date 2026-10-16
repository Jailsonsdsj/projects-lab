// D1 write helpers (playbook §7). D1 has no interactive transactions, binds at
// most 100 parameters per statement, and spending must never be read-then-write.

/** D1's limit on bound parameters per statement, reads included. */
export const D1_MAX_BOUND_PARAMS = 100;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Table and column names are interpolated, so only plain identifiers pass. */
function identifiers(...names: string[]): void {
  for (const name of names)
    if (!IDENTIFIER.test(name)) throw new Error(`not an identifier: ${name}`);
}

/**
 * INSERT statements for `rows`, chunked so none binds more than 100
 * parameters. Put them in the caller's own `db.batch([...])` with its other
 * writes: the batch is the only atomicity D1 has. (Failures only appear past
 * the limit, e.g. at a 21st row of five columns.)
 */
export function chunkedInsert(
  db: D1Database,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): D1PreparedStatement[] {
  identifiers(table, ...columns);
  const perStatement = Math.floor(D1_MAX_BOUND_PARAMS / columns.length);
  if (perStatement < 1)
    throw new Error(`${columns.length} columns exceed one statement's limit`);
  const tuple = `(${columns.map(() => "?").join(", ")})`;

  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < rows.length; start += perStatement) {
    const chunk = rows.slice(start, start + perStatement);
    for (const row of chunk)
      if (row.length !== columns.length)
        throw new Error(
          `row has ${row.length} values for ${columns.length} columns`,
        );
    statements.push(
      db
        .prepare(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${chunk
            .map(() => tuple)
            .join(", ")}`,
        )
        .bind(...chunk.flat()),
    );
  }
  return statements;
}

/**
 * An INSERT that happens only if `where` holds when it runs: the check and the
 * write are one statement, so nothing can change in between. Use it for every
 * spend or decrement, e.g. `where: "(SELECT SUM(amount) FROM ledger) >= ?"`.
 * Run it (or put it in a batch) and ask `inserted(result)`.
 */
export function conditionalInsert(
  db: D1Database,
  insert: {
    table: string;
    columns: readonly string[];
    values: readonly unknown[];
    /** A SQL condition; its own values go in `whereParams`, never inline. */
    where: string;
    whereParams?: readonly unknown[];
  },
): D1PreparedStatement {
  identifiers(insert.table, ...insert.columns);
  if (insert.values.length !== insert.columns.length)
    throw new Error("one value per column");
  return db
    .prepare(
      `INSERT INTO ${insert.table} (${insert.columns.join(", ")})
       SELECT ${insert.columns.map(() => "?").join(", ")} WHERE ${insert.where}`,
    )
    .bind(...insert.values, ...(insert.whereParams ?? []));
}

/** Whether a conditionalInsert wrote its row; false means the check refused it. */
export function inserted(result: D1Result): boolean {
  return result.meta.changes > 0;
}
