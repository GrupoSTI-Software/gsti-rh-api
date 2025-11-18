import { HttpContext } from '@adonisjs/core/http'
import { EmployeeVacationExcelFilterInterface } from '../interfaces/employee_vacation_excel_filter_interface.js'
import EmployeeVacationService from '#services/employee_vacation_service'

export default class EmployeeVacationController {
  /**
   * @swagger
   * /api/employees-vacations/get-excel:
   *   get:
   *     summary: get vacations excel
   *     security:
   *       - bearerAuth: []
   *     tags: [Employees]
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: startDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2022-01-01"
   *         description: Date from get list
   *       - name: endDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: employeeId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Employee id
   *       - name: departmentId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Department id
   *       - name: positionId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Position id
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: onlyOneYear
   *         in: query
   *         required: false
   *         description: Include one year
   *         default: true
   *         schema:
   *           type: boolean
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
  async getExcel({ auth, request, response, i18n }: HttpContext) {
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
      const search = request.input('search')
      const employeeId = request.input('employeeId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const filterStartDate = request.input('startDate')
      const filterEndDate = request.input('endDate')
      const onlyInactive = request.input('onlyInactive')
      const onlyOneYear = request.input('onlyOneYear')
      const filters = {
        search: search,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        filterStartDate: filterStartDate,
        filterEndDate: filterEndDate,
        onlyInactive: onlyInactive,
        onlyOneYear: onlyOneYear,
        userResponsibleId: userResponsibleId,
      } as EmployeeVacationExcelFilterInterface
      const emplpoyeeVacationService = new EmployeeVacationService(i18n)
      const buffer = await emplpoyeeVacationService.getExcelAll(filters)
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
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees-vacations/get-vacations-used-excel:
   *   get:
   *     summary: get vacations days used excel
   *     security:
   *       - bearerAuth: []
   *     tags: [Employees]
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: startDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2022-01-01"
   *         description: Date from get list
   *       - name: endDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: employeeId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Employee id
   *       - name: departmentId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Department id
   *       - name: positionId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Position id
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
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
  async getVacationsUsedExcel({ auth, request, response, i18n }: HttpContext) {
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
      const search = request.input('search')
      const employeeId = request.input('employeeId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const filterStartDate = request.input('startDate')
      const filterEndDate = request.input('endDate')
      const onlyInactive = request.input('onlyInactive')
      const filters = {
        search: search,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        filterStartDate: filterStartDate,
        filterEndDate: filterEndDate,
        onlyInactive: onlyInactive,
        userResponsibleId: userResponsibleId,
      } as EmployeeVacationExcelFilterInterface
      const emplpoyeeVacationService = new EmployeeVacationService(i18n)
      const buffer = await emplpoyeeVacationService.getVacationUsedExcel(filters)
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
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees-vacations/get-vacations-summary-excel:
   *   get:
   *     summary: get vacations summary excel
   *     security:
   *       - bearerAuth: []
   *     tags: [Employees]
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: startDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2022-01-01"
   *         description: Date from get list
   *       - name: endDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: employeeId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Employee id
   *       - name: departmentId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Department id
   *       - name: positionId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Position id
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: onlyOneYear
   *         in: query
   *         required: false
   *         description: Include one year
   *         default: true
   *         schema:
   *           type: boolean
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
  async getVacationsSummaryExcel({ auth, request, response, i18n }: HttpContext) {
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
      const search = request.input('search')
      const employeeId = request.input('employeeId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const filterStartDate = request.input('startDate')
      const filterEndDate = request.input('endDate')
      const onlyInactive = request.input('onlyInactive')
      const onlyOneYear = request.input('onlyOneYear')
      const filters = {
        search: search,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        filterStartDate: filterStartDate,
        filterEndDate: filterEndDate,
        onlyInactive: onlyInactive,
        userResponsibleId: userResponsibleId,
        onlyOneYear: onlyOneYear,
      } as EmployeeVacationExcelFilterInterface
      const emplpoyeeVacationService = new EmployeeVacationService(i18n)
      const buffer = await emplpoyeeVacationService.getVacationsSummaryExcel(filters)
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
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
