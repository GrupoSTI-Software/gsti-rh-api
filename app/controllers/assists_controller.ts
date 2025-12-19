import SyncAssistsService from '#services/sync_assists_service'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import Employee from '#models/employee'
import AssistsService from '#services/assist_service'
import { AssistEmployeeExcelFilterInterface } from '../interfaces/assist_employee_excel_filter_interface.js'
import Position from '#models/position'
import Department from '#models/department'
import { AssistPositionExcelFilterInterface } from '../interfaces/assist_position_excel_filter_interface.js'
import { AssistDepartmentExcelFilterInterface } from '../interfaces/assist_department_excel_filter_interface.js'
import UserService from '#services/user_service'
import Assist from '#models/assist'
import { DateTime } from 'luxon'
import { AssistSyncFilterInterface } from '../interfaces/assist_sync_filter_interface.js'
import { AssistFlatFilterInterface } from '../interfaces/assist_flat_filter_interface.js'
import { PermissionsDatesExcelFilterInterface } from '../interfaces/permissions_dates_excel_filter_interface.js'

export default class AssistsController {

  /**
   * @swagger
   * /api/v1/assists/synchronize:
   *   post:
   *     summary: Synchronize assists
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               date:
   *                 type: string
   *                 format: date
   *                 example: "2023-01-01"
   *               page:
   *                 type: number
   *                 example: "1"
   *     responses:
   *       200:
   *         description: Synchronization started
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: Proceso de sincronización iniciado
   *       400:
   *         description: Synchronization in progress or other error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: Ya se encuentra un proceso en sincronización, por favor espere
   */
  @inject()
  async synchronize({ request, response,i18n }: HttpContext) {
    const dateParamApi = request.input('date')
    const page = request.input('page')

    try {
      const syncAssistsService = new SyncAssistsService(i18n)
      const result = await syncAssistsService.synchronize(dateParamApi, page)
      return response.status(200).json(result)
    } catch (error) {
      return response.status(400).json({ message: error.message })
    }
  }

  /**
   * @swagger
   * /api/v1/assists/employee-synchronize:
   *   post:
   *     summary: Synchronize assists
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               startDate:
   *                 type: string
   *                 required: true
   *                 format: date
   *                 example: "2024-10-07"
   *               endDate:
   *                 type: string
   *                 required: true
   *                 format: date
   *                 example: "2024-10-13"
   *               empCode:
   *                 type: string
   *                 example: "1"
   *     responses:
   *       200:
   *         description: Synchronization started
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: Proceso de sincronización iniciado
   *       400:
   *         description: Synchronization in progress or other error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: Ya se encuentra un proceso en sincronización, por favor espere
   */
  @inject()
  async employeeSynchronize(
    { auth, request, response, i18n }: HttpContext
  ) {
    const startDate = request.input('startDate')
    const endDate = request.input('endDate')
    const empCode = request.input('empCode')
    const userId = auth.user?.userId
    const rawHeaders = request.request.rawHeaders
    try {
      const filters = {
        startDate: startDate,
        endDate: endDate,
        empCode: empCode,
        page: 1,
        limit: 5000,
        userId: userId ? userId : 0,
        rawHeaders: rawHeaders,
      } as AssistSyncFilterInterface
      const  syncAssistsService = new SyncAssistsService(i18n)
      const result = await syncAssistsService.synchronizeByEmployee(filters)
      return response.status(200).json(result)
    } catch (error) {
      return response.status(400).json({ message: error.message })
    }
  }
  /**
   * @swagger
   * /api/v1/assists/status:
   *   get:
   *     summary: Retrieve the status of the sync assists operation
   *     tags: [Assists]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AssistStatusResponseDto'
   *       400:
   *         description: Error retrieving status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Error al obtener el estado de sincronización"
   */
  @inject()
  async getStatusSync({ response, i18n }: HttpContext) {
    const  syncAssistsService = new SyncAssistsService(i18n)
    return response.status(200).json(await syncAssistsService.getStatusSync())
  }

  /**
   * @swagger
   * /api/v1/assists:
   *   get:
   *     summary: get assists list
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2023-01-01"
   *         description: Date from get list
   *       - name: date-end
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: employeeId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Number of limit on paginator page
   *     responses:
   *       200:
   *         description: Resource action successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               example: {}
   *       400:
   *         description: Invalid data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const syncAssistsService = new SyncAssistsService(i18n)
    const employeeID = request.input('employeeId')
    const filterDate = request.input('date')
    const filterDateEnd = request.input('date-end')
    const page = request.input('page')
    const limit = request.input('limit')
    /*     if (employeeID) {
      const employee = await Employee.query()
        .where('employee_id', employeeID)
        .first()
      if (employee) {

          const filter: SyncAssistsServiceIndexInterface = {
            date: filterDate,
            dateEnd: filterDateEnd,
            employeeID: employee.employeeId
          }
          console.log('procesando: ' + employee.employeeId)
          const syncAssistsService = new SyncAssistsService()
          await syncAssistsService.setDateCalendar(filter)

      }
    } */
    try {
      const result = await syncAssistsService.index(
        {
          date: filterDate,
          dateEnd: filterDateEnd,
          employeeID: employeeID,
        },
        { page, limit }
      )
      return response.status(result.status).json(result)
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/v1/assists/get-excel-by-employee:
   *   get:
   *     summary: get assists excel by employee
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2023-01-01"
   *         description: Date from get list
   *       - name: date-end
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: datePay
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2025-04-01"
   *         description: Date pay to get disability work and vacation bonus
   *       - name: employeeId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Employee id
   *       - name: reportType
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         description: Report type
   *     responses:
   *       200:
   *         description: Resource action successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               example: {}
   *       400:
   *         description: Invalid data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  async getExcelByEmployee({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = request.input('employeeId')
      const filterDate = request.input('date')
      const filterDateEnd = request.input('date-end')
      const filterDatePay = request.input('datePay')
      const reportType = request.input('reportType')
      const employee = await Employee.query()
        .withTrashed()
        .where('employee_id', employeeId)
        .preload('position')
        .preload('department')
        .preload('person')
        .first()
      if (!employee) {
        response.status(400)
        const entity = t('employee')
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { employeeId },
        }
      }
      const validReportTypes = ['Assistance Report', 'Incident Summary', 'Incident Summary Payroll']

      if (!validReportTypes.includes(reportType)) {
        const entity = t('report_type')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_is_not_valid', { entity }),
          data: { reportType },
        }
      }
      const filters = {
        employeeId: employeeId,
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
        filterDatePay: filterDatePay,
      } as AssistEmployeeExcelFilterInterface
      const assistService = new AssistsService(i18n)
      let buffer
      if (reportType === 'Assistance Report') {
        buffer = await assistService.getExcelByEmployeeAssistance(employee, filters)
      } else if (reportType === 'Incident Summary') {
        buffer = await assistService.getExcelByEmployeeIncidentSummary(employee, filters)
      } else if (reportType === 'Incident Summary Payroll') {
        buffer = await assistService.getExcelByEmployeeIncidentSummaryPayroll(employee, filters)
      }
      if (buffer) {
        if (buffer.status === 201) {
          response.header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          )
          response.header('Content-Disposition', 'attachment; filename=datos.xlsx')
          response.status(201)
          response.send(buffer.buffer)
        } else {
          response.status(500)
          return {
            type: buffer.type,
            title: buffer.title,
            message: buffer.message,
            error: buffer.error,
          }
        }
      } else {
        response.status(400)
        return {
          type: 'warning',
          title: t('server_error'),
          message: t('an_unexpected_error_has_occurred_on_the_server_buffer_not_found'),
          data: { employeeId },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/v1/assists/get-excel-by-position:
   *   get:
   *     summary: get assists excel by position
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2023-01-01"
   *         description: Date from get list
   *       - name: date-end
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: departmentId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Department id
   *       - name: positionId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Position id
   *     responses:
   *       200:
   *         description: Resource action successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               example: {}
   *       400:
   *         description: Invalid data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  async getExcelByPosition({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const filterDate = request.input('date')
      const filterDateEnd = request.input('date-end')
      const department = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_id', departmentId)
        .first()
      if (!department) {
        const entity = t('department')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { departmentId },
        }
      }
      const position = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', positionId)
        .first()
      if (!position) {
        const entity = t('position')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { positionId },
        }
      }
      const filters = {
        positionId: positionId,
        departmentId: departmentId,
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
      } as AssistPositionExcelFilterInterface
      const assistService = new AssistsService(i18n)
      const buffer = await assistService.getExcelByPosition(filters)
      if (buffer.status === 201) {
        response.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response.header('Content-Disposition', 'attachment; filename=datos.xlsx')
        response.status(201)
        response.send(buffer.buffer)
      } else {
        response.status(500)
        return {
          type: buffer.type,
          title: buffer.title,
          message: buffer.message,
          error: buffer.error,
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/v1/assists/get-excel-by-department:
   *   get:
   *     summary: get assists excel by department
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2023-01-01"
   *         description: Date from get list
   *       - name: date-end
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: datePay
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2025-04-01"
   *         description: Date pay to get disability work and vacation bonus
   *       - name: departmentId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Department id
   *       - name: positionId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Position id
   *       - name: reportType
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         description: Report type
   *     responses:
   *       200:
   *         description: Resource action successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               example: {}
   *       400:
   *         description: Invalid data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  async getExcelByDepartment({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const departmentId = request.input('departmentId')
      const filterDate = request.input('date')
      const filterDateEnd = request.input('date-end')
      const filterDatePay = request.input('datePay')
      const reportType = request.input('reportType')
      const department = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_id', departmentId)
        .first()
      if (!department) {
        const entity = t('department')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { departmentId },
        }
      }
      const validReportTypes = ['Assistance Report', 'Incident Summary', 'Incident Summary Payroll']

      if (!validReportTypes.includes(reportType)) {
        const entity = t('report_type')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_is_not_valid', { entity }),
          data: { reportType },
        }
      }
      const filters = {
        departmentId: departmentId,
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
        filterDatePay: filterDatePay,
        userResponsibleId: userResponsibleId,
      } as AssistDepartmentExcelFilterInterface
      const assistService = new AssistsService(i18n)
      let buffer
      if (reportType === 'Assistance Report') {
        buffer = await assistService.getExcelByDepartmentAssistance(filters)
      } else if (reportType === 'Incident Summary') {
        buffer = await assistService.getExcelByDepartmentIncidentSummary(filters)
      } else if (reportType === 'Incident Summary Payroll') {
        buffer = await assistService.getExcelByDepartmentIncidentSummaryPayRoll(filters)
      }
      if (buffer) {
        if (buffer.status === 201) {
          response.header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          )
          response.header('Content-Disposition', 'attachment; filename=datos.xlsx')
          response.status(201)
          response.send(buffer.buffer)
        } else {
          response.status(500)
          return {
            type: buffer.type,
            title: buffer.title,
            message: buffer.message,
            error: buffer.error,
          }
        }
      } else {
        response.status(400)
        return {
          type: 'warning',
          title: t('server_error'),
          message: t('an_unexpected_error_has_occurred_on_the_server_buffer_not_found'),
          data: { filters },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/v1/assists/get-excel-all:
   *   get:
   *     summary: get assists excel by position
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2023-01-01"
   *         description: Date from get list
   *       - name: date-end
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: datePay
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2025-04-01"
   *         description: Date pay to get disability work and vacation bonus
   *       - name: departmentId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Department id
   *       - name: positionId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Position id
   *       - name: reportType
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         description: Report type
   *     responses:
   *       200:
   *         description: Resource action successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               example: {}
   *       400:
   *         description: Invalid data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  async getExcelAll({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>
      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId)
      }
      const filterDate = request.input('date')
      const filterDateEnd = request.input('date-end')
      const filterDatePay = request.input('datePay')
      const reportType = request.input('reportType')
      const validReportTypes = ['Assistance Report', 'Incident Summary', 'Incident Summary Payroll']

      if (!validReportTypes.includes(reportType)) {
        const entity = t('report_type')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_is_not_valid', { entity }),
          data: { reportType },
        }
      }
      const filters = {
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
        filterDatePay: filterDatePay,
        userResponsibleId: userResponsibleId,
      } as AssistDepartmentExcelFilterInterface
      const assistService = new AssistsService(i18n)
      let buffer
      if (reportType === 'Assistance Report') {
        buffer = await assistService.getExcelAllAssistance(filters, departmentsList)
      } else if (reportType === 'Incident Summary') {
        buffer = await assistService.getExcelAllIncidentSummary(filters, departmentsList)
      } else if (reportType === 'Incident Summary Payroll') {
        buffer = await assistService.getExcelAllIncidentSummaryPayRoll(filters, departmentsList)
      }
      if (buffer) {
        if (buffer.status === 201) {
          response.header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          )
          response.header('Content-Disposition', 'attachment; filename=datos.xlsx')
          response.status(201)
          response.send(buffer.buffer)
        } else {
          response.status(500)
          return {
            type: buffer.type,
            title: buffer.title,
            message: buffer.message,
            error: buffer.error,
          }
        }
      } else {
        response.status(400)
        return {
          type: 'warning',
          title: t('server_error'),
          message: t('an_unexpected_error_has_occurred_on_the_server_buffer_not_found'),
          data: { filters },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/v1/assists:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assists
   *     summary: create new assist
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               assistPunchTime:
   *                 type: string
   *                 format: date
   *                 description: Assist punch time (YYYY-MM-DD HH:mm:ss)
   *                 required: false
   *                 default: ''
   *               assistLongitude:
   *                 type: string
   *                 description: Assist longitude
   *                 required: false
   *                 default: ''
   *               assistLatitude:
   *                 type: string
   *                 description: Assist latitude
   *                 required: false
   *                 default: ''
   *               assistPrecision:
   *                 type: string
   *                 description: Assist precision
   *                 required: false
   *                 default: ''
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
  async store({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = request.input('employeeId')
      let assistPunchTime = request.input('assistPunchTime')
      const assistLongitude = request.input('assistLongitude')
      const assistLatitude = request.input('assistLatitude')
      const assistPrecision = request.input('assistPrecision')
      const employee = await Employee.query()
        .withTrashed()
        .where('employee_id', employeeId)
        .preload('position')
        .preload('department')
        .first()

      if (!employee) {
        const entity = t('employee')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { employeeId, assistPunchTime },
        }
      }

      if (!assistPunchTime) {
        assistPunchTime = DateTime.now().setZone('UTC-6').toFormat('yyyy-MM-dd HH:mm:ss')
      }


      let dateTimePunchTime: DateTime = DateTime.fromFormat(assistPunchTime, 'yyyy-MM-dd HH:mm:ss', {zone: 'UTC-6' }).toUTC()

      if (dateTimePunchTime) {
        const isSummerDate = this.checkDSTSummerTime(dateTimePunchTime.toJSDate())

        if (isSummerDate) {
          dateTimePunchTime = dateTimePunchTime.plus({ hour: -1 })
        }
      }

      const assist = {
        assistId: 1,
        assistEmpCode: employee.employeeCode ? employee.employeeCode : '',
        assistTerminalSn: '',
        assistTerminalAlias: '',
        assistAreaAlias: '',
        assistLongitude: assistLongitude,
        assistLatitude: assistLatitude,
        assistPrecision: assistPrecision,
        assistUploadTime: dateTimePunchTime,
        assistEmpId: employeeId,
        assistTerminalId: null,
        assistSyncId: 0,
        assistPunchTime: dateTimePunchTime,
        assistPunchTimeUtc: dateTimePunchTime,
        assistPunchTimeOrigin: dateTimePunchTime,
        deletedAt: null,
      } as Assist

      const assistsService = new AssistsService(i18n)
      const verifyInfo = await assistsService.verifyInfo(assist)

      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...assist },
        }
      }

      const newAssist = await assistsService.store(assist)

      if (newAssist) {
        const rawHeaders = request.request.rawHeaders
        const userId = auth.user?.userId
        if (userId) {
          const logAssist = await assistsService.createActionLog(rawHeaders, 'store')
          logAssist.user_id = userId
          logAssist.create_from = 'manual'
          logAssist.record_current = JSON.parse(JSON.stringify(newAssist))
          await assistsService.saveActionOnLog(logAssist)
        }
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_created_successfully'),
          data: { assist: newAssist },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/v1/assists/get-format-payroll:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assists
   *     summary: get format payroll
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-29"
   *         description: Date from get format
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
  async getFormatPayRoll({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const date = request.input('date')
      if (!date) {
        const entity = t('date')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found', { entity }),
          data: { date },
        }
      }
      const assistService = new AssistsService(i18n)
      const result = assistService.isPayThursday(date, '2025-01-09')
      if (!result) {
        const entity = t('date')
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_is_not_valid', { entity }),
          message: t('the_date_not_is_pay_thursday'),
          data: { date },
        }
      }

      const buffer = await assistService.getFormatPayRoll(date)
      if (buffer.status === 201) {
        response.header('Content-Type', 'text/csv')
        response.header('Content-Disposition', 'attachment; filename="file.csv"')
        response.status(201)
        response.send(buffer.buffer)
      } else {
        response.status(500)
        return {
          type: buffer.type,
          title: buffer.title,
          message: buffer.message,
          error: buffer.error,
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }


  /**
   * @swagger
   * /api/assists/{assistId}/inactivate:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assists
   *     summary: inactivate assist
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: assistId
   *         schema:
   *           type: number
   *         description: Assist id
   *         required: true
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
  async inactivate({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assistId = request.param('assistId')
      if (!assistId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { ...request.all() },
        }
      }
      const currentAssist = await Assist.query()
        .whereNull('assist_deleted_at')
        .where('assist_id', assistId)
        .first()
      if (!currentAssist) {
        const entity = t('assist')
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { assistId },
        }
      }
      currentAssist.assistActive = 0
      await currentAssist.save()
      if (currentAssist.assistPunchTimeUtc) {
        const assistService = new AssistsService(i18n)
        const date: Date = currentAssist.assistPunchTimeUtc.toJSDate()
        await assistService.updateAssistCalendar(currentAssist.assistEmpId, date)
      }

      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('the_assist_was_inactivate_successfully'),
        data: { assist: currentAssist },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/assists/get-flat-list:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assists
   *     summary: get assist flat list by employee id
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: true
   *         description: Employee Id
   *         schema:
   *           type: integer
   *       - name: dateStart
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         required: true
   *         description: Start date
   *       - name: dateEnd
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         required: true
   *         description: End date
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
  async getAssistFlatList({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {

      const employeeId = request.input('employeeId')
      if (!employeeId) {
        const entity = t('employee')
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('entity_id_was_not_found', {entity}),
          data: { employeeId },
        }
      }
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')

      const assistService = new AssistsService(i18n)
      const filter = {
        employeeId: employeeId,
        dateStart: dateStart,
        dateEnd: dateEnd,
      } as AssistFlatFilterInterface

      const assistsFlatList = await assistService.getAssistFlatList(filter)

      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: { data: assistsFlatList },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
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

  /**
   * @swagger
   * /api/v1/assists/get-excel-permissions-dates:
   *   get:
   *     summary: Generate Excel report of employee permissions by date range
   *     security:
   *       - bearerAuth: []
   *     tags: [Assists]
   *     parameters:
   *       - in: query
   *         name: date
   *         required: true
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for the report
   *         example: "2024-01-01"
   *       - in: query
   *         name: date-end
   *         required: true
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for the report
   *         example: "2024-01-31"
   *     responses:
   *       200:
   *         description: Excel file generated successfully
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: Bad request - missing or invalid parameters
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: warning
   *                 title:
   *                   type: string
   *                   example: Invalid parameters
   *                 message:
   *                   type: string
   *                   example: Start date and end date are required
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                   example: Server Error
   *                 message:
   *                   type: string
   *                   example: An unexpected error has occurred on the server
   */
  async getExcelPermissionsByDates({ auth, request, response, i18n}: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null

      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }

      const filterDate = request.input('date')
      const filterDateEnd = request.input('date-end')

      if (!filterDate || !filterDateEnd) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Parámetros inválidos',
          message: 'Las fechas de inicio y fin son requeridas',
          data: { filterDate, filterDateEnd },
        }
      }

      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>
      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId)
      }

      const filters = {
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
        userResponsibleId: userResponsibleId,
      } as PermissionsDatesExcelFilterInterface

      const assistService = new AssistsService(i18n)
      const result = await assistService.getExcelPermissionsByDates(filters, departmentsList)

      if (result.buffer) {
        response.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response.header('Content-Disposition', 'attachment; filename="permisos-fechas.xlsx"')
        return response.send(result.buffer)
      } else {
        response.status(result.status || 500)
        return {
          type: result.type || 'error',
          title: result.title || 'Error',
          message: result.message || 'Error al generar el reporte',
          data: result.error ? { error: result.error } : null,
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'Ha ocurrido un error inesperado en el servidor',
        data: { error: error.message },
      }
    }
  }
}
