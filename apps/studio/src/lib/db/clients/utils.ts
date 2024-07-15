// Copyright (c) 2015 The SQLECTRON Team
import _ from 'lodash'
import logRaw from 'electron-log'
import { TableChanges, TableDelete, TableFilter, TableInsert, TableUpdate } from '../models'
import { joinFilters } from '@/common/utils'
import { IdentifyResult } from 'sql-query-identifier/lib/defines'

const log = logRaw.scope('db/util')

export class ClientError extends Error {
  helpLink = null
  constructor(message: string, helpLink: string) {
    super(message)
    this.helpLink = helpLink
  }
}

export function escapeString(value) {
  if (_.isNil(value)) return null
  return value.toString().replaceAll("'", "''")
}

export function escapeLiteral(value) {
  if (_.isNil(value)) return null
  return value.toString().replaceAll(';', '')
}

export function joinQueries(queries) {
  const results = queries.map((sql) => {
    return sql.match(/;\s*$/g) ? sql : `${sql};`
  })
  return results.join("")
}


export function buildSchemaFilter(filter, schemaField = 'schema_name') {
  if (!filter) return null
  const { schema, only, ignore } = filter

  if (schema) {
    return `${schemaField} = '${schema}'`;
  }

  const where = [];

  if (only && only.length) {
    where.push(`${schemaField} IN (${only.map((name) => `'${name}'`).join(',')})`);
  }

  if (ignore && ignore.length) {
    where.push(`${schemaField} NOT IN (${ignore.map((name) => `'${name}'`).join(',')})`);
  }

  return where.join(' AND ');
}

export function buildDatabaseFilter(filter, databaseField) {
  if (!filter) {
    return null
  }
  const { only, ignore, database } = filter

  if (database) {
    return `${databaseField} = '${database}'`;
  }

  const where = [];

  if (only && only.length) {
    where.push(`${databaseField} IN (${only.map((name) => `'${name}'`).join(',')})`);
  }

  if (ignore && ignore.length) {
    where.push(`${databaseField} NOT IN (${ignore.map((name) => `'${name}'`).join(',')})`);
  }

  return where.join(' AND ');
}

function wrapIdentifier(value) {
  return (value !== '*' ? `\`${value.replace(/`/g, '``')}\`` : '*');
}


export function buildFilterString(filters: TableFilter[], columns = []) {
  let filterString = ""
  let filterParams = []
  if (filters && _.isArray(filters) && filters.length > 0) {
    const allFilters = filters.map((item) => {
      const column = columns.find((c) => c.columnName === item.field)
      const field = column?.dataType.toUpperCase().includes('BINARY') ?
        `HEX(${wrapIdentifier(item.field)})` :
        wrapIdentifier(item.field);

      if (item.type === 'in') {
        const questionMarks = _.isArray(item.value) ?
          item.value.map(() => '?').join(',')
          : '?'

        return `${field} ${item.type.toUpperCase()} (${questionMarks})`
      } else if (item.type.includes('is')) {
        return `${field} ${item.type.toUpperCase()} NULL`
      }
      return `${field} ${item.type.toUpperCase()} ?`
    })
    filterString = "WHERE " + joinFilters(allFilters, filters)

    filterParams = filters.filter((item) => !!item.value).flatMap((item) => {
      return _.isArray(item.value) ? item.value : [item.value]
    })
  }
  return {
    filterString, filterParams
  }
}

export function applyChangesSql(changes: TableChanges, knex: any): string {
  const queries = [
    ...buildInsertQueries(knex, changes.inserts || []),
    ...buildUpdateQueries(knex, changes.updates || []),
    ...buildDeleteQueries(knex, changes.deletes || [])
  ].filter((i) => !!i && _.isString(i)).join(';')

  if (queries.length)
    return queries.endsWith(';') ? queries : `${queries};`
}

export function buildSelectTopQuery(table, offset, limit, orderBy, filters, countTitle = 'total', columns = [], selects = ['*']) {
  log.debug('building selectTop for', table, offset, limit, orderBy, selects)
  let orderByString = ""

  if (orderBy && orderBy.length > 0) {
    orderByString = "ORDER BY " + (orderBy.map((item: any) => {
      if (_.isObject(item)) {
        return `\`${item['field']}\` ${item['dir'].toUpperCase()}`
      } else {
        return `\`${item}\``
      }
    })).join(",")
  }
  let filterString = ""
  let filterParams = []
  if (_.isString(filters)) {
    filterString = `WHERE ${filters}`
  } else {
    const filterBlob = buildFilterString(filters, columns)
    filterString = filterBlob.filterString
    filterParams = filterBlob.filterParams
  }

  const selectSQL = `SELECT ${selects.map((s) => wrapIdentifier(s)).join(", ")}`
  const baseSQL = `
    FROM \`${table}\`
    ${filterString}
  `
  const countSQL = `
    select count(*) as ${countTitle} ${baseSQL}
  `
  const sql = `
    ${selectSQL} ${baseSQL}
    ${orderByString}
    ${_.isNumber(limit) ? `LIMIT ${limit}` : ''}
    ${_.isNumber(offset) ? `OFFSET ${offset}` : ""}
    `
    return {query: sql, countQuery: countSQL, params: filterParams}
}

export async function executeSelectTop(queries, conn, executor) {
  const { query, params } = queries
  const result = await executor(conn, { query, params })
  return {
    result: result.data,
    fields: Object.keys(result.data[0] || {})
  }
}

export async function genericSelectTop(conn, table, offset, limit, orderBy, filters, executor, selects){
  const queries = buildSelectTopQuery(table, offset, limit, orderBy, filters, undefined, undefined, selects)
  return await executeSelectTop(queries, conn, executor)
}

export function buildInsertQuery(knex, insert: TableInsert, { columns = [], bitConversionFunc = _.toNumber, asUpsert = false, primaryKeys = [] as string[] } = {}) {
  const data = _.cloneDeep(insert.data)
  data.forEach((item) => {
    const insertColumns = Object.keys(item)
    insertColumns.forEach((ic) => {
      const matching = _.find(columns, (c) => c.columnName === ic)
      if (matching && matching.dataType && matching.dataType.startsWith('bit(') && !_.isNil(item[ic])) {
        if (matching.dataType === 'bit(1)') {
          item[ic] = bitConversionFunc(item[ic])
        } else {
          item[ic] = parseInt(item[ic].split("'")[1], 2)
        }
      } else if (matching && matching.dataType && matching.dataType.startsWith('bit') && _.isBoolean(item[ic])) {
        item[ic] = item[ic] ? 1 : 0;
      }

      // HACK (@day): fixes #1734. Knex reads any '?' in identifiers as a parameter, so we need to escape any that appear.
      if (ic.includes('?')) {
        const newIc = ic.replaceAll('?', '\\?');
        item[newIc] = item[ic];
        delete item[ic];
      }
    })

  })
  const table = insert.dataset ? `${insert.dataset}.${insert.table}` : insert.table;
  const builder = knex(table);
  if (insert.schema) {
    builder.withSchema(insert.schema)
  }
  
  if (asUpsert && primaryKeys.length > 0) {
    // might have to be different for different engines. 
    // https://knexjs.org/guide/query-builder.html#onconflict
    return builder
      .insert(data)
      .onConflict(primaryKeys)
      .merge()
      .toQuery()
  }
  
  return builder
    .insert(data)
    .toQuery()
}

export function buildInsertQueries(knex, inserts, { asUpsert = false, primaryKeys = [] } = {}) {
  if (!inserts) return []
  return inserts.map(insert => buildInsertQuery(knex, insert, { asUpsert, primaryKeys }))
}

export function buildUpdateQueries(knex, updates: TableUpdate[]) {
  if (!updates) return []

  return updates.map(update => {
    const where = {}
    const updateblob = {}
    update.primaryKeys.forEach(({column, value}) => {
      where[column] = value
    })

    // HACK (@day): fixes #1734. Knex reads any '?' in identifiers as a parameter, so we need to escape any that appear.
    if (update.column.includes('?')) {
      update.column = update.column.replaceAll('?', '\\?');
    }

    updateblob[update.column] = update.value

    const table = update.dataset ? `${update.dataset}.${update.table}` : update.table;
    const query = knex(table)
      .withSchema(update.schema)
      .where(where)
      .update(updateblob)
      .toQuery()
    return query
  })
}

export function buildSelectQueriesFromUpdates(knex, updates: TableUpdate[]) {
  return updates.map(update => {
    const where = {}
    update.primaryKeys.forEach(({ column, value }) => {
      where[column] = value
    })

    const table = update.dataset ? `${update.dataset}.${update.table}` : update.table;

    const query = knex(table)
      .withSchema(update.schema)
      .where(where)
      .select('*')
      .toQuery()
    return query
  })
}

export async function withClosable<T>(item, func): Promise<T> {
  try {
    return await func(item)
  } finally {
    if (item) {
      await item.close();
    }
  }

}


export function buildDeleteQueries(knex, deletes: TableDelete[]) {
  if (!deletes) return []
  return deletes.map(deleteRow => {
    const where = {}

    deleteRow.primaryKeys.forEach(({ column, value }) => {
      where[column] = value
    })

    const table = deleteRow.dataset ? `${deleteRow.dataset}.${deleteRow.table}` : deleteRow.table;

    return knex(table)
      .withSchema(deleteRow.schema)
      .where(where)
      .delete()
      .toQuery()
  })
}

export function isAllowedReadOnlyQuery (identifiedQueries: IdentifyResult[], readOnlyMode: boolean): boolean {
  return (!readOnlyMode || readOnlyMode && identifiedQueries.every(f => ['LISTING', 'INFORMATION'].includes(f.executionType?.toUpperCase())))
}

export const errorMessages = {
  readOnly: 'Write action(s) not allowed in Read-Only Mode.'
}
