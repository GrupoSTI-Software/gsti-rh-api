import { HttpContext } from '@adonisjs/core/http'
import { LogFilterSearchInterface } from '../../interfaces/MongoDB/log_filter_search_interface.js'
import { LogStore } from '#models/MongoDB/log_store'
import { LogRequest } from '#models/MongoDB/log_request'
import LogService from '#services/mongo-db/log_service'
import ExceptionType from '#models/exception_type'
import Shift from '#models/shift'

export default class LogController {
  /**
   * @swagger
   * /api/logs/{entity}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Logs
   *     summary: Get logs by entity using query parameters (MongoDB)
   *     description: |
   *       Consulta logs almacenados en MongoDB por entidad/colección.
   *       El sistema utiliza MongoDB para auditoría, registrando todas las acciones
   *       de los usuarios. Soporta paginación, filtros por fecha, usuario y ordenamiento.
   *
   *       **Colecciones disponibles:**
   *       - log_request: Navegación y páginas visitadas
   *       - log_users: Cambios en usuarios
   *       - log_authentication: Eventos de autenticación
   *       - log_assist: Cambios en asistencias
   *       - log_employee_shifts: Asignaciones de turnos
   *       - log_employee_shift_changes: Cambios de turnos
   *       - log_shift_exceptions: Excepciones de turnos
   *       - log_vacations: Vacaciones
   *       - log_proceeding_files: Archivos de expedientes
   *
   *       **Configuración MongoDB:** Requiere configurar MONGODB_MODE ("atlas" o "server")
   *       y las variables correspondientes según el modo seleccionado.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: entity
   *         schema:
   *           type: string
   *         required: true
   *         description: The entity/collection name
   *       - in: query
   *         name: userId
   *         schema:
   *           type: integer
   *         description: Filter by user id
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for filtering (YYYY-MM-DD)
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for filtering (YYYY-MM-DD)
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Number of items per page
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *           default: date
   *         description: Field to sort by
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: desc
   *         description: Sort order (asc or desc)
   *     responses:
   *       '200':
   *         description: |
   *           Logs obtenidos exitosamente con paginación.
   *           Cada documento incluye record_previous (estado anterior) y record_current (estado actual).
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: "success"
   *                 title:
   *                   type: string
   *                   example: "Logs"
   *                 message:
   *                   type: string
   *                   example: "The logs were found successfully"
   *                 data:
   *                   type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                     total:
   *                       type: integer
   *                       example: 150
   *                     page:
   *                       type: integer
   *                       example: 1
   *                     limit:
   *                       type: integer
   *                       example: 50
   *                     totalPages:
   *                       type: integer
   *                       example: 3
   *       '400':
   *         description: Error de conexión a MongoDB. Verifica MONGODB_MODE y variables correspondientes.
   *       '404':
   *         description: La colección especificada no existe en MongoDB.
   */
  async show({ params, request, response }: HttpContext) {
    try {
      const entity = params.entity
      const userId = request.input('userId')
      const startDate = request.input('startDate')
      const endDate = request.input('endDate')
      const page = request.input('page', 1)
      const limit = request.input('limit', 50)
      const sortBy = request.input('sortBy', 'date')
      const sortOrder = request.input('sortOrder', 'desc')

      const filters = {
        entity: entity,
        userId: userId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy,
        sortOrder: sortOrder,
      } as LogFilterSearchInterface

      const logRequest = LogRequest.getInstance()
      if (!logRequest.isConnected) {
        await logRequest.dbConnect()
      }
      if (!logRequest.isConnected) {
        response.status(400)
        return {
          type: 'error',
          title: 'Connection error',
          message:
            'Could not connect to MongoDB. Please check your environment variables. Set MONGODB_MODE="atlas" or "server", DB_NAME (required), and depending on mode: for atlas set MONGODB_STRING, for server set MONGODB_HOST, MONGODB_PORT (and optionally MONGODB_USER, MONGODB_PASSWORD)',
          data: { ...filters },
        }
      }

      const exists = await logRequest.collectionExists(filters.entity)

      if (!exists) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Model mongo db',
          message: `Collection ${filters.entity} does not exist in MongoDB`,
          data: { ...filters },
        }
      }

      const result = await LogStore.get(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Logs',
        message: 'The logs were found successfully',
        data: result,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
  /**
   * @swagger
   * /api/logs:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Logs
   *     summary: Get log info by entity (MongoDB) - POST method
   *     description: |
   *       Consulta logs almacenados en MongoDB usando método POST.
   *       Alternativa al método GET que permite enviar filtros complejos en el body.
   *       Ver documentación del endpoint GET para más detalles sobre colecciones y configuración.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               entity:
   *                 type: string
   *                 description: The entity name
   *                 required: true
   *               userId:
   *                 type: integer
   *                 description: The user id
   *                 required: true
   *               startDate:
   *                 type: string
   *                 format: date
   *                 description: Start date for filtering (YYYY-MM-DD)
   *                 required: true
   *               endDate:
   *                 type: string
   *                 format: date
   *                 description: End date for filtering (YYYY-MM-DD)
   *                 required: true
   *               otherFilters:
   *                 type: object
   *                 description: Others additional filters
   *                 style: deepObject
   *                 explode: true
   *                 required: false
   *                 schema:
   *                   type: object
   *                   additionalProperties:
   *                     type: string
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ request, response }: HttpContext) {
    try {
      const entity = request.input('entity')
      const userId = request.input('userId')
      const startDate = request.input('startDate')
      const endDate = request.input('endDate')
      const otherFilters = request.input('otherFilters')
      const page = request.input('page', 1)
      const limit = request.input('limit', 50)
      const sortBy = request.input('sortBy', 'date')
      const sortOrder = request.input('sortOrder', 'desc')

      if (!entity) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'The entity parameter is required',
          data: {},
        }
      }

      const filters = {
        entity: entity,
        userId: userId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        otherFilters: otherFilters || undefined,
        page: page,
        limit: limit,
        sortBy: sortBy,
        sortOrder: sortOrder,
      } as LogFilterSearchInterface

      const logRequest = LogRequest.getInstance()
      if (!logRequest.isConnected) {
        await logRequest.dbConnect()
      }
      if (!logRequest.isConnected) {
        response.status(400)
        return {
          type: 'error',
          title: 'Connection error',
          message:
            'Could not connect to MongoDB. Please check your environment variables. Set MONGODB_MODE="atlas" or "server", DB_NAME (required), and depending on mode: for atlas set MONGODB_STRING, for server set MONGODB_HOST, MONGODB_PORT (and optionally MONGODB_USER, MONGODB_PASSWORD)',
          data: { ...filters },
        }
      }
      const exists = await logRequest.collectionExists(filters.entity)

      if (!exists) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Model mongo db',
          message: `Collection ${filters.entity} does not exist in MongoDB`,
          data: { ...filters },
        }
      }
      const result = await LogStore.get(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Logs',
        message: 'The logs were found successfully',
        data: result,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/logs/request:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Logs
   *     summary: Create new log request page (MongoDB)
   *     description: |
   *       Registra una visita a una página/ruta en MongoDB.
   *       Guarda información del usuario, ruta visitada, headers del navegador y timestamp.
   *       Se almacena en la colección log_request de MongoDB.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *        application/json:
   *           schema:
   *             type: object
   *             properties:
   *               route:
   *                 type: string
   *                 description: Route
   *                 required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      const route = request.input('route')
      const logService = new LogService()
      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logUser = await logService.createActionLog(rawHeaders, 'read')
        logUser.user_id = userId
        logUser.route = route
        await logService.saveActionOnLog(logUser)
        response.status(201)
        return {
          type: 'success',
          title: 'Logs',
          message: 'The log was created successfully',
          data: { logUser: logUser },
        }
      } else {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The user Id was not found',
          data: {},
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/logs/exceptions/vacations-disabilities:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Logs
   *     summary: Get logs for exceptions, vacations, disabilities and shift assignments (MongoDB)
   *     description: |
   *       Endpoint especializado que consulta y clasifica logs de excepciones, vacaciones, incapacidades
   *       y asignaciones de turnos desde múltiples colecciones de MongoDB. Combina logs de las colecciones:
   *       - log_shift_exceptions: Excepciones generales y incapacidades
   *       - log_vacations: Vacaciones
   *       - log_employee_shifts: Asignaciones y eliminaciones de turnos a empleados
   *       - log_employee_shift_changes: Cambios de turnos entre empleados
   *
   *       **Clasificación automática:**
   *       - Excepciones: Excepciones que no son vacaciones ni incapacidades
   *       - Vacaciones: Todos los registros de log_vacations
   *       - Incapacidades: Registros con workDisabilityPeriodId o tipo "falta-por-incapacidad"
   *       - Asignaciones de turnos: Registros de log_employee_shifts (asignaciones y eliminaciones)
   *       - Cambios de turnos: Registros de log_employee_shift_changes
   *
   *       **Configuración MongoDB:** Requiere MONGODB_MODE configurado correctamente.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: query
   *         name: userId
   *         schema:
   *           type: integer
   *         description: Filter by user id
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for filtering (YYYY-MM-DD)
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for filtering (YYYY-MM-DD)
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Number of items per page
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *           default: date
   *         description: Field to sort by
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: desc
   *         description: Sort order (asc or desc)
   *     responses:
   *       '200':
   *         description: |
   *           Logs clasificados en cinco categorías: excepciones, vacaciones, incapacidades,
   *           asignaciones de turnos y cambios de turnos.
   *           - excepciones: Excepciones que NO son vacaciones ni incapacidades
   *           - vacaciones: Registros de log_vacations
   *           - incapacidades: Registros con workDisabilityPeriodId o tipo "falta-por-incapacidad"
   *           - asignacionesTurnos: Registros de log_employee_shifts (asignaciones y eliminaciones)
   *           - cambiosTurnos: Registros de log_employee_shift_changes
   *             (incluye shiftNameFrom y shiftNameTo con los nombres de los turnos)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: "success"
   *                 title:
   *                   type: string
   *                   example: "Logs"
   *                 message:
   *                   type: string
   *                   example: "The logs were found successfully"
   *                 data:
   *                   type: object
   *                   properties:
   *                     excepciones:
   *                       type: object
   *                       properties:
   *                         data:
   *                           type: array
   *                         total:
   *                           type: integer
   *                           example: 25
   *                     vacaciones:
   *                       type: object
   *                       properties:
   *                         data:
   *                           type: array
   *                         total:
   *                           type: integer
   *                           example: 10
   *                     incapacidades:
   *                       type: object
   *                       properties:
   *                         data:
   *                           type: array
   *                         total:
   *                           type: integer
   *                           example: 5
   *                     asignacionesTurnos:
   *                       type: object
   *                       properties:
   *                         data:
   *                           type: array
   *                         total:
   *                           type: integer
   *                           example: 15
   *                     cambiosTurnos:
   *                       type: object
   *                       properties:
   *                         data:
   *                           type: array
   *                         total:
   *                           type: integer
   *                           example: 8
   *                     summary:
   *                       type: object
   *                       properties:
   *                         totalExcepciones:
   *                           type: integer
   *                           example: 25
   *                         totalVacaciones:
   *                           type: integer
   *                           example: 10
   *                         totalIncapacidades:
   *                           type: integer
   *                           example: 5
   *                         totalAsignacionesTurnos:
   *                           type: integer
   *                           example: 15
   *                         totalCambiosTurnos:
   *                           type: integer
   *                           example: 8
   *                         totalGeneral:
   *                           type: integer
   *                           example: 63
   *                         page:
   *                           type: integer
   *                         limit:
   *                           type: integer
   *                         totalPages:
   *                           type: integer
   *       '400':
   *         description: Error de conexión a MongoDB. Verifica la configuración según el modo.
   */
  async getExceptionsVacationsDisabilities({
    request,
    response,
  }: HttpContext) {
    try {
      const userId = request.input('userId')
      const startDate = request.input('startDate')
      const endDate = request.input('endDate')
      const page = request.input('page', 1)
      const limit = request.input('limit', 50)
      const sortBy = request.input('sortBy', 'date')
      const sortOrder = request.input('sortOrder', 'desc')

      const filter = {
        userId: userId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: Number(page),
        limit: Number(limit),
        sortBy: sortBy,
        sortOrder: sortOrder,
      }

      const logRequest = LogRequest.getInstance()
      if (!logRequest.isConnected) {
        await logRequest.dbConnect()
      }
      if (!logRequest.isConnected) {
        response.status(400)
        return {
          type: 'error',
          title: 'Connection error',
          message:
            'Could not connect to MongoDB. Please check your environment variables. Set MONGODB_MODE="atlas" or "server", DB_NAME (required), and depending on mode: for atlas set MONGODB_STRING, for server set MONGODB_HOST, MONGODB_PORT (and optionally MONGODB_USER, MONGODB_PASSWORD)',
          data: { ...filter },
        }
      }

      const collections = [
        'log_shift_exceptions',
        'log_vacations',
        'log_employee_shifts',
        'log_employee_shift_changes',
      ]

      const disabilityExceptionType = await ExceptionType.query()
        .whereNull('exception_type_deleted_at')
        .where('exception_type_slug', 'falta-por-incapacidad')
        .first()

      const result = await LogStore.getMultipleCollections(collections, filter)

      const incapacidades = result.data.filter((item: any) => {
        const current = item.record_current || {}
        const previous = item.record_previous || {}
        return (
          (disabilityExceptionType &&
            (current.exceptionTypeId ===
              disabilityExceptionType.exceptionTypeId ||
              previous.exceptionTypeId ===
                disabilityExceptionType.exceptionTypeId)) ||
          current.workDisabilityPeriodId ||
          previous.workDisabilityPeriodId
        )
      })

      const vacaciones = result.data.filter(
        (item: any) => item._collection === 'log_vacations'
      )

      const disabilityExceptionTypeId = disabilityExceptionType
        ? disabilityExceptionType.exceptionTypeId
        : null

      const excepciones = result.data.filter((item: any) => {
        if (item._collection === 'log_vacations') {
          return false
        }
        if (
          item._collection === 'log_employee_shifts' ||
          item._collection === 'log_employee_shift_changes'
        ) {
          return false
        }
        const current = item.record_current || {}
        const previous = item.record_previous || {}
        const isDisability =
          (disabilityExceptionTypeId &&
            (current.exceptionTypeId === disabilityExceptionTypeId ||
              previous.exceptionTypeId === disabilityExceptionTypeId)) ||
          current.workDisabilityPeriodId ||
          previous.workDisabilityPeriodId
        return !isDisability
      })

      const asignacionesTurnos = result.data.filter(
        (item: any) => item._collection === 'log_employee_shifts'
      )

      const cambiosTurnos = result.data.filter(
        (item: any) => item._collection === 'log_employee_shift_changes'
      )

      let cambiosTurnosEnriquecidos = cambiosTurnos

      if (cambiosTurnos.length > 0) {
        const shiftIds = new Set<number>()
        cambiosTurnos.forEach((item: any) => {
          const current = item.record_current || {}
          const previous = item.record_previous || {}
          if (current.shiftIdFrom) shiftIds.add(current.shiftIdFrom)
          if (current.shiftIdTo) shiftIds.add(current.shiftIdTo)
          if (previous.shiftIdFrom) shiftIds.add(previous.shiftIdFrom)
          if (previous.shiftIdTo) shiftIds.add(previous.shiftIdTo)
        })

        if (shiftIds.size > 0) {
          const shifts = await Shift.query()
            .whereIn('shift_id', Array.from(shiftIds))
            .whereNull('shift_deleted_at')

          const shiftMap = new Map<number, string>()
          shifts.forEach((shift) => {
            shiftMap.set(shift.shiftId, shift.shiftName)
          })

          cambiosTurnosEnriquecidos = cambiosTurnos.map((item: any) => {
            const current = item.record_current || {}
            const previous = item.record_previous || {}
            const enrichedItem = { ...item }
            enrichedItem.shiftNameFrom =
              shiftMap.get(current.shiftIdFrom) ||
              shiftMap.get(previous.shiftIdFrom) ||
              null
            enrichedItem.shiftNameTo =
              shiftMap.get(current.shiftIdTo) ||
              shiftMap.get(previous.shiftIdTo) ||
              null
            return enrichedItem
          })
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Logs',
        message: 'The logs were found successfully',
        data: {
          excepciones: {
            data: excepciones,
            total: excepciones.length,
          },
          vacaciones: {
            data: vacaciones,
            total: vacaciones.length,
          },
          incapacidades: {
            data: incapacidades,
            total: incapacidades.length,
          },
          asignacionesTurnos: {
            data: asignacionesTurnos,
            total: asignacionesTurnos.length,
          },
          cambiosTurnos: {
            data: cambiosTurnosEnriquecidos,
            total: cambiosTurnosEnriquecidos.length,
          },
          summary: {
            totalExcepciones: excepciones.length,
            totalVacaciones: vacaciones.length,
            totalIncapacidades: incapacidades.length,
            totalAsignacionesTurnos: asignacionesTurnos.length,
            totalCambiosTurnos: cambiosTurnos.length,
            totalGeneral: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
