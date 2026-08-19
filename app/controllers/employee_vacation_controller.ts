import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { EmployeeVacationExcelFilterInterface } from '../interfaces/employee_vacation_excel_filter_interface.js'
import EmployeeVacationService from '#services/employee_vacation_service'
import { resolveEmployeeImportApiError } from '../helpers/employee_import_api_error.js'
import { EMPLOYEE_IMPORT_ERROR_CODES } from '../constants/employee_import_error_codes.js'

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
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Business Unit id
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
      const businessUnitId = request.input('businessUnitId')
      const filterStartDate = request.input('startDate')
      const filterEndDate = request.input('endDate')
      const onlyInactive = request.input('onlyInactive')
      const onlyOneYear = request.input('onlyOneYear')
      const filters = {
        search: search,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        businessUnitId: businessUnitId,
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
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Business Unit id
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
      const businessUnitId = request.input('businessUnitId')
      const filterStartDate = request.input('startDate')
      const filterEndDate = request.input('endDate')
      const onlyInactive = request.input('onlyInactive')
      const filters = {
        search: search,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        businessUnitId: businessUnitId,
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
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *         description: Business Unit id
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
      const businessUnitId = request.input('businessUnitId')
      const filterStartDate = request.input('startDate')
      const filterEndDate = request.input('endDate')
      const onlyInactive = request.input('onlyInactive')
      const onlyOneYear = request.input('onlyOneYear')
      const filters = {
        search: search,
        employeeId: employeeId,
        departmentId: departmentId,
        positionId: positionId,
        businessUnitId: businessUnitId,
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

  /**
   * @swagger
   * /api/employees-vacations/get-vacation-import-template:
   *   get:
   *     summary: Descargar plantilla Excel para importación masiva de vacaciones
   *     security:
   *       - bearerAuth: []
   *     tags: [Employees]
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *       - name: employeeId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *       - name: departmentId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *       - name: positionId
   *         in: query
   *         required: false
   *         schema:
   *           type: number
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         description: Filtrar solo empleados de esta unidad de negocio de trabajo
   *         schema:
   *           type: integer
   *           example: 1
   *       - name: payrollBusinessUnitId
   *         in: query
   *         required: false
   *         description: Filtrar solo empleados con esta unidad de negocio de nómina
   *         schema:
   *           type: integer
   *           example: 12
   *     responses:
   *       201:
   *         description: Archivo Excel generado correctamente
   *       500:
   *         description: Error al generar el template
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
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-importacion-vacaciones
   *                 code:
   *                   type: string
   *                   example: EMP.IMPORT.SERVER_VACATIONS
   */
  async getVacationImportTemplate({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
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

      const businessUnitIdRaw = request.input('businessUnitId')
      const payrollBusinessUnitIdRaw = request.input('payrollBusinessUnitId')
      const businessUnitIdParsed =
        businessUnitIdRaw !== undefined && businessUnitIdRaw !== ''
          ? Number(businessUnitIdRaw)
          : undefined
      const payrollBusinessUnitIdParsed =
        payrollBusinessUnitIdRaw !== undefined && payrollBusinessUnitIdRaw !== ''
          ? Number(payrollBusinessUnitIdRaw)
          : undefined

      const filters = {
        search: request.input('search'),
        employeeId: request.input('employeeId') || 0,
        departmentId: request.input('departmentId') || 0,
        positionId: request.input('positionId') || 0,
        filterStartDate: '',
        filterEndDate: '',
        onlyInactive: false,
        userResponsibleId,
        businessUnitId:
          businessUnitIdParsed !== undefined && !Number.isNaN(businessUnitIdParsed) && businessUnitIdParsed > 0
            ? businessUnitIdParsed
            : undefined,
        payrollBusinessUnitId:
          payrollBusinessUnitIdParsed !== undefined &&
          !Number.isNaN(payrollBusinessUnitIdParsed) &&
          payrollBusinessUnitIdParsed > 0
            ? payrollBusinessUnitIdParsed
            : undefined,
      } as EmployeeVacationExcelFilterInterface

      const service = new EmployeeVacationService(i18n)
      const result = await service.generateVacationImportTemplate(filters, businessUnitScope)

      if (result.status === 201) {
        response.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response.header(
          'Content-Disposition',
          'attachment; filename=plantilla_importacion_vacaciones.xlsx'
        )
        response.status(201)
        response.send(result.buffer)
      } else {
        response.status(result.status)
        return {
          type: result.type,
          title: result.title,
          message: result.message,
          detail: result.detail,
          key: result.key,
          code: result.code,
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error inesperado al generar la plantilla de importación de vacaciones')
      const resolved = resolveEmployeeImportApiError(error, 500, i18n, {
        errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS,
        key: 'error-importacion-vacaciones',
      })
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        detail: resolved.detail,
        key: resolved.key,
        code: resolved.errorCode,
      }
    }
  }

  /**
   * @swagger
   * /api/employees-vacations/import-vacation-excel:
   *   post:
   *     summary: Importar vacaciones masivamente desde Excel
   *     security:
   *       - bearerAuth: []
   *     tags: [Employees]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Archivo Excel (.xlsx) generado con la plantilla oficial
   *     responses:
   *       201:
   *         description: Vacaciones importadas correctamente
   *       422:
   *         description: Errores de validación (no se guardó ningún dato)
   *       500:
   *         description: Error inesperado del servidor
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
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-importacion-vacaciones
   *                 code:
   *                   type: string
   *                   example: EMP.IMPORT.SERVER_VACATIONS
   */
  async importVacationExcel({ request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const file = request.file('file', {
        extnames: ['xlsx'],
        size: '10mb',
      })

      if (!file) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Archivo requerido',
          message: 'Debe subir un archivo Excel (.xlsx).',
        }
      }

      if (file.hasErrors) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Archivo inválido',
          message: file.errors.map((e) => e.message).join(', '),
        }
      }

      const service = new EmployeeVacationService(i18n)
      const result = await service.importVacationFromExcel(file, businessUnitScope)

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error) {
      logger.error({ err: error }, 'Error inesperado al importar vacaciones desde Excel')
      const resolved = resolveEmployeeImportApiError(error, 500, i18n, {
        errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS,
        key: 'error-importacion-vacaciones',
      })
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        detail: resolved.detail,
        key: resolved.key,
        code: resolved.errorCode,
      }
    }
  }
}
