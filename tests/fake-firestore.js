// Adaptador transacional de teste; nunca é importado pela aplicação.
import assert from "node:assert/strict";
const copy = (value) => structuredClone(value);
export class FakeDb {
  constructor() {
    this.data = new Map();
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.failCommit = false;
  }
  collection(path) {
    return new Query(this, path);
  }
  collectionGroup(name) {
    return new Query(this, name, [], [], null, undefined, true);
  }
  async runTransaction(work) {
    const previous = this.queue;
    let unlock;
    this.queue = new Promise((resolve) => (unlock = resolve));
    await previous;
    const tx = new Transaction(this);
    try {
      const result = await work(tx);
      tx.commit();
      return result;
    } finally {
      unlock();
    }
  }
  batch() {
    return new Transaction(this);
  }
  seed(path, value) {
    this.data.set(path, copy(value));
  }
}
class Ref {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }
  collection(name) {
    return new Query(this.db, `${this.path}/${name}`);
  }
  async get() {
    return snapshot(this.db, this.path);
  }
  async set(value, options) {
    const tx = new Transaction(this.db);
    tx.set(this, value, options);
    tx.commit();
  }
  async update(value) {
    const tx = new Transaction(this.db);
    tx.update(this, value);
    tx.commit();
  }
}
function snapshot(db, path) {
  const value = db.data.get(path);
  return {
    id: path.split("/").at(-1),
    exists: value !== undefined,
    data: () => copy(value),
    ref: new Ref(db, path),
  };
}
class Query {
  constructor(
    db,
    path,
    filters = [],
    orders = [],
    cursor = null,
    max = undefined,
    group = false,
  ) {
    Object.assign(this, { db, path, filters, orders, cursor, max, group });
  }
  doc(value) {
    assert(
      arguments.length === 0 || typeof value === "string",
      "doc(undefined) não é aceito pelo Firestore.",
    );
    return new Ref(
      this.db,
      `${this.path}/${value === undefined ? `auto_${String(++this.db.sequence).padStart(6, "0")}` : value}`,
    );
  }
  clone(change) {
    return Object.assign(
      new Query(
        this.db,
        this.path,
        this.filters,
        this.orders,
        this.cursor,
        this.max,
        this.group,
      ),
      change,
    );
  }
  where(...filter) {
    return this.clone({ filters: [...this.filters, filter] });
  }
  orderBy(...order) {
    return this.clone({ orders: [...this.orders, order] });
  }
  startAfter(...cursor) {
    return this.clone({ cursor });
  }
  limit(max) {
    return this.clone({ max });
  }
  count() {
    return {
      get: async () => {
        const result = await this.get();
        return { data: () => ({ count: result.docs.length }) };
      },
    };
  }
  async get() {
    let paths = [...this.db.data.keys()].filter((path) =>
      this.group
        ? path.split("/").at(-2) === this.path
        : path.startsWith(this.path + "/") &&
          path.split("/").length === this.path.split("/").length + 1,
    );
    paths = paths.filter((path) =>
      this.filters.every(([field, operator, value]) => {
        const actual = this.db.data.get(path)[field];
        return operator === "=="
          ? actual === value
          : operator === "in"
            ? value.includes(actual)
            : operator === "array-contains"
              ? actual?.includes(value)
              : operator === ">"
                ? actual > value
                : operator === "<"
                  ? actual < value
                  : operator === ">="
                    ? actual >= value
                    : operator === "<="
                      ? actual <= value
                      : false;
      }),
    );
    paths.sort((a, b) => {
      for (const [field, order] of this.orders) {
        const first =
            field === "__name__"
              ? a.split("/").at(-1)
              : this.db.data.get(a)[field],
          second =
            field === "__name__"
              ? b.split("/").at(-1)
              : this.db.data.get(b)[field];
        if (first < second) return order === "desc" ? 1 : -1;
        if (first > second) return order === "desc" ? -1 : 1;
      }
      return a.localeCompare(b);
    });
    if (this.cursor)
      paths = paths.filter((path) => {
        for (let index = 0; index < this.orders.length; index++) {
          const [field, direction] = this.orders[index],
            actual =
              field === "__name__"
                ? path.split("/").at(-1)
                : this.db.data.get(path)[field],
            value = this.cursor[index];
          if (actual !== value)
            return direction === "desc" ? actual < value : actual > value;
        }
        return false;
      });
    if (this.max !== undefined) paths = paths.slice(0, this.max);
    const docs = paths.map((path) => snapshot(this.db, path));
    return { docs, empty: !docs.length, size: docs.length };
  }
}
class Transaction {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }
  get(ref) {
    assert.equal(
      this.writes.length,
      0,
      "Firestore exige todas as leituras antes das gravações.",
    );
    return ref.get();
  }
  create(ref, value) {
    this.writes.push(["create", ref, value]);
  }
  set(ref, value, options) {
    this.writes.push(["set", ref, value, options]);
  }
  update(ref, value) {
    this.writes.push(["update", ref, value]);
  }
  delete(ref) {
    this.writes.push(["delete", ref]);
  }
  commit() {
    if (this.db.failCommit) {
      this.db.failCommit = false;
      throw Error("Falha de gravação injetada");
    }
    const staged = new Map(this.db.data);
    for (const [action, ref, value, options] of this.writes) {
      if (action === "create")
        assert(!staged.has(ref.path), "Documento duplicado.");
      if (action === "update")
        assert(staged.has(ref.path), "Documento ausente.");
      if (action === "delete") staged.delete(ref.path);
      else
        staged.set(
          ref.path,
          action === "update" || options?.merge
            ? { ...staged.get(ref.path), ...copy(value) }
            : copy(value),
        );
    }
    this.db.data = staged;
  }
}
