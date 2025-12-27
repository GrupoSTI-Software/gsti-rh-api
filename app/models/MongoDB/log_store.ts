import { DateTime } from 'luxon'
import { LogFilterSearchInterface } from '../../interfaces/MongoDB/log_filter_search_interface.js'
import { LogRequestModel } from '../../interfaces/MongoDB/log_request_model.js'
import { LogRequest } from './log_request.js'

export class LogStore {
  static async set(collectionName: string, logData: LogRequestModel) {
    const logRequest = LogRequest.getInstance()
    if (!logRequest.isConnected) {
      logRequest.scheduleReconnect()
      // console.warn("No se conecto a mongo. no se guardo el log")
      return
    }
    try {
      const model = logRequest.getModel(collectionName)
      const logDocument = new model(logData)
      await logDocument.save()
    } catch (error) {
      // console.error("Error guardando el log:", error)
      logRequest.isConnected = false
      logRequest.scheduleReconnect()
    }
  }

  static async get(filter: LogFilterSearchInterface) {
    const logRequest = LogRequest.getInstance()
    if (!logRequest.isConnected) {
      await logRequest.dbConnect()
    }
    if (!logRequest.isConnected) {
      return { data: [], total: 0, page: 1, limit: 10 }
    }

    try {
      const model = logRequest.getModel(filter.entity)
      const query: any = {}

      if (filter.userId) {
        query.user_id = filter.userId
      }

      if (filter.startDate && filter.endDate) {
        const startDate = DateTime.fromISO(filter.startDate)
          .startOf('day')
          .toISO()
        const endDate = DateTime.fromISO(filter.endDate).endOf('day').toISO()
        query.date = {
          $gte: startDate,
          $lte: endDate,
        }
      } else if (filter.startDate) {
        const startDate = DateTime.fromISO(filter.startDate)
          .startOf('day')
          .toISO()
        query.date = { $gte: startDate }
      } else if (filter.endDate) {
        const endDate = DateTime.fromISO(filter.endDate).endOf('day').toISO()
        query.date = { $lte: endDate }
      }

      if (filter.otherFilters) {
        Object.assign(query, filter.otherFilters)
      }

      const page = filter.page || 1
      const limit = filter.limit || 50
      const skip = (page - 1) * limit

      const sortBy = filter.sortBy || 'date'
      const sortOrder = filter.sortOrder === 'asc' ? 1 : -1
      const sort: any = { [sortBy]: sortOrder }

      const [data, total] = await Promise.all([
        model.find(query).sort(sort).skip(skip).limit(limit),
        model.countDocuments(query),
      ])

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      logRequest.isConnected = false
      logRequest.scheduleReconnect()
      return { data: [], total: 0, page: 1, limit: 10 }
    }
  }

  static async getMultipleCollections(
    collections: string[],
    filter: Omit<LogFilterSearchInterface, 'entity'>
  ) {
    const logRequest = LogRequest.getInstance()
    if (!logRequest.isConnected) {
      await logRequest.dbConnect()
    }
    if (!logRequest.isConnected) {
      return { data: [], total: 0, page: 1, limit: 10 }
    }

    try {
      const query: any = {}

      if (filter.userId) {
        query.user_id = filter.userId
      }

      if (filter.startDate && filter.endDate) {
        const startDate = DateTime.fromISO(filter.startDate)
          .startOf('day')
          .toISO()
        const endDate = DateTime.fromISO(filter.endDate).endOf('day').toISO()
        query.date = {
          $gte: startDate,
          $lte: endDate,
        }
      } else if (filter.startDate) {
        const startDate = DateTime.fromISO(filter.startDate)
          .startOf('day')
          .toISO()
        query.date = { $gte: startDate }
      } else if (filter.endDate) {
        const endDate = DateTime.fromISO(filter.endDate).endOf('day').toISO()
        query.date = { $lte: endDate }
      }

      if (filter.otherFilters) {
        Object.assign(query, filter.otherFilters)
      }

      const page = filter.page || 1
      const limit = filter.limit || 50
      const sortBy = filter.sortBy || 'date'
      const sortOrder = filter.sortOrder === 'asc' ? 1 : -1

      const allResults: any[] = []

      for (const collectionName of collections) {
        const exists = await logRequest.collectionExists(collectionName)
        if (exists) {
          const model = logRequest.getModel(collectionName)
          const results = await model.find(query)
          allResults.push(
            ...results.map((item: any) => ({
              ...item.toObject(),
              _collection: collectionName,
            }))
          )
        }
      }

      const total = allResults.length
      const skip = (page - 1) * limit

      allResults.sort((a, b) => {
        const aValue = a[sortBy]
        const bValue = b[sortBy]
        if (sortOrder === 1) {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
        } else {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
        }
      })

      const paginatedResults = allResults.slice(skip, skip + limit)

      return {
        data: paginatedResults,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      logRequest.isConnected = false
      logRequest.scheduleReconnect()
      return { data: [], total: 0, page: 1, limit: 10 }
    }
  }
}
