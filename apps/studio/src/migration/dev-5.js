import _ from 'lodash'
import { SavedConnection } from '../common/appdb/models/saved_connection'


export default {
  name: 'dev-5-fixtures',
  env: 'development',
  dbs: [
    {
      name: "[DEV] Docker LibSQL",
      connectionType: 'libsql',
      libsqlOptions: {
        mode: "url",
        url: "http://localhost:8081",
      },
    },
  ],

  async run() {

    const connections = this.dbs.map(db => {
      const connection = new SavedConnection()
      _.merge(connection, db)
      return connection
    })

    for (let i = 0; i < connections.length; i++) {
      const connection = connections[i];
      await connection.save()
    }

  }
}
