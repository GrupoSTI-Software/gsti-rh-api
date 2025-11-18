/* eslint-disable prettier/prettier */
import AssistStatusSync from '#models/assist_status_sync'
import { DateTime } from 'luxon'
import axios from 'axios'
import PageSync from '#models/assist_page_sync'
import ResponseApiAssistsDto from '#dtos/response_api_assists_dto'
import PaginationDto from '#dtos/pagination_api_dto'
import Assist from '#models/assist'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import Employee from '#models/employee'
import { AssistDayInterface } from '../interfaces/assist_day_interface.js'
import { AssistInterface } from '../interfaces/assist_interface.js'
import AssistStatusResponseDto from '#dtos/assist_status_response_dto'
import ShiftForEmployeeService from './shift_for_employees_service.js'
import { EmployeeRecordInterface } from '../interfaces/employee_record_interface.js'
import type { ShiftRecordInterface } from '../interfaces/shift_record_interface.js'
import HolidayService from './holiday_service.js'
import { HolidayInterface } from '../interfaces/holiday_interface.js'
import { ShiftExceptionInterface } from '../interfaces/shift_exception_interface.js'
import ToleranceService from './tolerance_service.js'
import { AssistSyncFilterInterface } from '../interfaces/assist_sync_filter_interface.js'
import AssistsService from './assist_service.js'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import { ShiftInterface } from '../interfaces/shift_interface.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'
import Department from '#models/department'
import BusinessUnit from '#models/business_unit'
import DepartmentService from './department_service.js'
import { I18n } from '@adonisjs/i18n'
import EmployeeService from './employee_service.js'

/**
 * Servicio para la sincronización y procesamiento de asistencias de empleados.
 *
 * Este servicio es responsable de:
 * - Sincronizar asistencias desde una API externa de biometría
 * - Procesar y calcular el calendario de asistencias de empleados
 * - Validar estados de entrada/salida (check-in/check-out)
 * - Aplicar reglas de negocio (tolerancias, excepciones, turnos)
 * - Optimizar consultas mediante caché y bulk loading
 *
 * @class SyncAssistsService
 * @example
 * ```typescript
 * const service = new SyncAssistsService(i18n)
 * const result = await service.index({
 *   date: '2024-10-01',
 *   dateEnd: '2024-10-30',
 *   employeeID: 123
 * })
 * ```
 */
export default class SyncAssistsService {
  /**
   * Función para traducir mensajes usando i18n.
   * @private
   * @type {Function}
   */
  private t: (key: string,params?: { [key: string]: string | number }) => string

  /**
   * Instancia de internacionalización para traducción de mensajes.
   * @private
   * @type {I18n | undefined}
   */
  private i18n?: I18n

  /**
   * Caché de tolerancias (Delay y Fault) para evitar consultas repetidas.
   * Se carga una sola vez y se reutiliza durante la vida de la instancia.
   * @private
   * @type {{ delayTolerance: Tolerance | undefined, faultTolerance: Tolerance | undefined } | null}
   */
  private tolerancesCache: { delayTolerance: Tolerance | undefined, faultTolerance: Tolerance | undefined } | null = null

  /**
   * Caché de días festivos (holidays) organizados por fecha (yyyy-MM-dd).
   * Permite acceso O(1) en lugar de consultas repetidas a la base de datos.
   * @private
   * @type {Map<string, HolidayInterface>}
   */
  private holidaysCache: Map<string, HolidayInterface> = new Map()

  /**
   * Constructor del servicio de sincronización de asistencias.
   *
   * @param {I18n} [i18n] - Instancia de i18n para internacionalización. Si no se proporciona,
   *                        las traducciones retornarán strings vacíos.
   *
   * @example
   * ```typescript
   * // Con i18n
   * const service = new SyncAssistsService(i18n)
   *
   * // Sin i18n (traducciones vacías)
   * const service = new SyncAssistsService()
   * ```
   */
  constructor(i18n?: I18n) {
    this.t = i18n?.formatMessage.bind(i18n) ?? (() => '')
    this.i18n = i18n
  }

  async getStatusSync(): Promise<AssistStatusResponseDto | null> {
    const assistStatusSync = await this.getAssistStatusSync()
    let lastPageSync = await this.getLastPageSync()
    if (assistStatusSync && lastPageSync) {
      let dataApiBiometrics = {
        pagination: {
          totalItems: 0,
          page: 0,
          pageSize: 0,
          totalPages: 0,
          DateParam: new Date(),
        },
      }

      try {
        dataApiBiometrics = await this.fetchExternalData(
          assistStatusSync.dateRequestSync.toJSDate(),
          lastPageSync.pageNumber
        )
      } catch (error) {}

      return new AssistStatusResponseDto(
        assistStatusSync,
        lastPageSync,
        dataApiBiometrics.pagination
      )
    }
    return null
  }

  async synchronize(startDate: string, page: number = 1, limit: number = 50) {
    const dateParam = new Date(startDate)
    let statusSync = await this.getAssistStatusSync()

    if (!statusSync) {
      page = 1
      let response = await this.fetchExternalData(dateParam, page, limit)
      statusSync = await this.createAssistStatusSync(response.pagination)
      await this.createPageSyncRecords(statusSync.id, response.pagination)
      await this.updateLocalData(response)
    } else if (new Date(statusSync.dateRequestSync.toJSDate()) > dateParam) {
      page = 1
      let response = await this.fetchExternalData(dateParam, page, limit)
      await this.resetSyncStatus(response.pagination, statusSync.id)
      await this.updateLocalData(response)
    } else {
      const pagesToSync = await this.getPagesByPageRequest(page)
      for await (const pageSync of pagesToSync) {
        await this.handleSyncAssists(
          statusSync,
          statusSync.dateRequestSync.toJSDate(),
          pageSync.pageNumber,
          limit
        )
      }
    }


    let result = await this.getAssistsRecords(dateParam, page, limit)
    let result2 = result.toJSON()

    result2.meta = {
      ...result2.meta,
      totalApiItems: statusSync.itemsTotalSync,
      totalApiPages: statusSync.pageTotalSync,
      apiPage: page,
      apiPageSize: limit,
    }
    // const year = dateParam.getUTCFullYear()
    // const month = String(dateParam.getUTCMonth() + 1).padStart(2, '0')
    // const day = String(dateParam.getUTCDate()).padStart(2, '0')
    // const dateStart = `${year}-${month}-${day}`

    // const today = DateTime.utc().toISODate()
    // await this.syncronizeAssistAllEmployeesCalendar(dateStart, today)
    return result2
  }

  async synchronizeByEmployee(filters: AssistSyncFilterInterface) {
    const dateParam = new Date(filters.startDate)
    const dateEndParam = new Date(filters.endDate)
    let response = await this.fetchExternalDataEmployee(
      dateParam,
      dateEndParam,
      filters.empCode,
      filters.page,
      filters.limit
    )
    const assists = await this.saveAssistDataEmployee(response)
    const assistService = new AssistsService(this.i18n as I18n)
    for await (const assist of assists) {
      const logAssist = await assistService.createActionLog(filters.rawHeaders, 'store')
      logAssist.user_id = filters.userId
      logAssist.create_from = 'sync'
      logAssist.record_current = JSON.parse(JSON.stringify(assist))
      await assistService.saveActionOnLog(logAssist)
    }
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_code', filters.empCode)
      .first()
    if (employee) {


      const filter: SyncAssistsServiceIndexInterface = {
        date: filters.startDate,
        dateEnd: filters.endDate,
        employeeID: employee.employeeId
      }
      await this.setDateCalendar(filter)
    }
    return response
  }

  async handleSyncAssists(statusSync: AssistStatusSync, dateParam: Date, page: number = 1, limit: number = 50) {
    let response = await this.fetchExternalData(dateParam, page, limit)
    await this.updateLocalData(response)
    await this.updatePageSync(page, 'sync', this.getItemsCountsPage(page, response.pagination))
    await this.updatePagination(response.pagination, statusSync)
  }

  async isPageSynced(pageSyncId: number) {
    const pageSync = await PageSync.query().where('id', pageSyncId).first()
    return pageSync?.pageStatus === 'sync'
  }
  getLogger = () => logger

  async getAssistsRecords(dateParam: Date, page: number, limit: number) {
    return Assist.query()
      .where('assist_active', 1)
      .where('assistPunchTimeUtc', '>', dateParam)
      .orderBy('assistPunchTimeUtc', 'asc')
      .paginate(page, limit)
  }

  async getAssistStatusSync() {
    return await AssistStatusSync.query().orderBy('date_request_sync', 'desc').first()
  }

  async createAssistStatusSync(pagination: PaginationDto) {
    return await AssistStatusSync.create({
      dateRequestSync: DateTime.fromISO(pagination.DateParam.toString()),
      dateTimeStartSync: DateTime.fromISO(pagination.DateParam.toString()),
      statusSync: 'in_process',
      pageTotalSync: pagination.totalPages,
      itemsTotalSync: pagination.totalItems,
    })
  }

  async getPageSync(statusSyncId: number, pageNumber: number = 1) {
    const pageSync = await PageSync.query()
      .where('status_sync_id', statusSyncId)
      .andWhere('page_number', pageNumber)
      .first()

    return pageSync
  }

  async resetSyncStatus(pagination: PaginationDto, statusSyncId: number) {
    const statusSync = await AssistStatusSync.query().where('id', statusSyncId).first()
    if (statusSync) {
      await statusSync
        .merge({
          dateRequestSync: DateTime.fromISO(pagination.DateParam.toString()),
          dateTimeStartSync: DateTime.fromISO(pagination.DateParam.toString()),
          statusSync: 'in_process',
          pageTotalSync: pagination.totalPages,
          itemsTotalSync: pagination.totalItems,
        })
        .save()
    }

    // delete all page sync records
    await PageSync.query().where('status_sync_id', statusSyncId).delete()
    // recreate page sync records
    await this.createPageSyncRecords(statusSyncId, pagination)
  }

  async fetchExternalData(startDate: Date, page: number, limit: number = 50): Promise<ResponseApiAssistsDto> {
    let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/transactions-async`
    apiUrl = `${apiUrl}?page=${page || ''}`
    apiUrl = `${apiUrl}&limit=${limit || ''}`
    apiUrl = `${apiUrl}&assistDate=${startDate.toISOString() || ''}`
    logger.info(`API URL: ${apiUrl}`)
    const apiResponse = await axios.get(apiUrl)
    let responseDataDto: ResponseApiAssistsDto
    responseDataDto = apiResponse.data
    responseDataDto.pagination = apiResponse.data.pagination
    return responseDataDto
  }

  async fetchExternalDataEmployee(
    startDate: Date,
    endDate: Date,
    empCode: string,
    page: number,
    limit: number = 50
  ): Promise<ResponseApiAssistsDto> {
    // Aquí harías la petición a la API externa
    let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/transactions-by-employee-async`
    apiUrl = `${apiUrl}?page=${page || ''}`
    apiUrl = `${apiUrl}&limit=${limit || ''}`
    apiUrl = `${apiUrl}&assistStartDate=${startDate.toISOString() || ''}`
    apiUrl = `${apiUrl}&assistEndDate=${endDate.toISOString() || ''}`
    apiUrl = `${apiUrl}&empCode=${empCode || ''}`
    logger.info(`API URL: ${apiUrl}`)
    const apiResponse = await axios.get(apiUrl)
    let responseDataDto: ResponseApiAssistsDto
    responseDataDto = apiResponse.data
    responseDataDto.pagination = apiResponse.data.pagination
    return responseDataDto
  }

  async updateLocalData(externalData: ResponseApiAssistsDto) {
    for await (const item of externalData.data) {
      const existingAssist = await Assist.findBy('assist_sync_id', item.id)

      if (existingAssist) {
        await existingAssist
          .merge({
            assistEmpCode: item.emp_code,
            assistTerminalSn: item.terminal_sn,
            assistTerminalAlias: item.terminal_alias,
            assistAreaAlias: item.area_alias,
            assistLongitude: item.longitude,
            assistLatitude: item.latitude,
            assistUploadTime: DateTime.fromISO(item.upload_time.toString()),
            assistEmpId: item.emp_id,
            assistTerminalId: item.terminal_id,
            assistPunchTime: DateTime.fromISO(item.punch_time_local.toString()),
            assistPunchTimeUtc: DateTime.fromISO(item.punch_time.toString()),
            assistPunchTimeOrigin: DateTime.fromISO(item.punch_time_origin_real.toString()),
          })
          .save()

      } else {
        const newAssist = new Assist()
        newAssist.assistEmpCode = item.emp_code
        newAssist.assistTerminalSn = item.terminal_sn
        newAssist.assistTerminalAlias = item.terminal_alias
        newAssist.assistAreaAlias = item.area_alias
        newAssist.assistLongitude = item.longitude
        newAssist.assistLatitude = item.latitude
        newAssist.assistUploadTime = DateTime.fromISO(item.upload_time.toString())
        newAssist.assistEmpId = item.emp_id
        newAssist.assistTerminalId = item.terminal_id
        newAssist.assistPunchTime = DateTime.fromISO(item.punch_time_local.toString())
        newAssist.assistPunchTimeUtc = DateTime.fromISO(item.punch_time.toString())
        newAssist.assistPunchTimeOrigin = DateTime.fromISO(item.punch_time_origin_real.toString())
        newAssist.assistSyncId = item.id
        await newAssist.save()

      }
    }
  }

  async saveAssistDataEmployee(externalData: ResponseApiAssistsDto) {
    const assists = [] as Array<Assist>

    for await (const item of externalData.data) {
      const existingAssist = await Assist.findBy('assist_sync_id', item.id)

      if (!existingAssist) {
        const newAssist = new Assist()
        newAssist.assistEmpCode = item.emp_code
        newAssist.assistTerminalSn = item.terminal_sn
        newAssist.assistTerminalAlias = item.terminal_alias
        newAssist.assistAreaAlias = item.area_alias
        newAssist.assistLongitude = item.longitude
        newAssist.assistLatitude = item.latitude
        newAssist.assistUploadTime = DateTime.fromISO(item.upload_time.toString())
        newAssist.assistEmpId = item.emp_id
        newAssist.assistTerminalId = item.terminal_id
        newAssist.assistPunchTime = DateTime.fromISO(item.punch_time_local.toString())
        newAssist.assistPunchTimeUtc = DateTime.fromISO(item.punch_time.toString())
        newAssist.assistPunchTimeOrigin = DateTime.fromISO(item.punch_time_origin_real.toString())
        newAssist.assistSyncId = item.id
        await newAssist.save()

        assists.push(newAssist)
      }
    }

    return assists
  }

  async setDateCalendar (filters: SyncAssistsServiceIndexInterface) {
    if (filters.employeeID !== undefined) {
      const empCalendar = await this.index(filters)
      if (empCalendar && empCalendar.status === 200 && empCalendar.data) {
        const calendarDayRes = empCalendar.data as any
        const calendarDay = calendarDayRes.employeeCalendar as AssistDayInterface[]
        calendarDay.forEach(async (calendarObject: AssistDayInterface) => {
          const existEmployeeAssistCalendar = await EmployeeAssistCalendar.query()
            .whereNull('employee_assist_calendar_deleted_at')
            .where('employee_id' , filters.employeeID as number)
            .where('day' , calendarObject.day)
            .first()
          let employeeAssistCalendar = new EmployeeAssistCalendar()
          if (existEmployeeAssistCalendar) {
            employeeAssistCalendar = existEmployeeAssistCalendar
          }

          employeeAssistCalendar.day = calendarObject.day
          employeeAssistCalendar.employeeId = filters.employeeID as number
          employeeAssistCalendar.checkInAssistId = calendarObject.assist.checkIn ? calendarObject.assist.checkIn.assistId : null
          employeeAssistCalendar.checkInDateTime = calendarObject.assist.checkInDateTime?.toISO() || null
          employeeAssistCalendar.checkInStatus = calendarObject.assist.checkInStatus
          employeeAssistCalendar.checkOutAssistId = calendarObject.assist.checkOut ? calendarObject.assist.checkOut.assistId : null
          employeeAssistCalendar.checkOutDateTime = calendarObject.assist.checkOutDateTime?.toISO() || null
          employeeAssistCalendar.checkOutStatus = calendarObject.assist.checkOutStatus
          employeeAssistCalendar.checkEatInAssistId = calendarObject.assist.checkEatIn ? calendarObject.assist.checkEatIn.assistId : null
          employeeAssistCalendar.checkEatOutAssistId = calendarObject.assist.checkEatOut ? calendarObject.assist.checkEatOut.assistId : null
          employeeAssistCalendar.shiftId = calendarObject.assist.dateShift?.shiftId || null
          employeeAssistCalendar.shiftIsChange = calendarObject.assist.dateShift?.shiftIsChange ? calendarObject.assist.dateShift?.shiftIsChange : false
          employeeAssistCalendar.hasExceptions = calendarObject.assist.hasExceptions
          employeeAssistCalendar.holidayId = calendarObject.assist.holiday?.holidayId || null
          employeeAssistCalendar.isBirthday = calendarObject.assist.isBirthday
          employeeAssistCalendar.isCheckInEatNextDay = calendarObject.assist.isCheckInEatNextDay ? calendarObject.assist.isCheckInEatNextDay : false
          employeeAssistCalendar.isCheckOutEatNextDay = calendarObject.assist.isCheckOutEatNextDay ? calendarObject.assist.isCheckOutEatNextDay : false
          employeeAssistCalendar.isCheckOutNextDay = calendarObject.assist.isCheckOutNextDay ? calendarObject.assist.isCheckOutNextDay : false
          employeeAssistCalendar.isFutureDay = calendarObject.assist.isFutureDay
          employeeAssistCalendar.isHoliday = calendarObject.assist.isHoliday
          employeeAssistCalendar.isRestDay = calendarObject.assist.isRestDay
          employeeAssistCalendar.isSundayBonus = calendarObject.assist.isSundayBonus
          employeeAssistCalendar.isVacationDate = calendarObject.assist.isVacationDate
          employeeAssistCalendar.isWorkDisabilityDate = calendarObject.assist.isWorkDisabilityDate
          employeeAssistCalendar.shiftCalculateFlag = calendarObject.assist.shiftCalculateFlag
          employeeAssistCalendar.hasAssitFlatList = calendarObject.assist.assitFlatList && calendarObject.assist.assitFlatList?.length > 0 ? true : false
          await employeeAssistCalendar.save()
        })
      } else if (empCalendar && empCalendar.status === 400 && empCalendar.title === 'no_employee_shifts') {
        const start = DateTime.fromISO(filters.date)
        const end = DateTime.fromISO(filters.dateEnd)

        let current = start

        while (current <= end) {
         if (current) {
          const day = current.toFormat('yyyy-MM-dd')
          const existEmployeeAssistCalendar = await EmployeeAssistCalendar.query()
            .whereNull('employee_assist_calendar_deleted_at')
            .where('employee_id' , filters.employeeID as number)
            .where('day' , day)
            .first()

          if (!existEmployeeAssistCalendar) {
            const employeeAssistCalendar = new EmployeeAssistCalendar()
            employeeAssistCalendar.day = day
            employeeAssistCalendar.employeeId = filters.employeeID as number
            employeeAssistCalendar.checkInAssistId = null
            employeeAssistCalendar.checkInDateTime = null
            employeeAssistCalendar.checkInStatus = ''
            employeeAssistCalendar.checkOutAssistId = null
            employeeAssistCalendar.checkOutDateTime = null
            employeeAssistCalendar.checkOutStatus = ''
            employeeAssistCalendar.checkEatInAssistId = null
            employeeAssistCalendar.checkEatOutAssistId = null
            employeeAssistCalendar.shiftId = null
            employeeAssistCalendar.shiftIsChange = false
            employeeAssistCalendar.hasExceptions = false
            employeeAssistCalendar.holidayId = null
            employeeAssistCalendar.isBirthday = false
            employeeAssistCalendar.isCheckInEatNextDay = false
            employeeAssistCalendar.isCheckOutEatNextDay = false
            employeeAssistCalendar.isCheckOutNextDay = false
            employeeAssistCalendar.isFutureDay = false
            employeeAssistCalendar.isHoliday = false
            employeeAssistCalendar.isRestDay = false
            employeeAssistCalendar.isSundayBonus = false
            employeeAssistCalendar.isVacationDate = false
            employeeAssistCalendar.isWorkDisabilityDate = false
            employeeAssistCalendar.shiftCalculateFlag = null
            employeeAssistCalendar.hasAssitFlatList = false
            await employeeAssistCalendar.save()
          }
         }
         current = current.plus({ days: 1 })
        }
      }
    }

  }

  async updatePageSync(page: number, status: string, itemsCount: number) {
    await PageSync.query().where('page_number', page).update({
      page_status: status,
      items_count: itemsCount,
    })
  }

  async createPageSyncRecords(statusSyncId: number, pagination: PaginationDto) {
    for (let pageNumber: number = 1; pageNumber <= pagination.totalPages; pageNumber++) {
      const existingPageSync = await PageSync.query()
        .where('status_sync_id', statusSyncId)
        .andWhere('page_number', pageNumber)
        .first()

      if (!existingPageSync) {
        const itemsCount = this.getItemsCountsPage(pageNumber, pagination)
        const pageNumberAsString = String(pageNumber)
        const statusPage = String(pagination.page) === pageNumberAsString ? 'sync' : 'pending'
        await PageSync.create({
          statusSyncId: statusSyncId,
          pageNumber: pageNumber,
          pageStatus: statusPage,
          itemsCount: itemsCount,
        })
      }
    }
  }

  async updatePagination(pagination: PaginationDto, statusSync: AssistStatusSync) {
    // update status sync
    logger.info(
      `Updating status sync with id ${statusSync.id}, page total sync ${pagination.totalPages} and items total sync ${pagination.totalItems}`
    )
    await AssistStatusSync.query().where('id', statusSync.id).update({
      pageTotalSync: pagination.totalPages,
      itemsTotalSync: pagination.totalItems,
    })

    for (let pageNumber: number = 1; pageNumber <= pagination.totalPages; pageNumber++) {
      let pageSync = await PageSync.query().where('page_number', pageNumber).first()
      const countItems = this.getItemsCountsPage(pageNumber, pagination)
      // logger information pages
      if (!pageSync) {
        await PageSync.create({
          statusSyncId: statusSync.id,
          pageNumber: pageNumber,
          pageStatus: 'pending',
          itemsCount: countItems,
        })
      } else {
        const countItemsString = String(countItems)
        const pageItemsString = String(pageSync.itemsCount)
        const statusText =
          countItemsString === pageItemsString && pageSync.pageStatus === 'sync'
            ? 'sync'
            : 'pending'
        await PageSync.query().where('page_number', pageNumber).update({
          pageStatus: statusText,
          itemsCount: countItems,
        })
      }
      statusSync.pageTotalSync = pagination.totalPages
      statusSync.itemsTotalSync = pagination.totalItems
      await statusSync.save()
    }
  }

  getItemsCountsPage(pageNumber: number, pagination: PaginationDto) {
    // Calcular la cantidad de ítems para la página actual
    let itemsCount
    if (pageNumber === pagination.totalPages) {
      const remainingItems = pagination.totalItems % pagination.pageSize
      itemsCount = remainingItems === 0 ? pagination.pageSize : remainingItems
    } else {
      itemsCount = pagination.pageSize
    }
    return itemsCount
  }

  async getPagesByPageRequest(page: number) {
    const pages = await PageSync.query()
      .where('page_number', '<=', page)
      .andWhere('page_status', 'pending')
      .orderBy('page_number', 'asc')
    const isLastPage = await this.isLastPage(page)
    if (pages.length === 0 && isLastPage) {
      return await PageSync.query().where('page_number', page)
    }
    return pages
  }

  async updatePageStatus(page: number) {
    // update pageSync where page_number is equal to page
    await PageSync.query().where('page_number', '<=', page).update({
      page_status: 'sync',
    })
  }

  async isLastPage(page: number) {
    const lastPage = await this.getLastPage()
    return lastPage?.pageNumber === page
  }

  async getLastPage() {
    return await PageSync.query().orderBy('page_number', 'desc').first()
  }

  async getLastPageSync(): Promise<PageSync | null> {
    const lastPageSync = await PageSync.query()
      .where('page_status', 'sync')
      .orderBy('page_number', 'desc')
      .first()

    if (!lastPageSync) {
      return await this.getLastPage()
    } else {
      return lastPageSync
    }
  }

  /**
   * Método principal para obtener el calendario de asistencias de un empleado.
   *
   * Este es el punto de entrada principal para consultar las asistencias de un empleado
   * en un rango de fechas. Procesa y calcula:
   * - Agrupación de asistencias por día
   * - Validación de check-in/check-out
   * - Aplicación de turnos asignados
   * - Cálculo de estados (tardanza, falta, tolerancia)
   * - Detección de excepciones, vacaciones, días festivos
   *
   * OPTIMIZACIONES IMPLEMENTADAS:
   * - Agrupación O(n) usando Map en lugar de bucles anidados O(n²)
   * - Bulk loading de relaciones (shift changes, exceptions, holidays)
   * - Caché de tolerancias y holidays
   *
   * @param {SyncAssistsServiceIndexInterface} bodyParams - Parámetros de búsqueda
   * @param {string} bodyParams.date - Fecha de inicio en formato ISO (yyyy-MM-dd)
   * @param {string} bodyParams.dateEnd - Fecha de fin en formato ISO (yyyy-MM-dd)
   * @param {number} [bodyParams.employeeID] - ID del empleado (opcional)
   * @param {boolean} [bodyParams.withOutExternal] - Si es true, filtra solo empleados internos
   * @param {{ page: number; limit: number }} [paginator] - Parámetros de paginación
   * @param {number} [paginator.page=1] - Número de página
   * @param {number} [paginator.limit=500] - Cantidad de registros por página
   *
   * @returns {Promise<Object>} Respuesta con el calendario de asistencias
   * @returns {number} return.status - Código de estado HTTP (200 = éxito, 400 = error)
   * @returns {string} return.type - Tipo de respuesta ('success' | 'warning')
   * @returns {string} return.title - Título de la respuesta
   * @returns {string} return.message - Mensaje descriptivo
   * @returns {Object} return.data - Datos del calendario
   * @returns {AssistDayInterface[]} return.data.employeeCalendar - Array de días con sus asistencias
   *
   * @throws {Object} Retorna objeto con status 400 si el empleado no existe
   *
   * @example
   * ```typescript
   * // Consultar asistencias de un empleado por 30 días
   * const result = await service.index({
   *   date: '2024-10-01',
   *   dateEnd: '2024-10-30',
   *   employeeID: 123
   * })
   *
   * // Con paginación
   * const result = await service.index({
   *   date: '2024-10-01',
   *   dateEnd: '2024-10-30',
   *   employeeID: 123
   * }, { page: 1, limit: 100 })
   *
   * // Solo empleados internos
   * const result = await service.index({
   *   date: '2024-10-01',
   *   dateEnd: '2024-10-30',
   *   employeeID: 123,
   *   withOutExternal: true
   * })
   * ```
   *
   * @description
   * El proceso completo incluye:
   * 1. Conversión de fechas a zona horaria UTC-6 (CST)
   * 2. Consulta de asistencias desde la base de datos
   * 3. Obtención de turnos asignados al empleado
   * 4. Agrupación de asistencias por día (optimizado con Map)
   * 5. Precarga de relaciones (shift changes, exceptions, holidays)
   * 6. Cálculo del calendario con todas las validaciones
   * 7. Retorno del calendario completo
   */
  async index (bodyParams: SyncAssistsServiceIndexInterface, paginator?: { page: number; limit: number }) {
    const intialSyncDate = '2024-01-01T00:00:00.000-06:00'
    const stringDate = `${bodyParams.date}T00:00:00.000-06:00`
    const time = DateTime.fromISO(stringDate, { setZone: true })
    const timeCST = time.setZone('UTC-6')
    const filterInitialDate = timeCST.toFormat('yyyy-LL-dd HH:mm:ss')
    const stringEndDate = `${bodyParams.dateEnd}T23:59:59.000-06:00`
    const timeEnd = DateTime.fromISO(stringEndDate, { setZone: true })
    const timeEndCST = timeEnd.setZone('UTC-6').plus({ days: 1 })
    const filterEndDate = timeEndCST.toFormat('yyyy-LL-dd HH:mm:ss')
    const query = Assist.query()
      .where('assist_active', 1)
    let employee = null

    if (bodyParams.date && !bodyParams.dateEnd) {
      query.where('assist_punch_time_origin', '>=', filterInitialDate)
    }

    if (bodyParams.dateEnd && bodyParams.date) {
      query.where('assist_punch_time_origin', '>=', filterInitialDate)
      query.where('assist_punch_time_origin', '<', filterEndDate)
    }

    if (bodyParams.employeeID) {
      employee = await Employee.query()
        .where('employee_id', bodyParams.employeeID || 0)
        .if(bodyParams.withOutExternal, (subQuery) => {
          subQuery.where('employee_type_of_contract', 'Internal')
        })
        .withTrashed()
        .first()
      if (!employee) {
        const entity = this.t('employee')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found', { entity }),
          data: null,
        }
      }

      query.where('assist_emp_code', employee.employeeCode)
    }
    query.orderBy('assist_punch_time_origin', 'desc')

    const assistDayCollection: AssistDayInterface[] = []
    const endDate = timeEndCST.minus({ days: 1 })
    const employeeShiftFilter = { dateStart: intialSyncDate, dateEnd: stringEndDate, employeeId: bodyParams.employeeID }
    const serviceResponse = await new ShiftForEmployeeService().getEmployeeShifts(employeeShiftFilter, 999999999999999, 1)

    if (serviceResponse.status !== 200) {
      return serviceResponse
    }

    const dailyShifts: EmployeeRecordInterface[] = serviceResponse.status === 200 ? ((serviceResponse.data?.data || []) as EmployeeRecordInterface[]) : []
    const employeeShifts: ShiftRecordInterface[] = dailyShifts[0].employeeShifts as ShiftRecordInterface[]
    const assistList = await query.paginate(paginator?.page || 1, paginator?.limit || 500)
    const assistListFlat  = assistList.toJSON().data as AssistInterface[]

    // OPTIMIZACIÓN: Agrupar assists por día usando Map en lugar de buscar en cada iteración (O(n) vs O(n²))
    const assistsByDay = new Map<string, AssistInterface[]>()

    for (const item of assistListFlat) {
      const assist = item as AssistInterface
      const assistDate = DateTime.fromISO(`${assist.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')
      const dayKey = assistDate.toFormat('yyyy-LL-dd')

      assist.assistUsed = false

      if (!assistsByDay.has(dayKey)) {
        assistsByDay.set(dayKey, [])
      }
      assistsByDay.get(dayKey)!.push(assist)
    }

    // OPTIMIZACIÓN: Si hay empleado, cargar todos los shift changes del rango de una sola vez
    let shiftChangesMap = new Map<string, any[]>()
    if (employee) {
      const rangeDays = Math.floor(timeEndCST.diff(timeCST, 'days').days) + 2
      const allDays: string[] = []

      for (let i = 0; i < rangeDays; i++) {
        const day = timeCST.plus({ days: i }).toFormat('yyyy-LL-dd')
        allDays.push(day)
      }

      // Cargar todos los shift changes del rango en una sola consulta
      await employee.load('shiftChanges', (queryShiftChange) => {
        queryShiftChange.where('employeeShiftChangeDateFrom', '>=', `${timeCST.minus({ days: 1 }).toFormat('yyyy-LL-dd')} 00:00:00`)
        queryShiftChange.where('employeeShiftChangeDateFrom', '<=', `${timeEndCST.toFormat('yyyy-LL-dd')} 23:59:59`)
      })

      // Organizar shift changes por día
      employee.shiftChanges.forEach((shiftChange: any) => {
        const changeDate = DateTime.fromJSDate(new Date(shiftChange.employeeShiftChangeDateFrom)).toFormat('yyyy-LL-dd')
        if (!shiftChangesMap.has(changeDate)) {
          shiftChangesMap.set(changeDate, [])
        }
        shiftChangesMap.get(changeDate)!.push(shiftChange)
      })
    }

    // Procesar cada día agrupado
    for (const [dayKey, dayAssists] of assistsByDay) {
      // Ordenar assists del día
      const dayAssist = dayAssists.sort((a: any, b: any) =>
        new Date(a.assistPunchTimeUtc).getTime() - new Date(b.assistPunchTimeUtc).getTime()
      )

      const dateShift = this.getAssignedDateShift(dayAssists[0].assistPunchTimeUtc, employeeShifts)

      assistDayCollection.push({
        day: dayKey,
        assist: {
          checkIn: this.getCheckInDate(dayAssist),
          checkEatIn: this.getCheckEatInDate(dayAssist),
          checkEatOut: this.getCheckEatOutDate(dayAssist),
          checkOut: this.getCheckOutDate(dayAssist),
          dateShift: dateShift ? dateShift.shift : null,
          dateShiftApplySince: dateShift ? dateShift.employeShiftsApplySince : null,
          employeeShiftId: dateShift ? dateShift.employeeShiftId : null,
          shiftCalculateFlag: dateShift ? dateShift.shiftCalculateFlag : '',
          checkInDateTime: null,
          checkOutDateTime: null,
          checkInStatus: '',
          checkOutStatus: '',
          isFutureDay: false,
          isSundayBonus: false,
          isRestDay: false,
          isVacationDate: false,
          isWorkDisabilityDate: false,
          isHoliday: false,
          isBirthday: false,
          holiday: null,
          hasExceptions: false,
          exceptions: [],
          assitFlatList: dayAssist,
        },
      })
    }

    // OPTIMIZACIÓN: Cargar holidays del rango en una sola consulta
    await this.loadHolidaysInRange(timeCST, endDate)

    const { delayTolerance, faultTolerance } = await this.getTolerances()
    const TOLERANCE_DELAY_MINUTES = delayTolerance?.toleranceMinutes || 10
    const TOLERANCE_FAULT_MINUTES = faultTolerance?.toleranceMinutes || 30

    const employeeCalendar = await this.getEmployeeCalendar(
      timeCST,
      endDate,
      assistDayCollection,
      employeeShifts,
      bodyParams.employeeID,
      TOLERANCE_DELAY_MINUTES,
      TOLERANCE_FAULT_MINUTES,
      employee
    )


    return {
      status: 200,
      type: 'success',
      title: this.t('resources'),
      message: this.t('resources_were_found_successfully'),
      data: {
        employeeCalendar,
      },
    }
  }

  private getAssignedDateShift(compareDateTime: Date | DateTime, dailyShifs: ShiftRecordInterface[]) {
    const DayTime = DateTime.fromISO(`${compareDateTime}`, { setZone: true })
    const checkTime = DayTime.setZone('UTC-6')

    let availableShifts = dailyShifs.filter((shift) => {
      const shiftDate = DateTime.fromJSDate(new Date(shift.employeShiftsApplySince)).setZone('UTC-6')

      if (checkTime >= shiftDate) {
        return shiftDate
      }
    })

    availableShifts = availableShifts.sort((a: any, b: any) => b.employeShiftsApplySince - a.employeShiftsApplySince)

    const selectedShift = availableShifts[0]
    return selectedShift
  }

  /**
   * Genera el calendario completo de asistencias para un empleado en un rango de fechas.
   *
   * Esta función es el núcleo del procesamiento de asistencias. Toma las asistencias
   * agrupadas por día y aplica todas las validaciones y reglas de negocio:
   * - Asigna turnos a cada día
   * - Detecta días festivos y cumpleaños
   * - Aplica cambios de turno
   * - Detecta excepciones
   * - Calcula estados de check-in/check-out
   * - Valida tolerancias y retardos
   * - Detecta vacaciones, incapacidades, días de descanso
   *
   * OPTIMIZACIÓN: Esta función carga todas las relaciones (shift changes, exceptions)
   * en bulk para el rango completo, evitando el problema N+1 de queries.
   *
   * @private
   * @param {Date | DateTime} dateStart - Fecha de inicio del rango
   * @param {Date | DateTime} dateEnd - Fecha de fin del rango
   * @param {AssistDayInterface[]} employeeAssist - Array de asistencias ya agrupadas por día
   * @param {ShiftRecordInterface[]} employeeShifts - Array de turnos asignados al empleado
   * @param {number} [employeeID] - ID del empleado (opcional)
   * @param {number} TOLERANCE_DELAY_MINUTES - Minutos de tolerancia para considerar tardanza
   * @param {number} TOLERANCE_FAULT_MINUTES - Minutos de tolerancia para considerar falta
   * @param {Employee | null} employee - Instancia del modelo Employee (puede ser null)
   *
   * @returns {Promise<AssistDayInterface[]>} Array completo de días con todas las validaciones aplicadas
   *
   * @description
   * El proceso incluye:
   * 1. Precarga de todas las relaciones del empleado (shift changes, exceptions) en bulk
   * 2. Creación de un calendario base con todos los días del rango
   * 3. Para cada día:
   *    - Asignación del turno correspondiente
   *    - Detección de cambios de turno
   *    - Detección de excepciones
   *    - Cálculo de check-in/check-out esperados
   *    - Validación de estados
   *    - Aplicación de reglas de negocio
   *
   * @example
   * ```typescript
   * const calendar = await this.getEmployeeCalendar(
   *   DateTime.fromISO('2024-10-01'),
   *   DateTime.fromISO('2024-10-30'),
   *   assistsByDay,
   *   employeeShifts,
   *   123,
   *   10, // TOLERANCE_DELAY_MINUTES
   *   30, // TOLERANCE_FAULT_MINUTES
   *   employeeInstance
   * )
   * ```
   */
  private async getEmployeeCalendar(
    dateStart: Date | DateTime,
    dateEnd: Date | DateTime,
    employeeAssist: AssistDayInterface[],
    employeeShifts: ShiftRecordInterface[],
    employeeID: number | undefined,
    TOLERANCE_DELAY_MINUTES: number,
    TOLERANCE_FAULT_MINUTES: number,
    employee: Employee | null
  ) {
    if (employee) {
      await employee.load('person')
    }
    const dateTimeStart = DateTime.fromISO(`${dateStart}`, { setZone: true }).setZone('UTC-6')
    const dateTimeEnd = DateTime.fromISO(`${dateEnd}`, { setZone: true }).setZone('UTC-6')

    const daysBetween = Math.floor(dateTimeEnd.diff(dateTimeStart, 'days').days) + 1
    const assistList = employeeAssist
    const dailyAssistList: AssistDayInterface[] = []

    // OPTIMIZACIÓN: Precargar todas las relaciones del empleado para el rango completo
    const shiftChangesMap = new Map<string, any[]>()
    const exceptionsMap = new Map<string, any[]>()

    if (employee && employeeID) {
      // Cargar todos los shift changes del rango de una sola vez
      await employee.load('shiftChanges', (query) => {
        query.where('employeeShiftChangeDateFrom', '>=', `${dateTimeStart.toFormat('yyyy-LL-dd')} 00:00:00`)
        query.where('employeeShiftChangeDateFrom', '<=', `${dateTimeEnd.toFormat('yyyy-LL-dd')} 23:59:59`)
      })

      // Organizar shift changes por día
      employee.shiftChanges.forEach((shiftChange: any) => {
        const changeDate = DateTime.fromJSDate(new Date(shiftChange.employeeShiftChangeDateFrom)).toFormat('yyyy-LL-dd')
        if (!shiftChangesMap.has(changeDate)) {
          shiftChangesMap.set(changeDate, [])
        }
        shiftChangesMap.get(changeDate)!.push(shiftChange)
      })

      // Cargar todas las excepciones del rango de una sola vez
      await employee.load('shift_exceptions', (query) => {
        query.where('shiftExceptionsDate', '>=', `${dateTimeStart.toFormat('yyyy-LL-dd')} 00:00:00`)
        query.where('shiftExceptionsDate', '<=', `${dateTimeEnd.toFormat('yyyy-LL-dd')} 23:59:59`)
      })

      // Organizar excepciones por día
      employee.shift_exceptions.forEach((exception: any) => {
        const exceptionDate = DateTime.fromJSDate(new Date(exception.shiftExceptionsDate)).toFormat('yyyy-LL-dd')
        if (!exceptionsMap.has(exceptionDate)) {
          exceptionsMap.set(exceptionDate, [])
        }
        exceptionsMap.get(exceptionDate)!.push(exception)
      })
    }

    // Crear la lista de días
    for (let index = 0; index < daysBetween; index++) {
      const currentDate = DateTime.fromISO(`${dateStart}`, { setZone: true }).setZone('UTC-6').plus({ days: index })
      const dateShift = this.getAssignedDateShift(currentDate, employeeShifts)
      const fakeCheck: AssistDayInterface = {
        day: currentDate.toFormat('yyyy-LL-dd'),
        assist: {
          checkIn: null,
          checkOut: null,
          checkEatIn: null,
          checkEatOut: null,
          dateShift: dateShift ? dateShift.shift : null,
          dateShiftApplySince: dateShift ? dateShift.employeShiftsApplySince : null,
          employeeShiftId: dateShift ? dateShift.employeeShiftId : null,
          shiftCalculateFlag: dateShift ? dateShift.shiftCalculateFlag : '',
          checkInDateTime: null,
          checkOutDateTime: null,
          checkInStatus: '',
          checkOutStatus: '',
          isFutureDay: false,
          isSundayBonus: false,
          isRestDay: false,
          isVacationDate: false,
          isWorkDisabilityDate: false,
          isHoliday: false,
          isBirthday: false,
          holiday: null,
          hasExceptions: false,
          exceptions: [],
          assitFlatList: [],
        },
      }

      dailyAssistList.push(fakeCheck)
    }

    let dailyAssistListCounter = 0

    const isDiscriminated = employee?.employeeAssistDiscriminator === 1

    for await (const item of dailyAssistList) {
      const date = assistList.find((assistDate) => assistDate.day === item.day)
      let dateAssistItem = date || item

      dateAssistItem.assist.isCheckOutNextDay = false
      dateAssistItem.assist.isCheckInEatNextDay = false
      dateAssistItem.assist.isCheckOutEatNextDay = false

      // OPTIMIZACIÓN: Pasar los mapas precargados en lugar de hacer consultas
      await Promise.all([
        this.isHoliday(dateAssistItem),
        this.hasOtherShift(employeeID, dateAssistItem, employee, shiftChangesMap),
        this.isBirthday(dateAssistItem, employee),
        this.isExceptionDate(employeeID, dateAssistItem, employee, exceptionsMap)
      ])

      this.setCheckInDateTime(dateAssistItem)
      this.setCheckOutDateTime(dateAssistItem)
      this.calculateRawCalendar(dateAssistItem, assistList)
      this.checkInStatus(dateAssistItem, TOLERANCE_FAULT_MINUTES, TOLERANCE_DELAY_MINUTES, isDiscriminated)
      this.checkOutStatus(dateAssistItem, isDiscriminated)
      this.isSundayBonus(dateAssistItem)
      this.isVacationDate(employeeID, dateAssistItem, employee)
      this.isWorkDisabilityDate(employeeID, dateAssistItem, employee)
      this.validTime(dateAssistItem)
      this.hasSomeExceptionTimeCheckIn(dateAssistItem, TOLERANCE_DELAY_MINUTES)
      this.hasSomeExceptionTimeCheckOut(dateAssistItem)
      this.hasSomeException(employeeID, dateAssistItem, employee)
      this.verifyCheckOutToday(dateAssistItem)

      if (dateAssistItem.assist.dateShift) {
        const isShiftChanged = dateAssistItem.assist.dateShift.shiftIsChange
        const shift = JSON.parse(JSON.stringify(dateAssistItem.assist.dateShift))
        shift.shiftIsChange = isShiftChanged
        dateAssistItem.assist.dateShift = shift
      }

      dailyAssistList[dailyAssistListCounter] = dateAssistItem
      dailyAssistListCounter = dailyAssistListCounter + 1
    }

    return dailyAssistList
  }

  /**
   * Carga todos los días festivos (holidays) de un rango de fechas y los almacena en caché.
   *
   * OPTIMIZACIÓN: En lugar de consultar holidays día por día (N queries),
   * esta función carga todos los holidays del rango en una sola consulta (1 query)
   * y los almacena en un Map para acceso O(1) posterior.
   *
   * Esto elimina el problema N+1 donde se hacían 30 consultas para 30 días,
   * reduciéndolo a solo 1 consulta para todo el rango.
   *
   * @private
   * @param {DateTime} dateStart - Fecha de inicio del rango
   * @param {DateTime} dateEnd - Fecha de fin del rango
   *
   * @returns {Promise<void>} No retorna nada, solo popula el caché interno
   *
   * @description
   * El caché se organiza por fecha (yyyy-MM-dd) para acceso rápido:
   * - Clave: fecha en formato 'yyyy-MM-dd' (ej: '2024-10-15')
   * - Valor: objeto HolidayInterface con los datos del día festivo
   *
   * Si el caché ya tiene datos, no vuelve a consultar (early return).
   *
   * @example
   * ```typescript
   * // Cargar holidays de octubre 2024
   * await this.loadHolidaysInRange(
   *   DateTime.fromISO('2024-10-01'),
   *   DateTime.fromISO('2024-10-31')
   * )
   *
   * // Acceder después desde el caché
   * const holiday = this.holidaysCache.get('2024-10-12') // Día de la raza
   * ```
   */
  private async loadHolidaysInRange(dateStart: DateTime, dateEnd: DateTime) {
    if (this.holidaysCache.size > 0) {
      return // Ya están en caché
    }

    const service = await new HolidayService(this.i18n as I18n).index(
      dateStart.toFormat('yyyy-LL-dd'),
      dateEnd.toFormat('yyyy-LL-dd'),
      '',
      1,
      10000
    )

    if (service.status === 200 && service.holidays) {
      service.holidays.forEach((holiday: any) => {
        const holidayDate = DateTime.fromJSDate(new Date(holiday.holidayDate)).toFormat('yyyy-LL-dd')
        this.holidaysCache.set(holidayDate, holiday as HolidayInterface)
      })
    }
  }

  private async isHoliday(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return checkAssist
    }

    // Buscar en caché en lugar de hacer una consulta
    const holidayresponse = this.holidaysCache.get(checkAssist.day) || null
    // const hourStart = assignedShift.shiftTimeStart
    // const stringDate = `${checkAssist.day}T${hourStart}.000-06:00`
    // const timeToStart = DateTime.fromISO(stringDate, { setZone: true }).setZone('UTC-6')
    // const service = await new HolidayService(this.i18n as I18n).index(timeToStart.toFormat('yyyy-LL-dd'), timeToStart.toFormat('yyyy-LL-dd'), '', 1, 100)
    // const holidayresponse =  service.status === 200 && service.holidays && service.holidays.length > 0 ? service.holidays[0] : null

    checkAssist.assist.holiday = holidayresponse as unknown as HolidayInterface
    checkAssist.assist.isHoliday = !!(holidayresponse)

    return checkAssist
  }

  private async isBirthday(checkAssist: AssistDayInterface, employee: Employee | null) {
    if (!employee?.person.personBirthday) {
      return checkAssist
    }
    const rawDate = employee.person.personBirthday

    const birthday = typeof rawDate === 'string'
      ? DateTime.fromISO(rawDate)
      : DateTime.fromJSDate(rawDate)
    const currentDate = DateTime.fromISO(checkAssist.day)

    checkAssist.assist.isBirthday = birthday.month === currentDate.month && birthday.day === currentDate.day
    return checkAssist
  }

  private async hasOtherShift(employeeID: number | undefined, checkAssist: AssistDayInterface, employee: Employee | null, shiftChangesMap: Map<string, any[]>) {
    if (!employeeID) {
      return checkAssist
    }

    if (!employee) {
      return checkAssist
    }

    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    checkAssist.assist.dateShift.shiftIsChange = false

    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return checkAssist
    }

    // Buscar en el mapa precargado en lugar de hacer una consulta
    const dayShiftChanges = shiftChangesMap.get(checkAssist.day) || []

    if (dayShiftChanges.length > 0) {
      if (dayShiftChanges[0].shiftTo) {
        checkAssist.assist.dateShift = dayShiftChanges[0].shiftTo
        checkAssist.assist.isRestDay = false

        if (dayShiftChanges[0].employeeShiftChangeDateToIsRestDay) {
          checkAssist.assist.isRestDay = true
        }

        if (checkAssist.assist.dateShift) {
          checkAssist.assist.dateShift.shiftIsChange = true
        }
      }
    }
    return checkAssist
  }

  private setCheckInDateTime (checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const hourStart = checkAssist.assist.dateShift.shiftTimeStart
    const dateYear = checkAssist.day.split('-')[0].toString().padStart(2, '0')
    const dateMonth = checkAssist.day.split('-')[1].toString().padStart(2, '0')
    const dateDay = checkAssist.day.split('-')[2].toString().padStart(2, '0')
    const stringDate = `${dateYear}-${dateMonth}-${dateDay}T${hourStart}.000-06:00`
    const timeToStart = DateTime.fromISO(stringDate, { setZone: true }).setZone('UTC').plus({ minutes: 1 })

    checkAssist.assist.checkInDateTime = timeToStart

    return checkAssist
  }

  private setCheckOutDateTime (checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const hourStart = checkAssist.assist.dateShift.shiftTimeStart
    const dateYear = checkAssist.day.split('-')[0].toString().padStart(2, '0')
    const dateMonth = checkAssist.day.split('-')[1].toString().padStart(2, '0')
    const dateDay = checkAssist.day.split('-')[2].toString().padStart(2, '0')
    const stringDate = `${dateYear}-${dateMonth}-${dateDay}T${hourStart}.000-06:00`
    const timeToAdd = checkAssist.assist.dateShift.shiftActiveHours * 60 - 1
    const timeToEnd = DateTime.fromISO(stringDate, { setZone: true }).setZone('UTC').plus({ minutes: timeToAdd })

    checkAssist.assist.checkOutDateTime = timeToEnd

    return checkAssist
  }

  private async isExceptionDate(employeeID: number | undefined, checkAssist: AssistDayInterface, employee: Employee | null, exceptionsMap: Map<string, any[]>) {
    if (!employeeID) {
      return checkAssist
    }

    if (!employee) {
      return checkAssist
    }

    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return checkAssist
    }

    // Buscar en el mapa precargado en lugar de hacer una consulta
    const dayExceptions = exceptionsMap.get(checkAssist.day) || []

    checkAssist.assist.hasExceptions = dayExceptions.length > 0
    checkAssist.assist.exceptions = dayExceptions as unknown as ShiftExceptionInterface[]

    return checkAssist
  }

  /**
   * Calcula y asigna los checks (check-in, check-out, comida) a un día específico del calendario.
   *
   * Esta es una de las funciones más complejas del sistema. Maneja múltiples casos especiales:
   * - Turnos que abarcan dos días (turnos nocturnos)
   * - Turnos con cambios (shift changes)
   * - Excepciones especiales (descanso laborado, cobertura de turno, vacaciones)
   * - Ajuste por horario de verano (DST)
   * - Validación de días de descanso
   *
   * LÓGICA CRÍTICA:
   * 1. Si el turno cubre dos días, obtiene checks del día actual Y del día siguiente
   * 2. Aplica corrección de horario de verano si es necesario
   * 3. Filtra checks que corresponden al turno (3 horas antes de inicio, 3 horas después de salida)
   * 4. Asigna checks en orden: checkIn, checkEatIn, checkEatOut, checkOut
   * 5. Aplica reglas de excepciones (vacaciones, descansos laborados, etc.)
   *
   * @private
   * @param {AssistDayInterface} dateAssistItem - Objeto del día a procesar
   * @param {AssistDayInterface[]} assistList - Lista completa de días con asistencias (para buscar días siguientes)
   *
   * @returns {AssistDayInterface} El mismo objeto dateAssistItem modificado con los checks asignados
   *
   * @description
   * CASOS ESPECIALES MANEJADOS:
   *
   * 1. TURNOS DE DOS DÍAS:
   *    - Si checkOutDateTime es del día siguiente, busca checks en ambos días
   *    - Filtra checks del día anterior (3 horas antes del inicio del turno)
   *    - Filtra checks del día siguiente (3 horas después del fin del turno)
   *
   * 2. EXCEPCIONES:
   *    - 'descanso-laborado': Marca como día laboral aunque sea descanso
   *    - 'cover-shift': Marca como día laboral (cobertura de turno)
   *    - 'rest-day': Marca como día de descanso
   *    - 'vacation': Elimina todos los checks y marca como vacación
   *
   * 3. DÍAS DE DESCANSO:
   *    - Si es día de descanso y NO hay excepción de "descanso laborado", elimina checks
   *    - Si hay excepción de "descanso laborado", mantiene los checks
   *
   * @example
   * ```typescript
   * // Ejemplo de turno normal (1 día)
   * // Entrada: 4 checks en el día
   * // Salida: checkIn=1er check, checkEatIn=2do check, checkEatOut=3er check, checkOut=4to check
   *
   * // Ejemplo de turno nocturno (2 días)
   * // Entrada: 2 checks día 1, 2 checks día 2
   * // Salida: checkIn=1er check día 1, checkEatIn=1er check día 2, checkOut=2do check día 2
   * ```
   */
  private async calculateRawCalendar(dateAssistItem: AssistDayInterface, assistList: AssistDayInterface[]) {
    const startDay = DateTime.fromJSDate(new Date(`${dateAssistItem.assist.dateShiftApplySince}`)).setZone('UTC-6')
    const evaluatedDay = DateTime.fromISO(`${dateAssistItem.day}T00:00:00.000-06:00`).setZone('UTC-6')
    const checkOutDateTime = DateTime.fromJSDate(new Date(`${dateAssistItem.assist.checkOutDateTime}`)).setZone('UTC-6')

    if (dateAssistItem.assist.assitFlatList) {
      dateAssistItem.assist.assitFlatList = this.fixedCSTSummerTime(evaluatedDay.toJSDate(), dateAssistItem.assist.assitFlatList)
    }

    const checkInDateTime = DateTime.fromJSDate(new Date(`${dateAssistItem.assist.checkInDateTime}`)).setZone('UTC-6')
    const shangeShiftStartDay = dateAssistItem.assist.dateShift?.shiftIsChange ? evaluatedDay : startDay

    const calendarDayStatus = this.calendarDayStatus(dateAssistItem, evaluatedDay, shangeShiftStartDay, dateAssistItem.assist.shiftCalculateFlag)

    let isStartWorkday = calendarDayStatus.isStartWorkday
    let isRestWorkday = calendarDayStatus.isRestWorkday

    if (isRestWorkday !==  dateAssistItem.assist.isRestDay &&  dateAssistItem.assist.dateShift?.shiftIsChange) {
      isRestWorkday = dateAssistItem.assist.isRestDay
    }
    dateAssistItem.assist.isFutureDay = calendarDayStatus.isNextDay

    if (dateAssistItem.assist.exceptions.length > 0) {
      const workRestDay = dateAssistItem.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'descanso-laborado')
      if (workRestDay) {
        isStartWorkday = true
        isRestWorkday = false

        if (dateAssistItem.assist.exceptions.length > 0) {
          dateAssistItem.assist.checkInStatus = ''
        }
      } else {
        const restDay = dateAssistItem.assist.exceptions.find((ex) => ex.exceptionType?.exceptionTypeSlug === 'rest-day')
        if (restDay) {
          isRestWorkday = true
        }
      }

      const coverShiftDay = dateAssistItem.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'cover-shift')

      if (coverShiftDay) {
        isStartWorkday = true
        isRestWorkday = false

        if (dateAssistItem.assist.exceptions.length > 0) {
          dateAssistItem.assist.checkInStatus = ''
        }
      }

      const vacationDay = dateAssistItem.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'vacation')

      if (vacationDay) {
        dateAssistItem.assist.isVacationDate = true

        dateAssistItem.assist.checkInStatus = ''
        dateAssistItem.assist.checkOutStatus = ''

        dateAssistItem.assist.checkIn = null
        dateAssistItem.assist.checkEatIn = null
        dateAssistItem.assist.checkEatOut = null
        dateAssistItem.assist.checkOut = null
      }
    }

    if (isStartWorkday) {
      const checkOutShouldbeNextDay = checkOutDateTime.toFormat('yyyy-LL-dd') > checkInDateTime.toFormat('yyyy-LL-dd')

      if (checkOutShouldbeNextDay) {
        dateAssistItem.assist.checkIn = null
        dateAssistItem.assist.checkEatIn = null
        dateAssistItem.assist.checkEatOut = null
        dateAssistItem.assist.checkOut = null

        if (dateAssistItem.assist.assitFlatList) {
          const calendarDay: AssistInterface[] = []

          /**
           * =================================================================================================================
           * LÓGICA PARA TURNOS NOCTURNOS (2 DÍAS) - PARTE 1: CHECKS DEL DÍA ACTUAL
           * =================================================================================================================
           *
           * PROBLEMA: Cuando un turno empieza un día y termina al día siguiente, los checks pueden estar
           * distribuidos en ambos días. Necesitamos filtrar solo los checks que pertenecen a este turno.
           *
           * EJEMPLO PRÁCTICO:
           * - Turno: 22:00 (día 1) -> 06:00 (día 2)
           * - Checks día 1: 21:30, 22:05, 00:30, 02:00
           * - Checks día 2: 05:45, 06:10
           *
           * SOLUCIÓN:
           * - Tomamos checks del día actual que sean >= 3 horas antes del inicio del turno
           * - Esto evita tomar checks del turno anterior (ej: 19:00 del día anterior)
           * - Pero permite tomar checks del turno actual (ej: 21:30 del día actual)
           *
           * FILTRO APLICADO: checks >= (inicio_turno - 3 horas)
           * - Turno inicia: 22:00
           * - Ventana permitida: >= 19:00
           * - Resultado: 21:30, 22:05, 00:30, 02:00 (todos >= 19:00)
           *
           * NOTA: El filtro de "3 horas antes" evita confundir checks del turno anterior con checks del
           * turno actual, especialmente en horarios de comida del turno anterior.
           * =================================================================================================================
           */
          const checkInToNexCalendarDay = this.setNexCalendarDayCheckIns(dateAssistItem.assist.assitFlatList, checkInDateTime)
          calendarDay.push(...checkInToNexCalendarDay)

          /**
           * =================================================================================================================
           * LÓGICA PARA TURNOS NOCTURNOS (2 DÍAS) - PARTE 2: CHECKS DEL DÍA SIGUIENTE
           * =================================================================================================================
           *
           * PROBLEMA: Los checks de salida del turno nocturno están en el día siguiente.
           * Necesitamos obtener checks del día siguiente que pertenezcan a este turno.
           *
           * EJEMPLO PRÁCTICO (continuación):
           * - Checks día 2: 05:45, 06:10, 08:00
           * - Turno termina: 06:00
           *
           * SOLUCIÓN:
           * - Tomamos checks del día siguiente que sean <= 3 horas después del fin del turno
           * - Esto evita tomar checks del siguiente turno (ej: 08:00 del día siguiente si el siguiente turno empieza antes)
           * - Pero permite tomar checks del turno actual (ej: 05:45, 06:10 del día siguiente)
           *
           * FILTRO APLICADO: checks <= (fin_turno + 3 horas)
           * - Turno termina: 06:00
           * - Ventana permitida: <= 09:00
           * - Resultado: 05:45, 06:10 (ambos <= 09:00)
           *
           * NOTA: Si el empleado se quedó más tiempo (ej: hasta las 08:00), se consideran esos checks
           * siempre que no entren en conflicto con el siguiente turno. El margen de 3 horas permite
           * flexibilidad sin interferir con el siguiente turno.
           * =================================================================================================================
           */
          const checkOutToNexCalendarDay = this.setNexCalendarDayCheckOuts(evaluatedDay, assistList, checkOutDateTime)
          calendarDay.push(...checkOutToNexCalendarDay)

          /**
           * =================================================================================================================
           * COMENZAMOS A FORMAR EL CALENDARIO YA QUE SE HAN DESCARTADO LOS CHECKS QUE NO SON
           * DEL TURNO DEL DIA Y EN EL CALENDARIO YA CONTAMOS CON TODOS LOS CHECKS QUE CORRESPONDEN AL TURNO
           * =================================================================================================================
           */
          if (calendarDay.length > 0) {
            dateAssistItem.assist.checkIn = calendarDay[0]

            if (calendarDay.length >= 2) {
              dateAssistItem.assist.checkEatIn = calendarDay[1]
            }

            if (calendarDay.length >= 3) {
              dateAssistItem.assist.checkEatOut = calendarDay[2]
            }

            const nowDate = DateTime.now().setZone('UTC-6')
            const diffOutNow = nowDate.diff(checkOutDateTime, 'milliseconds').milliseconds

            if (diffOutNow >= 0) {
              if (calendarDay.length >= 2) {
                if (calendarDay.length > 4) {
                  dateAssistItem.assist.checkOut = calendarDay[calendarDay.length - 2]
                } else {
                  dateAssistItem.assist.checkOut = calendarDay[calendarDay.length - 1]
                }

              } else {
                dateAssistItem.assist.checkOut = null
              }


              if (calendarDay.length <= 2) {
                dateAssistItem.assist.checkEatIn = null
              }

              if (calendarDay.length <= 3) {
                dateAssistItem.assist.checkEatOut = null
              }
            }
          }
        }
      } else {
        /**
         * =================================================================================================================
         * FORMAR EL CALENDARIO PARA EL RESTO DE LOS TURNOS QUE NO ABARCAN DOS DIAS
         * =================================================================================================================
         */
        if (dateAssistItem.assist.assitFlatList) {
          const assists = dateAssistItem.assist.assitFlatList.filter(a => a.assistUsed === false)
          if (assists.length > 0) {
            dateAssistItem.assist.checkIn = assists[0]

            if (assists.length >= 2) {
              dateAssistItem.assist.checkEatIn = assists[1]
            }

            if (assists.length >= 3) {
              dateAssistItem.assist.checkEatOut = assists[2]
            }

            const nowDate = DateTime.now().setZone('UTC-6')
            const diffOutNow = nowDate.diff(checkOutDateTime, 'milliseconds').milliseconds

            if (diffOutNow >= 0) {
              dateAssistItem.assist.checkOut = assists.length >= 2 ? assists[assists.length - 1] : null

              if (assists.length <= 2) {
                dateAssistItem.assist.checkEatIn = null
              }

              if (assists.length <= 3) {
                dateAssistItem.assist.checkEatOut = null
              }
            }
          }
        }
      }

      /**
       * =================================================================================================================
       * VALIDAR SI LOS CHECKS CORRESPONDEN AL DIA UNO DEL TURNO O AL DIA DOS
       * =================================================================================================================
       */
      dateAssistItem = this.setCheckOnNextDayFlags(dateAssistItem, checkInDateTime)
    }

    const existeWorkBreak = dateAssistItem.assist.exceptions.some(
      exception => exception.exceptionType?.exceptionTypeSlug === 'descanso-laborado' &&
      exception.shiftExceptionEnjoymentOfSalary &&
      exception.shiftExceptionEnjoymentOfSalary === 1
    )

    if (isRestWorkday) {
      dateAssistItem.assist.isRestDay = true
      dateAssistItem.assist.checkInStatus = ''
      dateAssistItem.assist.checkOutStatus = ''

      if (dateAssistItem.assist.checkIn) {
          if (!existeWorkBreak) {
            dateAssistItem.assist.checkIn = null
            dateAssistItem.assist.checkEatIn = null
            dateAssistItem.assist.checkEatOut = null
            dateAssistItem.assist.checkOut = null
          }
      }
    }

    dateAssistItem.assist.checkOutStatus = ''

    return dateAssistItem
  }

  /**
   * Calcula y asigna el estado del check-in de un empleado.
   *
   * Evalúa el tiempo de entrada del empleado comparándolo con la hora esperada del turno
   * y aplica las tolerancias configuradas. Los estados posibles son:
   * - 'ontime': Llegó a tiempo o antes
   * - 'tolerance': Llegó dentro de la tolerancia de tardanza
   * - 'delay': Llegó tarde pero dentro de la tolerancia de falta
   * - 'fault': Llegó muy tarde o no llegó (falta)
   * - 'exception': Existe una excepción que anula el estado
   * - '': Vacío (sin evaluación, ej: días festivos, vacaciones)
   *
   * @private
   * @param {AssistDayInterface} checkAssist - Objeto del día a evaluar
   * @param {number} TOLERANCE_FAULT_MINUTES - Minutos de tolerancia para considerar falta
   *                                          (ej: 30 minutos = si llega 30+ minutos tarde, es falta)
   * @param {number} TOLERANCE_DELAY_MINUTES - Minutos de tolerancia para considerar tardanza
   *                                          (ej: 10 minutos = si llega 10+ minutos tarde, es tardanza)
   * @param {boolean} [discriminated] - Si es true, el empleado está discriminado y no se evalúa
   *
   * @returns {AssistDayInterface} El mismo objeto con checkInStatus asignado
   *
   * @description
   * LÓGICA DE EVALUACIÓN:
   * 1. Si NO hay check-in pero hay check-out: Estado vacío (puede ser entrada manual)
   * 2. Si NO hay check-in ni check-out: 'fault' (falta completa)
   * 3. Si hay check-in:
   *    - Calcula diferencia entre hora de entrada y hora esperada del turno
   *    - diffTime <= 0: 'ontime'
   *    - diffTime <= TOLERANCE_DELAY_MINUTES: 'tolerance'
   *    - diffTime <= TOLERANCE_FAULT_MINUTES: 'delay'
   *    - diffTime > TOLERANCE_FAULT_MINUTES: 'fault'
   *
   * EXCEPCIONES QUE ANULAN EL ESTADO:
   * - Días festivos
   * - Vacaciones
   * - Ausencia con goce de sueldo
   * - Cambio de turno
   * - Empleado discriminado
   *
   * @example
   * ```typescript
   * // Empleado llegó 5 minutos tarde (dentro de tolerancia)
   * // checkInStatus = 'tolerance'
   *
   * // Empleado llegó 15 minutos tarde (tardanza)
   * // checkInStatus = 'delay'
   *
   * // Empleado llegó 45 minutos tarde (falta)
   * // checkInStatus = 'fault'
   *
   * // Empleado no llegó y no tiene check-out
   * // checkInStatus = 'fault'
   * ```
   */
  private checkInStatus(checkAssist: AssistDayInterface, TOLERANCE_FAULT_MINUTES: number, TOLERANCE_DELAY_MINUTES: number, discriminated?: Boolean) {
    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    if (!checkAssist?.assist?.checkIn?.assistPunchTimeUtc) {
      checkAssist.assist.checkInStatus = !checkAssist?.assist?.checkOut ? 'fault' : ''

      if (discriminated) {
        checkAssist.assist.checkInStatus = ''
      }

      if (checkAssist.assist.isHoliday) {
        checkAssist.assist.checkInStatus = ''
      }

      if (checkAssist.assist.exceptions.length > 0) {
        const absentException = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'absence-from-work')

        if (absentException) {
          checkAssist.assist.checkInStatus = ''
          return checkAssist
        }

        const changeShiftException = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'change-shift')

        if (changeShiftException) {
          checkAssist.assist.checkInStatus = ''
          return checkAssist
        }
      }

      return checkAssist
    }

    const dayTimeToStart = this.getShiftCheckInTimeToStart(checkAssist.day, checkAssist.assist.dateShift)
    const dayCheckInTime = DateTime.fromISO(checkAssist.assist.checkIn.assistPunchTimeUtc.toString(), { setZone: true }).setZone('UTC-6')
    const diffTime = dayCheckInTime.diff(dayTimeToStart, 'minutes').minutes

    if (diffTime > TOLERANCE_FAULT_MINUTES && !discriminated) {
      if (checkAssist.assist) {
        checkAssist.assist.checkInStatus = 'fault'
      }

      if (checkAssist.assist.exceptions.length > 0) {
        const vacationException = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'vacation')

        if (vacationException) {
          checkAssist.assist.checkInStatus = ''
        }
      }

      return checkAssist
    }
    if (diffTime > TOLERANCE_DELAY_MINUTES) {
      checkAssist.assist.checkInStatus = 'delay'
    }

    if (diffTime <= TOLERANCE_DELAY_MINUTES) {
      checkAssist.assist.checkInStatus = 'tolerance'
    }

    if (diffTime <= 0) {
      checkAssist.assist.checkInStatus = 'ontime'
    }

    if (discriminated) {
      checkAssist.assist.checkInStatus = ''
    }
    return checkAssist
  }

  private checkOutStatus(checkAssist: AssistDayInterface, discriminated?: Boolean) {
    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const hourStart = checkAssist.assist.dateShift.shiftTimeStart
    const dateYear = checkAssist.day.split('-')[0].toString().padStart(2, '0')
    const dateMonth = checkAssist.day.split('-')[1].toString().padStart(2, '0')
    const dateDay = checkAssist.day.split('-')[2].toString().padStart(2, '0')
    const stringDate = `${dateYear}-${dateMonth}-${dateDay}T${hourStart}.000-06:00`
    const timeToAdd = checkAssist.assist.dateShift.shiftActiveHours * 60 - 1
    const timeToEnd = DateTime.fromISO(stringDate, { setZone: true }).setZone('UTC-6').plus({ minutes: timeToAdd })

    const currentNowTime = DateTime.now().setZone('UTC-6')

    if (!checkAssist?.assist?.checkOut?.assistPunchTimeUtc) {
      checkAssist.assist.checkOutStatus = checkAssist.assist.checkInStatus === 'fault' ? 'fault' : ''
      return checkAssist
    }

    const DayTime = DateTime.fromISO(`${checkAssist.assist.checkOut.assistPunchTimeUtc}`, { setZone: true })
    const checkTime = DayTime.setZone('UTC-6')
    const checkTimeDateYear = checkTime.toFormat('yyyy-LL-dd TT').split(' ')[1]
    const checkTimeStringDate = `${checkTime.toFormat('yyyy-LL-dd')}T${checkTimeDateYear}.000-06:00`
    const timeToCheckOut = DateTime.fromISO(checkTimeStringDate, { setZone: true }).setZone('UTC-6')
    const diffTime = timeToEnd.diff(timeToCheckOut, 'minutes').minutes
    const diffTimeNow = currentNowTime.diff(timeToEnd, 'minutes').minutes

    if (diffTime > 0 && diffTimeNow > 0) {
      if (checkAssist.assist.assitFlatList?.length === 3) {
        checkAssist.assist.checkEatOut = null
      }

      if (checkAssist.assist.assitFlatList?.length === 2) {
        checkAssist.assist.checkEatIn = null
      }
    }

    if (diffTime > 10 && (currentNowTime > timeToEnd)) {
      checkAssist.assist.checkOutStatus = 'delay'
    }

    if (diffTime <= 10) {
      checkAssist.assist.checkOutStatus = 'tolerance'
    }

    if (diffTime <= 0) {
      checkAssist.assist.checkOutStatus = 'ontime'
    }

    if (discriminated) {
      checkAssist.assist.checkOutStatus = ''
      return checkAssist
    }

    return checkAssist
  }

  private setNexCalendarDayCheckIns (assitFlatList: AssistInterface[], checkInDateTime: DateTime): AssistInterface[] {
    const calendarDay: AssistInterface[] = []
    assitFlatList.forEach((checkItem) => {
      const punchTime = DateTime.fromISO(`${checkItem.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')

      const diffToCheckStart = punchTime.diff(checkInDateTime.minus({ hours: 3 }), 'milliseconds').milliseconds

      if (diffToCheckStart > 0) {
        checkItem.assistPunchTime = punchTime.setZone('UTC')
        checkItem.assistPunchTimeUtc = punchTime.setZone('UTC')
        checkItem.assistPunchTimeOrigin = punchTime.setZone('UTC')
        calendarDay.push(checkItem)
      }
    })

    return calendarDay
  }

  private setNexCalendarDayCheckOuts (evaluatedDay: DateTime, assistList: AssistDayInterface[], checkOutDateTime: DateTime): AssistInterface[] {
    const calendarDay: AssistInterface[] = []
    const nextEvaluatedDay = evaluatedDay.plus({ days: 1 }).toFormat('yyyy-LL-dd')
    const nextDay = assistList.find((assistDate) => assistDate.day === nextEvaluatedDay)

    if (nextDay && nextDay?.assist?.assitFlatList) {
      const evaluatedSummerNextDay = new Date(nextDay?.day)
      const nexDayCheckList: AssistInterface[] = JSON.parse(JSON.stringify(nextDay.assist.assitFlatList))
      const fixedNexDayCheckList = this.fixedCSTSummerTime(evaluatedSummerNextDay, nexDayCheckList)
      fixedNexDayCheckList.forEach((checkItem) => {
        const punchTime = DateTime.fromISO(`${checkItem.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')
        const diffToCheckOut = punchTime.diff(checkOutDateTime.plus({ hours: 3 }), 'milliseconds').milliseconds

        if (diffToCheckOut <= 0) {
          checkItem.assistPunchTime = punchTime.setZone('UTC')
          checkItem.assistPunchTimeUtc = punchTime.setZone('UTC')
          checkItem.assistPunchTimeOrigin = punchTime.setZone('UTC')
          calendarDay.push(checkItem)
        }
      })
    }

    return calendarDay
  }

  private setCheckOnNextDayFlags (dateAssistItem: AssistDayInterface, checkInDateTime: DateTime): AssistDayInterface {
    if (dateAssistItem.assist.checkOut) {
      const punchTimeOut = DateTime.fromISO(`${dateAssistItem.assist.checkOut.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')
      if (punchTimeOut.toFormat('yyyy-LL-dd') > checkInDateTime.toFormat('yyyy-LL-dd')) {
        dateAssistItem.assist.isCheckOutNextDay = true
      }
    }

    if (dateAssistItem.assist.checkEatIn) {
      const punchTimeOut = DateTime.fromISO(`${dateAssistItem.assist.checkEatIn.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')
      if (punchTimeOut.toFormat('yyyy-LL-dd') > checkInDateTime.toFormat('yyyy-LL-dd')) {
        dateAssistItem.assist.isCheckInEatNextDay = true
      }
    }

    if (dateAssistItem.assist.checkEatOut) {
      const punchTimeOut = DateTime.fromISO(`${dateAssistItem.assist.checkEatOut.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')
      if (punchTimeOut.toFormat('yyyy-LL-dd') > checkInDateTime.toFormat('yyyy-LL-dd')) {
        dateAssistItem.assist.isCheckOutEatNextDay = true
      }
    }

    return dateAssistItem
  }

  private getShiftCheckInTimeToStart (day: string, dateShift: ShiftInterface) {
    const hourStart = dateShift.shiftTimeStart
    const stringDate = `${day}T${hourStart}.000-06:00`
    const timeToStart = DateTime.fromISO(stringDate, { setZone: true }).setZone('UTC-6').plus({ minutes: 1 })
    return timeToStart
  }

  /**
   * Obtiene las tolerancias de Delay y Fault del sistema.
   *
   * OPTIMIZACIÓN: Implementa caché para evitar consultas repetidas a la base de datos.
   * Las tolerancias se cargan una sola vez y se reutilizan durante la vida de la instancia.
   *
   * Las tolerancias se usan para:
   * - TOLERANCE_DELAY_MINUTES: Determinar si un retraso es considerado "tardanza"
   *   Ejemplo: Si es 10 minutos, llegar 5 minutos tarde = "tolerance", llegar 15 minutos tarde = "delay"
   * - TOLERANCE_FAULT_MINUTES: Determinar si un retraso es considerado "falta"
   *   Ejemplo: Si es 30 minutos, llegar 15 minutos tarde = "delay", llegar 45 minutos tarde = "fault"
   *
   * @private
   * @returns {Promise<{ delayTolerance: Tolerance | undefined, faultTolerance: Tolerance | undefined }>}
   *          Objeto con las tolerancias de Delay y Fault
   *
   * @throws {Error} Si no se encuentran las tolerancias de Delay o Fault
   *
   * @description
   * PROCESO:
   * 1. Verifica si hay caché disponible (early return)
   * 2. Obtiene el system setting activo
   * 3. Consulta las tolerancias para ese system setting
   * 4. Busca las tolerancias "Delay" y "Fault"
   * 5. Almacena en caché para próximas consultas
   *
   * @example
   * ```typescript
   * const { delayTolerance, faultTolerance } = await this.getTolerances()
   * // delayTolerance.toleranceMinutes = 10
   * // faultTolerance.toleranceMinutes = 30
   * ```
   */
  private async getTolerances() {
    try {
      // OPTIMIZACIÓN: Usar caché si ya se cargó para evitar consultas repetidas
      if (this.tolerancesCache) {
        return this.tolerancesCache
      }

      const systemSettingService = new SystemSettingService()
      const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
      let data = [] as Tolerance[]

      if (systemSettingActive) {
         data = await new ToleranceService().index(systemSettingActive.systemSettingId)
      }

      const delayTolerance = data.find((t) => t.toleranceName === 'Delay')
      const faultTolerance = data.find((t) => t.toleranceName === 'Fault')

      if (!delayTolerance || !faultTolerance) {
        throw new Error('No se encontraron tolerancias para Delay o Fault')
      }

      // Guardar en caché
      this.tolerancesCache = { delayTolerance, faultTolerance }
      return this.tolerancesCache
    } catch (error) {
      console.error('Error al obtener las tolerancias:', error)
      throw error
    }
  }

  private isFutureDay(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.dateShift) {
      return false
    }

    const now = DateTime.now().setZone('UTC-6')
    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return false
    }

    const hourStart = assignedShift.shiftTimeStart
    const stringDate = `${checkAssist.day}T${hourStart}.000-06:00`
    const timeToStart = DateTime.fromISO(stringDate, { setZone: true }).setZone('UTC-6')
    const diff = now.diff(timeToStart, 'seconds').seconds

    checkAssist.assist.isFutureDay = diff < 0

    return diff < 0
  }

  private isSundayBonus(checkAssist: AssistDayInterface) {
    const currentDate = DateTime.fromISO(`${checkAssist.day}T00:00:00.000-06:00`, { setZone: true }).setZone('UTC-6')
    const naturalDay = currentDate.toFormat('c')
    checkAssist.assist.isSundayBonus = Number.parseInt(`${naturalDay}`) === 7 && ( !!checkAssist?.assist?.checkIn || !!checkAssist?.assist?.checkOut )

    if (!checkAssist.assist.isSundayBonus && checkAssist?.assist?.assitFlatList) {
      checkAssist.assist.assitFlatList.forEach(assistFlat => {
        const checkOutDate = DateTime.fromISO(`${assistFlat.assistPunchTimeUtc}`, { setZone: true }).setZone('UTC-6')
        const checkOutNaturalDay = checkOutDate.toFormat('c')
        checkAssist.assist.isSundayBonus = Number.parseInt(`${checkOutNaturalDay}`) === 7
      })
    }

    return checkAssist
  }

  private isRestDay(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.dateShift) {
      return false
    }

    const currentDate = DateTime.fromISO(`${checkAssist.day}T${checkAssist.assist.dateShift.shiftTimeStart}.000-06:00`, { setZone: true }).setZone('UTC-6')
    const naturalDay = currentDate.toFormat('c')
    const restDay = checkAssist.assist.dateShift.shiftRestDays
      .split(',')
      .find((assistRestDay) => Number.parseInt(`${assistRestDay}`) === Number.parseInt(`${naturalDay}`))

    return !!restDay
  }

  private hasSomeException(employeeID: number | undefined, checkAssist: AssistDayInterface, employee: Employee | null) {
    if (!employeeID) {
      return checkAssist
    }

    if (!employee) {
      return checkAssist
    }

    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return checkAssist
    }

    if (checkAssist.assist.exceptions.length > 0) {
      const restException = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'rest-day')
      const exWrongSystem = !!checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'error-de-horario-en-sistema')
      const exNewWorker = !!checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'nuevo-ingreso')
      const exIncapacity = !!checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'falta-por-incapacidad')
      const exMaternity = !!checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'incapacidad-por-maternidad')
      const exAbsentWork = !!checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'absence-from-work')

      if (exWrongSystem || exNewWorker || exIncapacity || exMaternity || exAbsentWork) {
        checkAssist.assist.checkInStatus = 'exception'
        checkAssist.assist.checkOutStatus = 'exception'
      }

      const exAbsentWorkWithOutSalary = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary === 0 && ex.exceptionType?.exceptionTypeSlug === 'absence-from-work')

      if (exAbsentWorkWithOutSalary) {
        checkAssist.assist.checkInStatus = 'fault'
        checkAssist.assist.checkIn = null
        checkAssist.assist.checkEatIn = null
        checkAssist.assist.checkOut = null
        checkAssist.assist.checkEatOut = null
      }

      if (restException) {
        checkAssist.assist.isRestDay = true
      }
    }

    return checkAssist
  }

  private isVacationDate(employeeID: number | undefined, checkAssist: AssistDayInterface, employee: Employee | null) {
    if (!employeeID) {
      return checkAssist
    }

    if (!employee) {
      return checkAssist
    }

    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return checkAssist
    }

    if (checkAssist.assist.exceptions.length > 0) {
      const absentException = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'vacation')

      if (absentException) {
        checkAssist.assist.isVacationDate = true

        if (!checkAssist.assist.checkIn) {
          checkAssist.assist.checkInStatus = ''
          checkAssist.assist.checkOutStatus = ''
        }
      }
    }

    return checkAssist
  }

  private isWorkDisabilityDate(employeeID: number | undefined, checkAssist: AssistDayInterface, employee: Employee | null) {
    if (!employeeID) {
      return checkAssist
    }

    if (!employee) {
      return checkAssist
    }

    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }

    const assignedShift = checkAssist.assist.dateShift

    if (!assignedShift) {
      return checkAssist
    }

    if (checkAssist.assist.exceptions.length > 0) {
      const absentException = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionEnjoymentOfSalary !== 0 && ex.exceptionType?.exceptionTypeSlug === 'falta-por-incapacidad')

      if (absentException) {
        checkAssist.assist.isWorkDisabilityDate = true

        if (!checkAssist.assist.checkIn) {
          checkAssist.assist.checkInStatus = ''
          checkAssist.assist.checkOutStatus = ''
        }
      }
    }

    return checkAssist
  }

  private getCheckInDate(dayAssist: AssistInterface[]) {
    const assists = dayAssist.filter(a => a.assistUsed === false)
    const assist = assists.length > 0 ? assists[0] : null
    return assist
  }

  private getCheckEatInDate(dayAssist: AssistInterface[]) {
    let assist = null
    const assists = dayAssist.filter(a => a.assistUsed === false)
    if (assists.length > 2) {
      assist = assists[1]
    }

    return assist
  }

  private getCheckEatOutDate(dayAssist: AssistInterface[]) {
    let assist = null
    const assists = dayAssist.filter(a => a.assistUsed === false)
    if (assists.length > 3) {
      assist = assists[2]
    }

    return assist
  }

  private getCheckOutDate(dayAssist: AssistInterface[]) {
    let assist = null
    const assists = dayAssist.filter(a => a.assistUsed === false)
    if (assists.length > 1) {
      assist = assists[assists.length - 1]
    }

    return assist
  }

  private getMexicoDSTChangeDates (year: number) {
    const startDST = new Date(year, 3, 1)
    startDST.setDate(1 + (7 - startDST.getDay()) % 7) // Asegura que es el primer domingo

    // Último domingo de octubre (fin del horario de verano)
    const endDST = new Date(year, 9, 31)
    endDST.setDate(endDST.getDate() - endDST.getDay()) // Asegura que es el último domingo

    return { startDST, endDST }
  }

  private checkDSTSummerTime (date: Date): boolean {
    const year = date.getFullYear()
    const { startDST, endDST } = this.getMexicoDSTChangeDates(year)

    if (date >= startDST && date < endDST) {
      // En horario de verano
      return true
    } else {
      // En horario estándar
      return false
    }
  }

  private fixedCSTSummerTime (evaluatedDay: Date, assitFlatList: AssistInterface[]) {
    const isSummerTime = this.checkDSTSummerTime(evaluatedDay)
    const fixedList = assitFlatList.map((checkItem: any) => {
      if (isSummerTime) {
        checkItem.assistPunchTimeUtc = DateTime.fromISO(checkItem.assistPunchTimeUtc.toString()).setZone('UTC').plus({ hour: 1 })
        checkItem.assistPunchTime = DateTime.fromISO(checkItem.assistPunchTime.toString()).setZone('UTC').plus({ hour: 1 })
        checkItem.assistPunchTimeOrigin = DateTime.fromISO(checkItem.assistPunchTimeUtc.toString()).setZone('UTC').plus({ hour: 1 })
      }
      return checkItem
    })

    return fixedList
  }

  private calendarDayStatus (dateAssistItem: AssistDayInterface, evaluatedDay: DateTime, startDay: DateTime, flag: string) {
    let daysBettweenStart = 0
    let isStartWorkday = true
    let isEndWorkday = false
    let isRestWorkday = false
    let isNextDay = this.isFutureDay(dateAssistItem)

    if (flag === 'doble-12x48') {
      daysBettweenStart = evaluatedDay.diff(startDay, 'days').days
      isStartWorkday = !!(daysBettweenStart % 4 === 0 || daysBettweenStart % 4 === 1)
      isEndWorkday = !!(daysBettweenStart % 4 === 1)
      isRestWorkday = !!(daysBettweenStart % 4 === 3 || daysBettweenStart % 4 === 2)
    } else if (flag === '24x48') {
      daysBettweenStart = evaluatedDay.diff(startDay, 'days').days
      isStartWorkday = !!(daysBettweenStart % 3 === 0)
      isRestWorkday = !!(daysBettweenStart % 3 === 2) || !!(daysBettweenStart % 3 === 1)
    } else if (flag === '12x36') {
      daysBettweenStart = evaluatedDay.diff(startDay, 'days').days
      isStartWorkday = !!(daysBettweenStart % 2 === 0)
      isRestWorkday = !!(daysBettweenStart % 2 === 1)
    } else if (flag === '24x24') {
      daysBettweenStart = Math.floor(evaluatedDay.diff(startDay, 'days').days)
      isStartWorkday = !!(daysBettweenStart % 2 === 0)
      isRestWorkday = !!(daysBettweenStart % 2 === 1)
    } else {
      isRestWorkday = this.isRestDay(dateAssistItem)
    }

    return {
      isStartWorkday,
      isEndWorkday,
      isRestWorkday,
      isNextDay
    }
  }

  private hasSomeExceptionTimeCheckIn(checkAssist: AssistDayInterface, TOLERANCE_DELAY_MINUTES: number) {
    if (!checkAssist) {
      return checkAssist
    }

    if (checkAssist.assist.dateShift) {
      if (checkAssist.assist.exceptions.length > 0) {
        const exception = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionCheckInTime)

        if (exception) {
          const dateYear = checkAssist.day.split('-')[0].toString().padStart(2, '0')
          const dateMonth = checkAssist.day.split('-')[1].toString().padStart(2, '0')
          const dateDay = checkAssist.day.split('-')[2].toString().padStart(2, '0')
          const DayTime = DateTime.fromISO(`${checkAssist.assist.checkIn?.assistPunchTimeUtc}`, { setZone: true })
          const checkTime = DayTime.setZone('UTC-6')
          const checkTimeTime = checkTime.toFormat('yyyy-LL-dd TT').split(' ')[1]
          const stringInDateString = `${dateYear}-${dateMonth}-${dateDay}T${checkTimeTime.padStart(8, '0')}.000-06:00`
          const timeCheckIn = DateTime.fromISO(stringInDateString, { setZone: true }).setZone('UTC-6')

          if (exception.shiftExceptionCheckInTime) {
            const shiftExceptionCheckInTime = DateTime.fromFormat(exception.shiftExceptionCheckInTime, 'HH:mm:ss')
            const diffTime = timeCheckIn.diff(timeCheckIn.set({ hour: shiftExceptionCheckInTime.hour, minute: shiftExceptionCheckInTime.minute }), 'minutes').as('minutes')

            if (diffTime > TOLERANCE_DELAY_MINUTES) {
              checkAssist.assist.checkInStatus = 'delay'
            }

            if (diffTime <= TOLERANCE_DELAY_MINUTES) {
              checkAssist.assist.checkInStatus = 'tolerance'
            }

            if (diffTime <= 0) {
              checkAssist.assist.checkInStatus = 'ontime'
            }
          }
        }
      }
    }

    return checkAssist
  }

  private validTime(checkAssist: AssistDayInterface) {
    if (!checkAssist) {
      return checkAssist
    }

    if (checkAssist.assist.checkIn?.assistId === checkAssist.assist.checkOut?.assistId ) {
      checkAssist.assist.checkOut = null
    }

    return checkAssist
  }

  private async hasSomeExceptionTimeCheckOut(checkAssist: AssistDayInterface) {
    if (!checkAssist) {
      return checkAssist
    }

    if (checkAssist.assist.dateShift) {
      if (checkAssist.assist.exceptions.length > 0) {
        const exception = checkAssist.assist.exceptions.find((ex) => ex.shiftExceptionCheckOutTime)

        if (exception) {
          if (!checkAssist?.assist?.checkOut?.assistPunchTimeUtc) {
            checkAssist.assist.checkOutStatus = checkAssist.assist.checkInStatus === 'fault' ? 'fault' : ''
            return checkAssist
          }

          const DayTime = DateTime.fromISO(`${checkAssist.assist.checkOut.assistPunchTimeUtc}`, { setZone: true })
          const checkTime = DayTime.setZone('UTC-6')
          const checkTimeDateYear = checkTime.toFormat('yyyy-LL-dd TT').split(' ')[1]
          const checkTimeStringDate = `${checkTime.toFormat('yyyy-LL-dd')}T${checkTimeDateYear}.000-06:00`
          const timeToCheckOut = DateTime.fromISO(checkTimeStringDate, { setZone: true }).setZone('UTC-6')

          if (exception.shiftExceptionCheckOutTime) {
            const shiftExceptionCheckOutTime = DateTime.fromFormat(exception.shiftExceptionCheckOutTime, 'HH:mm:ss')
            const diffTime = timeToCheckOut.diff(timeToCheckOut.set({ hour: shiftExceptionCheckOutTime.hour, minute: shiftExceptionCheckOutTime.minute }), 'minutes').as('minutes')

            if (diffTime > 0) {
              checkAssist.assist.checkOutStatus = 'ontime'
            } else if (diffTime >= -10) {
              checkAssist.assist.checkOutStatus = 'tolerance'
            } else if (diffTime < -10) {
              checkAssist.assist.checkOutStatus = 'delay'
            }
          }
        }
      }
    }

    return checkAssist
  }

  verifyCheckOutToday(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.dateShift) {
      return checkAssist
    }
    if (checkAssist.assist.checkInStatus === 'fault') {
      return checkAssist
    }
    const hourStart = checkAssist.assist.dateShift.shiftTimeStart
    const shiftActiveHours = checkAssist.assist.dateShift.shiftActiveHours
    const day = checkAssist.day

    const stringDate = `${day}T${hourStart}`
    const start = DateTime.fromISO(stringDate, { zone: 'UTC-6' })
    const end = start.plus({ hours: shiftActiveHours })

    const now = DateTime.now().setZone('UTC-6')

    if (end < now) {
      if (checkAssist.assist.checkIn && !checkAssist.assist.checkOut) {
        checkAssist.assist.checkInStatus = 'fault'
      }
    }

    return checkAssist
  }

  async syncronizeAssistAllEmployeesCalendar(dateStart: string, dateEnd: string) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
    const departmentService = new DepartmentService(this.i18n as I18n)
    const employeeService = new EmployeeService(this.i18n as I18n)
    const departments = await Department.query()
      .whereIn('businessUnitId', businessUnitsList)
      .where('departmentId', '<>', 999)
      .orderBy('departmentName', 'asc')
    for await (const department of departments) {
      const departmentId = department.departmentId
      const page = 1
      const limit = 999999999999999
      const resultPositions = await departmentService.getPositions(departmentId, null)
      for await (const position of resultPositions) {
        const resultEmployes = await employeeService.index(
          {
            search: '',
            departmentId: departmentId,
            positionId: position.positionId,
            employeeWorkSchedule: '',
            page: page,
            limit: limit,
            ignoreDiscriminated: 0,
            ignoreExternal: 1,
            onlyPayroll: false,
            userResponsibleId: 0,
          },
          [departmentId]
        )
        const dataEmployes: any = resultEmployes
        for await (const employee of dataEmployes) {
          const filter: SyncAssistsServiceIndexInterface = {
            date: dateStart,
            dateEnd: dateEnd,
            employeeID: employee.employeeId
          }
          await this.setDateCalendar(filter)
        }
      }
    }
  }
}
