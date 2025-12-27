import mongoose from 'mongoose'
import Env from '#start/env'

export class LogRequest {
  private static instance: LogRequest
  private connections: { [key: string]: mongoose.Model<any> } = {}
  isConnected = false
  private retryTimeout = 10000
  private isReconnecting = false
  private connectionTimeout = 5000

  static getInstance(): LogRequest {
    if (!LogRequest.instance) {
      LogRequest.instance = new LogRequest()
    }
    return LogRequest.instance
  }
  async dbConnect() {
    if (this.isConnected && mongoose.connection.readyState === 1) return

    const mode = Env.get('MONGODB_MODE', 'server')
    const dbName = Env.get('DB_NAME') || Env.get('MONGODB_DB_NAME')

    if (!dbName) {
      this.isConnected = false
      return
    }

    let uri: string | null = null

    if (mode === 'atlas') {
      const mongoString = Env.get('MONGODB_STRING')
      if (!mongoString) {
        this.isConnected = false
        return
      }

      try {
        if (mongoString.includes('mongodb+srv://')) {
          const urlParts = mongoString.replace('mongodb+srv://', '').split('@')
          if (urlParts.length === 2) {
            const credentials = urlParts[0]
            const clusterAndParams = urlParts[1].split('/')
            const cluster = clusterAndParams[0].split('?')[0]
            uri = `mongodb+srv://${credentials}@${cluster}/${dbName}`
          } else {
            const cluster = urlParts[0].split('/')[0].split('?')[0]
            uri = `mongodb+srv://${cluster}/${dbName}`
          }
        } else if (mongoString.includes('mongodb://')) {
          const url = new URL(mongoString)
          url.pathname = `/${dbName}`
          uri = url.toString()
        } else {
          this.isConnected = false
          return
        }
      } catch (error) {
        this.isConnected = false
        return
      }
    } else if (mode === 'server') {
      const host = Env.get('MONGODB_HOST')
      const port = Env.get('MONGODB_PORT', 27017)
      const user = Env.get('MONGODB_USER')
      const password = Env.get('MONGODB_PASSWORD')

      if (!host) {
        this.isConnected = false
        return
      }

      if (user && password) {
        uri = `mongodb://${user}:${password}@${host}:${port}/${dbName}`
      } else {
        uri = `mongodb://${host}:${port}/${dbName}`
      }
    }

    if (!uri) {
      this.isConnected = false
      return
    }

    try {
      if (mongoose.connection.readyState === 0) {
        await Promise.race([
          mongoose.connect(uri),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timed out')), this.connectionTimeout)
          ),
        ])
      }
      this.isConnected = mongoose.connection.readyState === 1
    } catch (error) {
      this.isConnected = false
      this.scheduleReconnect()
      throw error
    }
  }

  scheduleReconnect() {
    //console.log('isReconnecting:' , this.isReconnecting)
    if (this.isReconnecting) return

    this.isReconnecting = true
    setTimeout(async () => {
      // console.log("reconectando")
      await this.dbConnect()
      this.isReconnecting = false
    }, this.retryTimeout)
  }

  getModel(collectionName: string): mongoose.Model<any> {
    if (!this.connections[collectionName]) {
      this.connections[collectionName] =
        mongoose.models[collectionName] ||
        mongoose.model(collectionName, new mongoose.Schema({}, { strict: false }))
    }
    return this.connections[collectionName]
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.isConnected) await this.dbConnect()
    if (!mongoose.connection.readyState) {
      // console.log('MongoDB no está conectado aún.');
      return false
    }
    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db
        .listCollections({ name: collectionName })
        .toArray()
      return collections.length > 0
    } else {
      return false
    }
  }
}
