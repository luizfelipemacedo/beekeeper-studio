import ISavedQuery from "@/common/interfaces/ISavedQuery";
import { TableFilter, TableOrView } from "@/lib/db/models";
import { Column, Entity } from "typeorm";
import { ApplicationEntity } from "./application_entity";
import _ from 'lodash'
import { tableId } from "@/common/utils";


type TabType = 'query' | 'table' | 'table-properties' | 'settings' | 'table-builder'


const pickable = ['title', 'tabType', 'unsavedChanges', 'unsavedQueryText', 'tableName', 'schemaName']


@Entity({ name: 'tabs'})
export class OpenTab extends ApplicationEntity {


  constructor(tabType: TabType) {
    super()
    this.tabType = tabType
  }

  get type(): TabType {
    return this.tabType
  }

  @Column({type: 'varchar', nullable: false})
  tabType: TabType = 'query'

  @Column({type: 'boolean', nullable: false, default: false})
  unsavedChanges = false

  @Column({type: 'varchar', nullable: false, length: 255})
  title: string

  @Column({type: 'varchar', nullable: true})
  titleScope?: string

  @Column({type: 'boolean', default: false})
  alert = false

  @Column({type: 'float', nullable: false})
  position = 99.0

  @Column({type: 'boolean', nullable: false, default: false})
  active: boolean

  // QUERY TAB
  @Column({ type: 'integer', nullable: true })
  queryId?: number

  @Column({type: 'text', nullable: true})
  unsavedQueryText?: string

  // TABLE TAB
  @Column({type: 'varchar', length: 255, nullable: true})
  tableName?: string

  @Column({type: 'varchar', nullable: true})
  schemaName?: string

  @Column({type: 'varchar', nullable: true})
  entityType?: string

  @Column({ type: 'integer', nullable: false })
  connectionId

  @Column({ type: 'integer', nullable: false, default: -1 })
  workspaceId?: number

  @Column({type: 'text', name: 'filters', nullable: true})
  filters?: string

  public setFilters(filters: Nullable<TableFilter[]>) {
    if (filters && _.isArray(filters)) {
      this.filters = JSON.stringify(filters)
    } else {
      this.filters = null
    }
  }

  public getFilters(): Nullable<TableFilter[]> {
    try {
      if (!this.filters) return null
      const result: TableFilter | TableFilter[] = JSON.parse(this.filters)
      if (_.isArray(result)) return result
      if (_.isObject(result)) return [result]
      return null
    } catch (ex) {
      console.warn("error inflating filter", this.filters)
      return null
    }
  }

  duplicate(): OpenTab {
    const result = new OpenTab(this.tabType)
    _.assign(result, _.pick(this, pickable))
    return result
  }

  findTable(tables: TableOrView[]): TableOrView | null {
    const result = tables.find((t) => {
      return this.tableName === t.name &&
        (!this.schemaName || this.schemaName === t.schema)
    })
    return result
  }

  findQuery(queries: ISavedQuery[]): ISavedQuery | null {
    return queries.find((q) => q.id === this.queryId)
  }

  // we want a loose match here, this is used to determine if we open a new tab or not
  matches(other: OpenTab): boolean {
    // new tabs don't have a workspace set
    console.log("comparison matches", this.tableName, this.schemaName, this.filters, this.entityType)
    if (other.workspaceId && this.workspaceId && this.workspaceId !== other.workspaceId) {
      return false;
    }
    switch (other.tabType) {
      case 'table-properties':
      case 'table':
        // Ok finally changing 'table' so we only have one tab per table.
        // I think this is more intuitive. I realize it causes another UX
        // issue for tables with a FK link overriding the current open view.
        return tableId(this.tableName, this.entityType, this.tableName) ===
          tableId(other.tableName, other.entityType, other.schemaName)
      case 'query':
        return this.queryId === other.queryId
      default:
        return false
    }
  }

}
