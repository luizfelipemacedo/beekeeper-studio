import { SqliteCursor } from "../sqlite/SqliteCursor";
import Database from "libsql";

interface LibSQLCursorOptions {
  isRemote: boolean
}

export class LibSQLCursor extends SqliteCursor {
  options: LibSQLCursorOptions

  constructor(
    databaseName: string,
    query: string,
    params: string[],
    chunkSize: number,
    options: LibSQLCursorOptions
  ) {
    super(databaseName, query, params, chunkSize, options);
  }

  protected _createConnection(path: string) {
    // @ts-expect-error not fully typed
    this.database = new Database(path);
  }

  // FIXME remove this method if resolved https://github.com/tursodatabase/libsql-js/issues/116
  protected _prepareStatement(query: string) {
    console.log(this.options);
    this.statement = this.database.prepare(query);
    if (!this.options.isRemote) {
      this.statement.raw(true);
    }
  }

  // FIXME remove this when we can fully use statement.raw
  async read(): Promise<any[][]> {
    if (this.options.isRemote) {
      return await this.readResultsAsObjects();
    }
    return await super.read();
  }

  private async readResultsAsObjects(): Promise<any[][]> {
    const results = [];
    for (let index = 0; index < this.chunkSize; index++) {
      const r: Record<string, any> = this.iterator?.next().value;
      if (r) {
        results.push(Object.entries(r).map(([, value]) => value));
      } else {
        break;
      }
    }
    return results;
  }
}
