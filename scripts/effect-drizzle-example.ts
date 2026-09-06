import { sql } from "drizzle-orm";
import * as Drizzle from "drizzle-orm/effect-sqlite-node";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as Effect from "effect/Effect";

const example = Effect.gen(function* () {
  const db = yield* Drizzle.makeWithDefaults();
  yield* db.run(
    sql`CREATE TABLE example (id INTEGER PRIMARY KEY, goal TEXT NOT NULL)`,
  );
  yield* db.run(
    sql`INSERT INTO example (id, goal) VALUES (1, ${"Verify Effect 4 with Drizzle"})`,
  );
  const rows = yield* db.all<{ goal: string }>(
    sql`SELECT goal FROM example WHERE id = 1`,
  );
  if (rows[0]?.goal !== "Verify Effect 4 with Drizzle")
    throw new Error("Round trip failed");
  return rows[0].goal;
}).pipe(
  Effect.provide(SqliteClient.layer({ filename: ":memory:" })),
  Effect.scoped,
);

console.log(await Effect.runPromise(example));
