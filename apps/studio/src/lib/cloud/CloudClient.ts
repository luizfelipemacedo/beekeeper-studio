import { ConnectionsController } from '@/lib/cloud/controllers/ConnectionsController';
import axios, { AxiosInstance, AxiosTransformer} from 'axios'
import _ from 'lodash';
import rawLog from 'electron-log'
import axiosRetry from 'axios-retry'

import { res } from './ClientHelpers';
import { QueriesController } from "./controllers/QueriesController";
import { WorkspacesController } from './controllers/WorkspacesController';
import { ConnectionFoldersController } from '@/lib/cloud/controllers/ConnectionFoldersController';
import { QueryFoldersController } from '@/lib/cloud/controllers/QueryFoldersController';
import { UsedQueriesController } from '@/lib/cloud/controllers/UsedQueriesController';

const log = rawLog.scope('cloudClient')

const ad = axios.defaults

const defaultTransformRequest = ad.transformRequest as AxiosTransformer[]
const defaultTransformResponse = ad.transformResponse as AxiosTransformer[]

const snakeCaseData: AxiosTransformer = (data) => {
  const result = _.mapKeys(data, (_value, key) => {
    return _.snakeCase(key)
  })
  return result
}

const camelCaseData: AxiosTransformer = (data) => {
  if (_.isPlainObject(data)) {
    console.log('camel yes')
    const result = _.deepMapKeys(data, (_value, key) => _.camelCase(key))
    log.info('camel result', result)
    return result

  }
  console.log('camel no')
  return data
}


export interface CloudClientOptions {
  token: string,
  app: string,
  email: string
  baseUrl: string,
  workspace?: number
}

export class CloudClient {

  static async login(baseUrl, email, password, app): Promise<string> {
    const cli = axios.create({
      baseURL: baseUrl,
      timeout: 5000,
      transformRequest: [snakeCaseData, ...defaultTransformRequest],
      transformResponse: [...defaultTransformResponse, camelCaseData],
      validateStatus: (status) => status < 500
    })

    const response = await cli.post('/api/login', {
      email, password, app
    })

    return res(response, 'token')
  }


  axios: AxiosInstance
  public queries: QueriesController
  public connections: ConnectionsController
  public connectionFolders: ConnectionFoldersController
  public queryFolders: QueryFoldersController
  public usedQueries: UsedQueriesController
  public workspaces: WorkspacesController
  public workspaceId: number
  constructor(public options: CloudClientOptions) {
    this.axios = axios.create({
      baseURL: `${options.baseUrl}/api`,
      timeout: 5000,
      transformRequest: [snakeCaseData, ...defaultTransformRequest],
      transformResponse: [...defaultTransformResponse, camelCaseData],
      headers: {
        email: options.email,
        token: options.token,
        app: options.app
      },
      validateStatus: (status) => status < 500
    })

    axiosRetry(this.axios, { retries: 3, retryDelay: () => 2000, shouldResetTimeout: true})

    this.queries = new QueriesController(this.axios)
    this.connections = new ConnectionsController(this.axios)
    this.connectionFolders = new ConnectionFoldersController(this.axios)
    this.queryFolders = new QueryFoldersController(this.axios)
    this.workspaces = new WorkspacesController(this.axios)
    this.usedQueries = new UsedQueriesController(this.axios)

    this.axios.interceptors.request.use(request => {
      log.debug('REQ', JSON.stringify(request, null, 2))
      return request
    })

    this.axios.interceptors.response.use(response => {
      log.debug('RES:', JSON.stringify(response, null, 2))
      return response
    })

    if (options.workspace) {
      this.setWorkspace(options.workspace)
    }
  }

  cloneWithWorkspace(workspace: number): CloudClient {
    return new CloudClient({...this.options, workspace})
  }

  setWorkspace(workspaceId: number) {
    this.workspaceId = workspaceId
    if (!this.axios.defaults.params) this.axios.defaults.params = {}
    this.axios.defaults.params['workspace_id'] = workspaceId
  }

  async validateToken() {
    const response = await this.axios.get('/check')
    return res(response, 'valid')
  }

}