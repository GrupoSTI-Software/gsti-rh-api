import { isUploadFailureSentinel } from '#constants/upload_sentinels'
import { assertSpreadsheetFile } from '#helpers/spreadsheet_intake_guard'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import DepartmentPosition from '#models/department_position'
import Employee from '#models/employee'
import EmployeeService from '#services/employee_service'
import CalendarExportService from '#services/calendar_export_service'
import { buildCalendarExportFileName } from '#constants/calendar_export'
import {
  buildDownloadFileName,
  contentDisposition,
  formatDownloadFileDate,
} from '#helpers/download_file_name'
import { HttpContext } from '@adonisjs/core/http'
import { createEmployeeValidator } from '../validators/employee.js'
import { updateEmployeeValidator } from '../validators/employee.js'
import db from '@adonisjs/lucid/services/db'
import {
  emailMirrorActorFromContext,
  mirrorEmployeeEmailToUserEmail,
  previousEmailRecipients,
  toPublicEmailMirrorOutcome,
} from '#helpers/person_user_email_mirror'
import {
  isEmailMirrorConflictError,
  isEmailMirrorRefusedError,
  isUserAccessEmailDuplicatedIndexError,
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'
import EmployeeStructureService, {
  requireEmployeeStructureForCreate,
  resolveEmployeeStructureUpdate,
} from '#services/employee_structure_service'
import ScopeDeniedLogService from '#services/scope_denied_log_service'
import { EmployeeFilterSearchInterface } from '../interfaces/employee_filter_search_interface.js'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import UserService from '#services/user_service'
import { ensureEmployeeTabRead } from '#helpers/ensure_employee_tab_read'
import {
  emptyEmployeeRoleScope,
  resolveEmployeeRoleScopeForUser,
} from '#helpers/resolve_employee_role_scope'
import {
  EMPLOYEES_READ_PERMISSION_DECLARATIONS,
  EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION,
} from '#constants/employees_read_permission_declarations'
import { isTerminatedEmployeesFilterRequested } from '#helpers/terminated_employees_filter'
import VacationSetting from '#models/vacation_setting'
import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import ShiftException from '#models/shift_exception'
import EmployeeShift from '#models/employee_shift'
import EmployeeType from '#models/employee_type'
import User from '#models/user'
import Role from '#models/role'
import AssistsService from '#services/assist_service'
import { EmployeeWorkDaysDisabilityFilterInterface } from '../interfaces/employee_work_days_disability_filter_interface.js'
import RoleService from '#services/role_service'
import { EmployeeSyncInterface } from '../interfaces/employee_sync_interface.js'
import { createVacationDeductionValidator } from '../validators/vacation_deduction.js'
import {
  EMPLOYEE_TERMINATION_MODALITIES,
  EMPLOYEE_TERMINATION_TYPES,
  getEmployeeTerminationTypeDefinition,
  isTerminationTypeCompatibleWithModality,
  isValidEmployeeTerminationModality,
} from '../constants/employee_termination.js'
import EmployeeSalaryHistoryService from '#services/employee_salary_history_service'
import PiiExportService from '#services/pii_export_service'
import logger from '@adonisjs/core/services/logger'
import { resolveEmployeeImportApiError } from '../helpers/employee_import_api_error.js'
import { resolveEmployeeQuotaApiError } from '../helpers/employee_quota_api_error.js'
import { EmployeeQuotaError } from '../exceptions/employee_quota_error.js'
import EmployeePositionLevelService from '#services/employee_position_level_service'
import { EmployeePositionLevelError } from '../exceptions/employee_position_level_error.js'
import { resolveEmployeePositionLevelApiError } from '../helpers/employee_position_level_api_error.js'
import { respondEmployeeImportValFileError } from '../helpers/employee_import_request_errors.js'
import { EMPLOYEE_IMPORT_UPLOAD, EMPLOYEE_IMPORT_ERROR_CODES } from '../constants/employee_import_error_codes.js'
import { SENSITIVE_EXPORT_PLACEHOLDER } from '#constants/sensitive_export_placeholder'
import { SENSITIVE_EXPORT_INVENTORY } from '#constants/sensitive_export_inventory'
import {
  EMPLOYEE_WORK_SCHEDULE_ERROR_CODES,
  EmployeeWorkScheduleErrorCode,
} from '#constants/employee_work_schedule'
import { I18n } from '@adonisjs/i18n'
import { TenantContext } from '#utils/tenant_context'
import { REPORT_NEUTRAL_ARGB } from '#constants/report_neutral_theme'
import { getBusinessTimeZone, toCalendarIsoDate } from '#utils/business_date'
import { EMPLOYEE_WORK_SCHEDULE, type EmployeeWorkSchedule } from '#constants/employee_work_schedule'
import { isEmployeeTerminationRecordChanged } from '#helpers/employee_termination_record'
import type { PersonReleaseContext } from '#helpers/person_release_guard'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { EMPLOYEES_TERMINATION_RECORD_PERMISSION } from '#constants/employees_write_permission_declarations'
import EmployeeQuotaService from '#services/employee_quota_service'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'
import { ensureCredentialChangeAllowed } from '#helpers/credential_change_gate'
import { notifyAndAudit, revokeSessions } from '#services/credential_change_service'
import { formatReportCalendarDate, REPORT_DATE_FORMAT } from '#helpers/report_locale'
import { blankMissingTexts, reportFullName, reportText } from '#helpers/report_text'
import { frozenHeaderViews } from '#helpers/report_sheet_views'
import { resolveResponsibleUserId } from '#helpers/responsible_employee_scope'

/**
 * Lo que el reporte de empleados lee de cada empleado (con departamento,
 * puesto y persona precargados). Todo opcional: un dato ausente sale en blanco.
 */
interface EmployeesListReportEmployee {
  employeeCode?: string | number | null
  employeeHireDate?: DateTime | Date | string | null
  employeeWorkSchedule?: string | null
  department?: { departmentName?: string | null } | null
  position?: { positionName?: string | null } | null
  person?: {
    personFirstname?: string | null
    personLastname?: string | null
    personSecondLastname?: string | null
    personGender?: string | null
    personPhone?: string | null
    personCurp?: string | null
    personRfc?: string | null
    personImssNss?: string | null
  } | null
}

/** Modalidad de trabajo como se escribe en los descargables (mismas etiquetas que la plantilla de importación). */
const EMPLOYEE_WORK_SCHEDULE_REPORT_LABEL: Record<EmployeeWorkSchedule, string> = {
  [EMPLOYEE_WORK_SCHEDULE.ONSITE]: 'Presencial',
  [EMPLOYEE_WORK_SCHEDULE.REMOTE]: 'Home office',
  [EMPLOYEE_WORK_SCHEDULE.HYBRID]: 'Híbrido',
}


// import { wrapper } from 'axios-cookiejar-support'
// import { CookieJar } from 'tough-cookie'

// const jar = new CookieJar()
// const client = wrapper(axios.create({ jar }))

export default class EmployeeController {
  /**
   * Set inmutable con los códigos de error de la modalidad híbrida. Se usa
   * para reconocer errores de negocio arrojados por `EmployeeService` y
   * traducirlos a respuesta 400 con clave i18n.
   *
   * Ver `docs/spec-USRH1782788926678.md` §7.3 y §9.3.
   */
  private static readonly WORK_SCHEDULE_ERROR_CODES: ReadonlySet<string> = new Set(
    Object.values(EMPLOYEE_WORK_SCHEDULE_ERROR_CODES)
  )

  /**
   * Traduce un `error.message` que sea un código conocido de la modalidad
   * híbrida a una respuesta 400 estructurada. Devuelve `null` si el mensaje
   * no es uno de los códigos (el catch general se encarga).
   */
  private mapWorkScheduleErrorMessage(
    message: string | undefined,
    i18n: I18n
  ): {
    type: 'warning'
    title: string
    code: EmployeeWorkScheduleErrorCode
    message: string
  } | null {
    if (!message || !EmployeeController.WORK_SCHEDULE_ERROR_CODES.has(message)) {
      return null
    }
    const code = message as EmployeeWorkScheduleErrorCode
    const translationKey = `employee_work_schedule_${code}`
    const titleKey = 'employee_work_schedule_error_title'
    const translated = i18n.t(translationKey)
    const title = i18n.t(titleKey)
    return {
      type: 'warning',
      title: title === titleKey ? 'Modalidad de trabajo' : title,
      code,
      message: translated === translationKey ? code : translated,
    }
  }

  /**
   * Parsea un valor de query param que puede ser un número único o una lista separada por comas.
   * Retorna un número si es un solo valor, un array de números si son varios, o null si no hay valor.
   */
  private parseIdOrIds(value: any): number | number[] | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    const raw = String(value)
    if (raw.includes(',')) {
      const ids = raw
        .split(',')
        .map((v: string) => Number(v.trim()))
        .filter((n: number) => !Number.isNaN(n) && n > 0)
      return ids.length > 0 ? ids : null
    }
    const single = Number(raw)
    return !Number.isNaN(single) && single > 0 ? single : null
  }

  /**
   * branchNameIds=2,3,4 → [2,3,4]. Vacío o ausente → undefined (no aplica filtro).
   */
  private parseBranchNameIds(value: unknown): number[] | undefined {
    const parsed = this.parseIdOrIds(value)
    if (parsed === null) {
      return undefined
    }
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  /** Normaliza texto opcional para modalidad/tipo de baja (vacío → null). */
  private normalizeTerminationInput(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null
    }
    const s = String(value).trim()
    return s === '' ? null : s
  }

  /** Valida modalidad y tipo de baja contra el catálogo (coherencia incluida). */
  private validateTerminationCatalogOrError(
    modality: string,
    terminationType: string
  ): { title: string; message: string; data: Record<string, unknown> } | null {
    if (!isValidEmployeeTerminationModality(modality)) {
      return {
        title: 'Modalidad de baja no válida',
        message: 'La modalidad de baja no está dentro del catálogo permitido.',
        data: { modality },
      }
    }
    if (!getEmployeeTerminationTypeDefinition(terminationType)) {
      return {
        title: 'Tipo de baja no válido',
        message: 'El tipo de baja no está dentro del catálogo permitido.',
        data: { employeeTerminationType: terminationType },
      }
    }
    if (!isTerminationTypeCompatibleWithModality(terminationType, modality)) {
      return {
        title: 'Combinación no válida',
        message: 'El tipo de baja indicado no aplica para la modalidad seleccionada.',
        data: { employeeTerminationModality: modality, employeeTerminationType: terminationType },
      }
    }
    return null
  }


  /**
   * @swagger
   * /api/employees:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: employeeWorkSchedule
   *         in: query
   *         required: false
   *         description: Employee work schedule
   *         schema:
   *           type: string
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: employeeTypeId
   *         in: query
   *         required: false
   *         description: Employee Type Id
   *         schema:
   *           type: integer
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: orderBy
   *         in: query
   *         required: false
   *         description: Order by field (number or name)
   *         schema:
   *           type: string
   *           enum: [number, name]
   *       - name: orderDirection
   *         in: query
   *         required: false
   *         description: Order direction (ascend or descend)
   *         schema:
   *           type: string
   *           enum: [ascend, descend]
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         description: Business Unit Id
   *         schema:
   *           type: integer
   *       - name: payrollBusinessUnitId
   *         in: query
   *         required: false
   *         description: Payroll Business Unit Id
   *         schema:
   *           type: integer
   *       - name: branchNameIds
   *         in: query
   *         required: false
   *         description: IDs de sucursal (branch_office_id) separados por comas. Solo empleados con asignación activa a alguna de ellas. Vacío u omitido = sin filtro.
   *         schema:
   *           type: string
   *           example: "2,3,4"
   *       - name: getMails
   *         in: query
   *         required: false
   *         description: Si es true, employeeBusinessEmail en la respuesta usa jerarquía (usuario > empresa > personal)
   *         schema:
   *           type: boolean
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
  async index(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      await auth.check()
      const user = auth.user

      let hasAccessToFullEmployees = false
      let userResponsibleId = null

      if (user) {
        await user.load('role')

        if (user.role.roleSlug !== 'root') {
          const roleService = new RoleService()
          hasAccessToFullEmployees = await roleService.hasAccessToFullEmployees(user.role.roleId)
        }

        if (user.role.roleSlug !== 'root' && !hasAccessToFullEmployees) {
          userResponsibleId = user?.userId
        }
      }

      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>

      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId, hasAccessToFullEmployees)
      }

      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const employeeWorkSchedule = request.input('employeeWorkSchedule')
      const onlyInactive = request.input('onlyInactive')
      if (isTerminatedEmployeesFilterRequested(onlyInactive)) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const employeeTypeId = request.input('employeeTypeId')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const orderBy = request.input('orderBy')
      const orderDirection = request.input('orderDirection')
      const shiftStartTimeInit = request.input('shiftStartTimeInit')
      const shiftStartTimeEnd = request.input('shiftStartTimeEnd')
      const shiftEndTimeStart = request.input('shiftEndTimeStart')
      const shiftEndTimeEnd = request.input('shiftEndTimeEnd')
      const exceptionDate = request.input('exceptionDate')
      const shiftStartTime = request.input('shiftStartTime')
      const shiftEndTime = request.input('shiftEndTime')
      const businessUnitId = request.input('businessUnitId')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const getMails = request.input('getMails')
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))

      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        employeeWorkSchedule: employeeWorkSchedule,
        onlyInactive: onlyInactive,
        employeeTypeId: employeeTypeId,
        userResponsibleId: userResponsibleId,
        page: page,
        limit: limit,
        orderBy: orderBy,
        orderDirection: orderDirection,
        shiftStartTimeInit: shiftStartTimeInit,
        shiftStartTimeEnd: shiftStartTimeEnd,
        shiftEndTimeStart: shiftEndTimeStart,
        shiftEndTimeEnd: shiftEndTimeEnd,
        exceptionDate: exceptionDate,
        shiftStartTime: shiftStartTime,
        shiftEndTime: shiftEndTime,
        businessUnitId: businessUnitId,
        payrollBusinessUnitId: payrollBusinessUnitId,
        branchNameIds: branchNameIds,
        getMails: getMails,
      } as EmployeeFilterSearchInterface

      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.index(filters, departmentsList, businessUnitScope)

      response.status(200)

      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
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

  /**
   * @swagger
   * /api/employees:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: create new employee
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeFirstName:
   *                 type: string
   *                 description: Employe first name
   *                 required: false
   *                 default: ''
   *               employeeLastName:
   *                 type: string
   *                 description: Employee last name
   *                 required: false
   *                 default: ''
   *               employeeSecondLastName:
   *                 type: string
   *                 description: Employee second last name
   *                 required: false
   *                 default: ''
   *               employeeCode:
   *                 type: string
   *                 description: Employee code
   *                 required: true
   *                 default: ''
   *               employeePayrollNum:
   *                 type: string
   *                 description: Employee pay roll num
   *                 required: true
   *                 default: ''
   *               employeeHireDate:
   *                 type: string
   *                 format: date
   *                 description: Employee hire date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               companyId:
   *                 type: integer
   *                 description: Company id
   *                 required: true
   *                 default: 0
   *               departmentId:
   *                 type: integer
   *                 description: Department id
   *                 required: true
   *                 default: 0
   *               positionId:
   *                 type: integer
   *                 description: Position id
   *                 required: true
   *                 default: 0
   *               positionLevelConfigId:
   *                 type: integer
   *                 nullable: true
   *                 description: Nivel del puesto asignado al empleado (fila de position_position_levels del puesto efectivo). `null` o ausente = sin nivel
   *                 required: false
   *               personId:
   *                 type: integer
   *                 description: Person id
   *                 required: true
   *                 default: 0
   *               businessUnitId:
   *                 type: integer
   *                 description: Business unit id
   *                 required: true
   *                 default: 1
   *               dailySalary:
   *                 type: string
   *                 nullable: true
   *                 description: Salario diario. En respuestas GET con valor se entrega enmascarado (`•••••`); sin valor, null. El completo solo por reveal. En alta, ausente = 0.
   *                 required: false
   *                 default: 0
   *               payrollBusinessUnitId:
   *                 type: number
   *                 description: Payroll Business Unit id
   *                 required: true
   *                 default: 1
   *               employeeAssistDiscriminator:
   *                 type: boolean
   *                 description: If true, the employee is not considered on attendance monitor
   *                 required: true
   *                 default: 0
   *               employeeWorkSchedule:
   *                 type: string
   *                 enum: [Onsite, Remote, Hybrid]
   *                 description: Modalidad de trabajo del empleado
   *                 required: true
   *                 default: 'Onsite'
   *               employeeWorkScheduleHybridMode:
   *                 type: string
   *                 enum: [SpecificDays, DaysPerWeek, DaysPerMonth]
   *                 nullable: true
   *                 description: Modo de la modalidad híbrida. Solo cuando `employeeWorkSchedule` es `Hybrid`.
   *                 required: false
   *               employeeWorkScheduleHybridConfig:
   *                 type: object
   *                 nullable: true
   *                 description: Configuración híbrida. Objeto con days number[] para SpecificDays, o count number para DaysPerWeek y DaysPerMonth.
   *                 required: false
   *               employeeTypeId:
   *                 type: integer
   *                 description: Employee type id
   *                 required: true
   *                 default: 0
   *               employeeBusinessEmail:
   *                 type: string
   *                 description: Employee business email
   *                 required: false
   *                 default: ''
   *               employeeTypeOfContract:
   *                 type: string
   *                 description: Employee type of contract
   *                 required: true
   *                 default: ''
   *               employeeIgnoreConsecutiveAbsences:
   *                 type: boolean
   *                 description: If true, the employee is not considered on report consecutive faults
   *                 required: true
   *                 default: 0
   *               employeeAuthorizeAnyZones:
   *                 type: boolean
   *                 description: If true, the employee is authorized to any zones
   *                 required: true
   *                 default: 0
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
   *         description: The parameters entered are invalid or essential data is missing to process the request. Errores de negocio de modalidad híbrida se retornan con `code` (ej. `hybrid_requires_active_shift`).
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
   *                 code:
   *                   type: string
   *                   description: Código de negocio (solo cuando la modalidad híbrida falla)
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '409':
   *         description: Cupo de empleados agotado o empresa self-service sin plan vigente
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
   *                   description: Título traducido del rechazo
   *                 message:
   *                   type: string
   *                   description: Mensaje principal traducido
   *                 detail:
   *                   type: string
   *                   description: Detalle con cantidades y salida comercial
   *                 key:
   *                   type: string
   *                   enum: [cupo-empleados-agotado, sin-plan-contratado]
   *                 code:
   *                   type: string
   *                   enum: [EMP.QUOTA.EXCEEDED, EMP.QUOTA.NO_PLAN]
   *                 data:
   *                   type: object
   *                   description: Solo cantidades; nunca identificadores internos de empresa
   *                   properties:
   *                     contracted:
   *                       type: integer
   *                       description: Cupo efectivo (contratación o legacy)
   *                     active:
   *                       type: integer
   *                       description: Empleados vigentes al momento del rechazo
   *       '422':
   *         description: Nivel de puesto rechazado — no pertenece a los niveles configurados del puesto efectivo, o está inactivo para una asignación nueva
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
   *                   description: Título traducido del rechazo
   *                 message:
   *                   type: string
   *                   description: Mensaje principal traducido
   *                 detail:
   *                   type: string
   *                   description: Detalle traducido del rechazo
   *                 key:
   *                   type: string
   *                   enum: [nivel-no-pertenece-al-puesto, nivel-inactivo-no-asignable]
   *                 code:
   *                   type: string
   *                   enum: [ELVL.CONF.001, ELVL.CONF.002]
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
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const employeeFirstName = request.input('employeeFirstName')
      const employeeLastName = request.input('employeeLastName')
      const employeeSecondLastName = request.input('employeeSecondLastName')
      const employeeCode = request.input('employeeCode')
      const employeePayrollNum = request.input('employeePayrollNum')
      const employeePayrollCode = request.input('employeePayrollCode')
      let employeeHireDate = request.input('employeeHireDate')
      employeeHireDate = employeeHireDate
        ? (employeeHireDate.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const personId = request.input('personId')
      const companyId = request.input('companyId')
      const departmentId = request.input('departmentId', null)
      const positionId = request.input('positionId', null)
      const workSchedule = request.input('employeeWorkSchedule')
      const workScheduleHybridMode = request.input('employeeWorkScheduleHybridMode') ?? null
      const workScheduleHybridConfig = request.input('employeeWorkScheduleHybridConfig') ?? null
      const employeeTypeId = request.input('employeeTypeId')
      const employeeBusinessEmail = request.input('employeeBusinessEmail')
      const employeeTypeOfContract = request.input('employeeTypeOfContract')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const dailySalary = request.input('dailySalary') || 0
      const employeeAssistDiscriminator = request.input('employeeAssistDiscriminator')
      const employeeIgnoreConsecutiveAbsences = request.input('employeeIgnoreConsecutiveAbsences')
      const employeeAuthorizeAnyZones = request.input('employeeAuthorizeAnyZones')
      const employee = {
        employeeId: 0,
        employeeFirstName: employeeFirstName,
        employeeLastName: `${employeeLastName}`,
        employeeSecondLastName: `${employeeSecondLastName}`,
        employeeCode: employeeCode,
        employeePayrollNum: employeePayrollNum,
        employeePayrollCode: employeePayrollCode,
        employeeHireDate: employeeHireDate,
        companyId: companyId,
        departmentId: departmentId,
        positionId: positionId,
        personId: personId,
        businessUnitId: request.input('businessUnitId'),
        dailySalary: dailySalary,
        payrollBusinessUnitId: payrollBusinessUnitId,
        employeeWorkSchedule: workSchedule,
        employeeWorkScheduleHybridMode: workScheduleHybridMode,
        employeeWorkScheduleHybridConfig: workScheduleHybridConfig,
        employeeTypeId: employeeTypeId,
        employeeBusinessEmail: employeeBusinessEmail,
        employeeAssistDiscriminator: employeeAssistDiscriminator,
        employeeTypeOfContract: employeeTypeOfContract,
        employeeIgnoreConsecutiveAbsences: employeeIgnoreConsecutiveAbsences,
        employeeAuthorizeAnyZones: employeeAuthorizeAnyZones,
      } as Employee
      const employeeService = new EmployeeService(i18n)
      // USRH1789698261608: actor y scope del acto, solo para la traza de la
      // liberación. `personId` llega crudo del payload: se castea aquí y el
      // helper vuelve a normalizar (doble cinturón).
      const releaseContext: PersonReleaseContext = {
        actorUserId: auth.user?.userId ?? null,
        businessUnitScope,
      }
      const requiredStructure = requireEmployeeStructureForCreate({
        departmentId: departmentId,
        positionId: positionId,
      })
      if (!requiredStructure.ok) {
        if (personId) {
          await employeeService.releasePersonIfOrphan(Number(personId), releaseContext)
        }
        const messageKey =
          requiredStructure.missing === 'both'
            ? 'employee_structure_required_both'
            : `employee_${requiredStructure.missing}_required`
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t(`${messageKey}_title`),
          message: i18n.t(`${messageKey}_message`),
          detail: i18n.t(`${messageKey}_message`),
          key: 'alta-empleado-invalida',
        }
      }
      const data = await request.validateUsing(createEmployeeValidator)
      employee.departmentId = data.departmentId ?? employee.departmentId
      employee.positionId = data.positionId ?? employee.positionId
      const structureCheck = await new EmployeeStructureService().verifyAssignable({
        departmentId: Number(employee.departmentId),
        positionId: Number(employee.positionId),
        businessUnitId: Number(employee.businessUnitId),
        departmentIdToVerify: Number(employee.departmentId),
        positionIdToVerify: Number(employee.positionId),
      })
      if (!structureCheck.ok) {
        await ScopeDeniedLogService.log({
          domain: structureCheck.field,
          action: 'assign-to-employee',
          requestedId: structureCheck.requestedId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        if (personId) {
          await employeeService.releasePersonIfOrphan(Number(personId), releaseContext)
        }
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_title`),
          message: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_message`),
          detail: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_message`),
          key: 'alta-empleado-invalida',
        }
      }
      const exist = await employeeService.verifyInfoExist(employee)
      if (exist.status !== 200) {
        // USRH1785436961832: el alta se rechaza (p. ej. catálogo faltante) —
        // se libera la persona creada para este acto, si quedó huérfana, para
        // que el reintento no choque con "personEmail has already been taken".
        if (personId) {
          await employeeService.releasePersonIfOrphan(Number(personId), releaseContext)
        }
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          detail: exist.message,
          key: 'alta-empleado-invalida',
          data: { ...data },
        }
      }
      const verifyInfo = await employeeService.verifyInfo(employee)
      if (verifyInfo.status !== 200) {
        if (personId) {
          await employeeService.releasePersonIfOrphan(Number(personId), releaseContext)
        }
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          detail: verifyInfo.message,
          key: 'alta-empleado-invalida',
          data: { ...data },
        }
      }
      // Pertenencia del nivel de puesto (USRH1785964117188): corre contra el
      // positionId del alta (ya exigido y verificado) y antes de persistir.
      const positionLevelConfigId = data.positionLevelConfigId ?? null
      await new EmployeePositionLevelService().assertAssignable({
        positionLevelConfigId,
        effectivePositionId: employee.positionId,
        businessUnitScope,
        previousPositionLevelConfigId: null,
      })
      employee.positionLevelConfigId = positionLevelConfigId

      const roles = await Role.query()
        .whereIn('role_slug', ['rh-manager', 'admin', 'nominas'])
        .whereNull('role_deleted_at')

      let usersResponsible: Array<User> = []

      if (roles.length) {
        const roleIds = roles.map((role) => role.roleId)
        usersResponsible = await User.query()
          .whereIn('role_id', roleIds)
          .preload('role')
          .orderBy('user_id')
      }
      if (userResponsibleId && user) {
        const existUser = usersResponsible.find(a => a.userId === userResponsibleId)
        if (!existUser) {
          usersResponsible.push(user)
        }
      }

      const newEmployee = await employeeService.create(employee, usersResponsible, releaseContext)
      if (newEmployee) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was created successfully',
          data: { employee: newEmployee },
        }
      }
    } catch (error) {
      // USRH1785436961832: cualquier fallo del intento (validación, modalidad
      // híbrida o error inesperado) libera la persona huérfana del acto para
      // que el reintento proceda sin residuos. `EmployeeService.create` ya
      // liberó la suya si el fallo vino de ahí (la operación es idempotente).
      const failedPersonId = Number(request.input('personId')) || 0
      if (failedPersonId > 0) {
        const employeeService = new EmployeeService(i18n)
        await employeeService.releasePersonIfOrphan(failedPersonId, {
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
      }
      if (error instanceof EmployeePositionLevelError) {
        const resolved = resolveEmployeePositionLevelApiError(error, error.httpStatus, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
        }
      }
      if (error instanceof EmployeeQuotaError) {
        const resolved = resolveEmployeeQuotaApiError(error, error.httpStatus, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
          data: resolved.data,
        }
      }
      // Errores de negocio de la modalidad híbrida se traducen a 400 con el
      // código para que el cliente muestre el mensaje correcto (i18n).
      const workScheduleError = this.mapWorkScheduleErrorMessage(error?.message, i18n)
      if (workScheduleError) {
        response.status(400)
        return workScheduleError
      }
      if (error?.code === 'E_VALIDATION_ERROR') {
        // Regla 4 (USRH1789328927556): un dato mal formado es un rechazo por
        // datos, no un error del servidor. Con 500 el BO abre la pantalla de
        // error general y el usuario pierde lo capturado.
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t('validation_error'),
          message: error.messages?.[0]?.message ?? i18n.t('validation_error'),
          errors: error.messages,
          key: 'alta-empleado-invalida',
        }
      }
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        detail: messageError,
        key: 'alta-empleado-fallida',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: update employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeFirstName:
   *                 type: string
   *                 description: Employe first name
   *                 required: false
   *                 default: ''
   *               employeeLastName:
   *                 type: string
   *                 description: Employee last name
   *                 required: false
   *                 default: ''
   *               employeeSecondLastName:
   *                 type: string
   *                 description: Employee second last name
   *                 required: false
   *                 default: ''
   *               employeeCode:
   *                 type: string
   *                 description: Employee code
   *                 required: true
   *                 default: ''
   *               employeePayrollNum:
   *                 type: string
   *                 description: Employee pay roll num
   *                 required: true
   *                 default: ''
   *               employeeHireDate:
   *                 type: string
   *                 format: date
   *                 description: Employee hire date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               companyId:
   *                 type: integer
   *                 description: Company id
   *                 required: true
   *                 default: 0
   *               departmentId:
   *                 type: integer
   *                 description: Department id
   *                 required: true
   *                 default: 0
   *               positionId:
   *                 type: integer
   *                 description: Position id
   *                 required: true
   *                 default: 0
   *               positionLevelConfigId:
   *                 type: integer
   *                 nullable: true
   *                 description: Nivel del puesto asignado al empleado (fila de position_position_levels del puesto del payload). Ausente = conservar el nivel actual; `null` = limpiar
   *                 required: false
   *               businessUnitId:
   *                 type: integer
   *                 description: Business unit id
   *                 required: true
   *                 default: 1
   *               dailySalary:
   *                 type: number
   *                 nullable: true
   *                 description: Salario diario. Ausente, `null`, no numérico o marcador `•••••` = no modificar el valor actual. El `0` explícito es válido y sí se persiste (genera asiento de historial si cambió). En respuestas GET con valor se entrega enmascarado.
   *                 required: false
   *               payrollBusinessUnitId:
   *                 type: number
   *                 description: Payroll Business Unit id
   *                 required: true
   *                 default: 1
   *               employeeAssistDiscriminator:
   *                 type: boolean
   *                 description: If true, the employee is not considered on attendance monitor
   *                 required: true
   *                 default: 0
   *               employeeWorkSchedule:
   *                 type: string
   *                 enum: [Onsite, Remote, Hybrid]
   *                 description: Modalidad de trabajo del empleado
   *                 required: true
   *                 default: 'Onsite'
   *               employeeWorkScheduleHybridMode:
   *                 type: string
   *                 enum: [SpecificDays, DaysPerWeek, DaysPerMonth]
   *                 nullable: true
   *                 description: Modo de la modalidad híbrida. Solo cuando `employeeWorkSchedule` es `Hybrid`.
   *                 required: false
   *               employeeWorkScheduleHybridConfig:
   *                 type: object
   *                 nullable: true
   *                 description: Configuración híbrida. Objeto con days number[] para SpecificDays, o count number para DaysPerWeek y DaysPerMonth.
   *                 required: false
   *               employeeTypeId:
   *                 type: integer
   *                 description: Employee type id
   *                 required: true
   *                 default: 0
   *               employeeBusinessEmail:
   *                 type: string
   *                 description: Employee business email
   *                 required: false
   *                 default: ''
   *               employeeTypeOfContract:
   *                 type: string
   *                 description: Employee type of contract
   *                 required: true
   *                 default: ''
   *               employeeIgnoreConsecutiveAbsences:
   *                 type: boolean
   *                 description: If true, the employee is not considered on report consecutive faults
   *                 required: true
   *                 default: 0
   *               employeeAuthorizeAnyZones:
   *                 type: boolean
   *                 description: If true, the employee is authorized to any zones
   *                 required: true
   *                 default: 0
   *               employeeTerminatedDate:
   *                 type: string
   *                 format: date
   *                 description: Employee terminated date (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *               employeeTerminationModality:
   *                 type: string
   *                 description: Modalidad de baja (obligatoria si hay fecha de baja). Ver GET /api/employees/termination-catalog
   *                 required: false
   *               employeeTerminationType:
   *                 type: string
   *                 description: Tipo de baja (obligatoria si hay fecha de baja). Debe ser coherente con la modalidad
   *                 required: false
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
   *         description: >-
   *           The parameters entered are invalid or essential data is missing to process the request.
   *           Además de los rechazos existentes, responde 400 cuando el correo institucional ya lo usa
   *           otra cuenta de acceso viva (USR.MAIL.002). Ningún campo se guardó.
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
   *       '403':
   *         description: |
   *           La cuenta de acceso del empleado no pertenece a las empresas del actor (USR.MAIL.005). Nada se guardó.
   *           Si el correo cambia la credencial y falta el permiso propio, responde {"title":"Sin permiso","detail":"No tienes permiso para realizar esta operación.","key":"PERM.DENIED"}.
   *       '422':
   *         description: Nivel de puesto rechazado — no pertenece a los niveles configurados del puesto del payload, o está inactivo para una asignación nueva
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
   *                   description: Título traducido del rechazo
   *                 message:
   *                   type: string
   *                   description: Mensaje principal traducido
   *                 detail:
   *                   type: string
   *                   description: Detalle traducido del rechazo
   *                 key:
   *                   type: string
   *                   enum: [nivel-no-pertenece-al-puesto, nivel-inactivo-no-asignable]
   *                 code:
   *                   type: string
   *                   enum: [ELVL.CONF.001, ELVL.CONF.002]
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
  async update(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      const actorUser = ctx.auth.user
      if (!actorUser) {
        response.status(401)
        return
      }
      const actorId = actorUser.userId
      const employeeId = request.param('employeeId')
      const employeeFirstName = request.input('employeeFirstName')
      const employeeLastName = request.input('employeeLastName')
      const employeeSecondLastName = request.input('employeeSecondLastName')
      const employeeCode = request.input('employeeCode')
      const employeePayrollNum = request.input('employeePayrollNum')
      const employeePayrollCode = request.input('employeePayrollCode')

      let employeeHireDate = request.input('employeeHireDate')
      employeeHireDate = employeeHireDate ? (employeeHireDate.split('T')[0] + ' 00:000:00').replace('"', '') : null

      const companyId = request.input('companyId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const employeeWorkSchedule = request.input('employeeWorkSchedule')
      const employeeWorkScheduleHybridMode =
        request.input('employeeWorkScheduleHybridMode') ?? null
      const employeeWorkScheduleHybridConfig =
        request.input('employeeWorkScheduleHybridConfig') ?? null
      const employeeTypeId = request.input('employeeTypeId')
      const employeeBusinessEmail = request.input('employeeBusinessEmail')
      const employeeTypeOfContract = request.input('employeeTypeOfContract')
      // Eco destructivo (USRH1787433076994): el BO reenvía el registro
      // completo, incluyendo el `dailySalary: null` que recibió por no tener
      // el permiso de lectura sensible. Ausente/null/no numérico = no tocar
      // el salario; solo un número finito (incluyendo 0 explícito) se aplica.
      const dailySalaryRaw = request.input('dailySalary')
      const dailySalaryFinite =
        typeof dailySalaryRaw === 'number' && Number.isFinite(dailySalaryRaw) ? dailySalaryRaw : null
      const salaryChangeReason: string | null = request.input('salaryChangeReason') ?? null
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const employeeAssistDiscriminator = request.input('employeeAssistDiscriminator')
      const employeeIgnoreConsecutiveAbsences = request.input('employeeIgnoreConsecutiveAbsences')
      const employeeAuthorizeAnyZones = request.input('employeeAuthorizeAnyZones')

      let employeeTerminatedDate = request.input('employeeTerminatedDate')
      employeeTerminatedDate = employeeTerminatedDate
        ? (employeeTerminatedDate.split('T')[0] + ' 00:000:00').replace('"', '')
        : null

      const employee = {
        employeeId: employeeId,
        employeeFirstName: employeeFirstName,
        employeeLastName: `${employeeLastName}`,
        employeeSecondLastName: `${employeeSecondLastName}`,
        employeeCode: employeeCode,
        employeePayrollNum: employeePayrollNum,
        employeePayrollCode: employeePayrollCode,
        employeeHireDate: employeeHireDate,
        companyId: companyId,
        departmentId: departmentId,
        positionId: positionId,
        businessUnitId: request.input('businessUnitId'),
        payrollBusinessUnitId: payrollBusinessUnitId,
        employeeWorkSchedule: employeeWorkSchedule,
        employeeWorkScheduleHybridMode: employeeWorkScheduleHybridMode,
        employeeWorkScheduleHybridConfig: employeeWorkScheduleHybridConfig,
        employeeTypeId: employeeTypeId,
        employeeBusinessEmail: employeeBusinessEmail,
        employeeAssistDiscriminator: employeeAssistDiscriminator,
        employeeTypeOfContract: employeeTypeOfContract,
        employeeIgnoreConsecutiveAbsences: employeeIgnoreConsecutiveAbsences,
        employeeAuthorizeAnyZones: employeeAuthorizeAnyZones,
        employeeTerminatedDate: employeeTerminatedDate,
      } as Employee

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { ...employee },
        }
      }

      const currentEmployee = await Employee.query()
        .where('employee_id', employeeId)
        .withTrashed()
        .first()

      if (!currentEmployee) {
        response.status(404)

        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { ...employee },
        }
      }
      const credentialChangeAllowed = await ensureCredentialChangeAllowed(ctx, {
        personId: currentEmployee.personId,
        incomingEmail: employee.employeeBusinessEmail,
        persistedEmailType: null,
        origin: 'employee-file',
      })
      if (!credentialChangeAllowed) return

      const inputTerminationModality = this.normalizeTerminationInput(
        request.input('employeeTerminationModality')
      )
      const inputTerminationType = this.normalizeTerminationInput(
        request.input('employeeTerminationType')
      )

      if (employeeTerminatedDate) {
        const modality =
          inputTerminationModality ??
          this.normalizeTerminationInput(currentEmployee.employeeTerminationModality)
        const terminationType =
          inputTerminationType ?? this.normalizeTerminationInput(currentEmployee.employeeTerminationType)
        if (!modality || !terminationType) {
          response.status(400)
          return {
            type: 'warning',
            title: 'Datos incompletos para la baja',
            message:
              'Cuando existe fecha de baja, debe indicarse la modalidad de baja y el tipo de baja.',
            data: { ...employee },
          }
        }
        const catalogError = this.validateTerminationCatalogOrError(modality, terminationType)
        if (catalogError) {
          response.status(400)
          return {
            type: 'warning',
            title: catalogError.title,
            message: catalogError.message,
            data: catalogError.data,
          }
        }
        employee.employeeTerminationModality = modality
        employee.employeeTerminationType = terminationType
      } else {
        employee.employeeTerminationModality = null
        employee.employeeTerminationType = null
      }

      if (
        isEmployeeTerminationRecordChanged(
          {
            employeeTerminatedDate: currentEmployee.employeeTerminatedDate,
            employeeTerminationModality: this.normalizeTerminationInput(
              currentEmployee.employeeTerminationModality
            ),
            employeeTerminationType: this.normalizeTerminationInput(
              currentEmployee.employeeTerminationType
            ),
          },
          {
            employeeTerminatedDate: employee.employeeTerminatedDate
              ? String(employee.employeeTerminatedDate)
              : null,
            employeeTerminationModality: employee.employeeTerminationModality ?? null,
            employeeTerminationType: employee.employeeTerminationType ?? null,
          }
        )
      ) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_TERMINATION_RECORD_PERMISSION
        )
        if (!allowed) {
          return
        }
      }

      const employeeService = new EmployeeService(i18n)
      const data = await request.validateUsing(updateEmployeeValidator, {
        meta: { employeeId: currentEmployee.employeeId },
      })
      // B7: se escribe el valor validado (con trim), no el crudo del request —
      // mismo criterio que person_controller.ts y user_controller.ts. Sin esto
      // el correo institucional persistido podía traer espacios que el
      // espejo, al normalizar, no reflejaba en la credencial.
      if (data.employeeBusinessEmail !== undefined) {
        employee.employeeBusinessEmail = data.employeeBusinessEmail
      }
      const exist = await employeeService.verifyInfoExist(employee)

      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const verifyInfo = await employeeService.verifyInfo(employee)

      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }

      // Estructura (USRH1788466831270): departamento y puesto no son
      // obligatorios al editar. Clave ausente = conservar lo guardado (aunque
      // esté vacío); null = dejar sin asignar. Solo lo DISTINTO de lo guardado
      // —o todo, si cambia de empresa— tiene que existir, estar vigente y ser
      // de la empresa del empleado; reenviar lo mismo nunca bloquea (regla 4).
      const structure = resolveEmployeeStructureUpdate(
        {
          departmentId: currentEmployee.departmentId,
          positionId: currentEmployee.positionId,
          businessUnitId: currentEmployee.businessUnitId,
        },
        {
          departmentId: data.departmentId,
          positionId: data.positionId,
          businessUnitId: Number(employee.businessUnitId),
        }
      )
      const structureCheck = await new EmployeeStructureService().verifyAssignable(structure)
      if (!structureCheck.ok) {
        // Registro de accesos bloqueados: qué id se pidió y quién, sin datos
        // del empleado. Inexistente, eliminado y ajeno son indistinguibles.
        await ScopeDeniedLogService.log({
          domain: structureCheck.field,
          action: 'assign-to-employee',
          requestedId: structureCheck.requestedId,
          actorUserId: actorId,
          businessUnitScope,
        })
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_title`),
          message: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_message`),
          data: { ...data },
        }
      }
      employee.departmentId = structure.departmentId
      employee.positionId = structure.positionId

      // Nivel de puesto (USRH1785964117188): propiedad ausente = no tocar el
      // nivel actual; null explícito = limpiar. La pertenencia corre contra
      // el positionId del payload ANTES de persistir, con la exención de
      // conservación (mismo id + mismo puesto = no-op, regla 6).
      if ('positionLevelConfigId' in data) {
        const positionLevelConfigId = data.positionLevelConfigId ?? null
        await new EmployeePositionLevelService().assertAssignable({
          positionLevelConfigId,
          // Regla 7 (USRH1788466831270): el puesto efectivo es el resuelto
          // arriba —el del payload o, si no vino, el guardado—.
          effectivePositionId: structure.positionId,
          businessUnitScope,
          previousPositionLevelConfigId: currentEmployee.positionLevelConfigId,
          currentPositionId: currentEmployee.positionId,
        })
        employee.positionLevelConfigId = positionLevelConfigId
      }

      // Eco destructivo (USRH1787433076994): solo se fija `dailySalary` en el
      // payload de salida cuando el request trajo un número finito. Ausente,
      // `null` o no numérico deja la propiedad fuera de `employee`, de modo
      // que `employeeService.update` conserve el valor actual.
      if (dailySalaryFinite !== null) {
        employee.dailySalary = dailySalaryFinite
      }

      const actor = emailMirrorActorFromContext(ctx)
      const { updateEmployee, emailMirror } = await db.transaction(async (trx) => {
        const before = await Employee.query({ client: trx })
          .where('employee_id', currentEmployee.employeeId)
          .whereNull('employee_deleted_at')
          .forUpdate()
          .first()
        const persisted = await employeeService.update(
          currentEmployee,
          employee,
          { changedBy: actor.userId, salaryChangeReason },
          trx
        )
        // El origen es lo PERSISTIDO, no el payload: una sola fuente.
        const outcome = await mirrorEmployeeEmailToUserEmail({
          personId: currentEmployee.personId,
          employeeBusinessEmail: persisted.employeeBusinessEmail,
          previousSourceEmail: before?.employeeBusinessEmail ?? null,
          actor,
          trx,
        })
        if (outcome.status === 'written') {
          const currentTokenId = actorUser.currentAccessToken?.identifier
          const preservedTokenId =
            actorId === outcome.targetId &&
              currentTokenId !== undefined &&
              currentTokenId !== null
              ? String(currentTokenId)
              : null
          const revokedCount = await revokeSessions(trx, {
            affectedUserId: outcome.targetId,
            preservedTokenId,
          })
          return { updateEmployee: persisted, emailMirror: { outcome, revokedCount } }
        }
        return { updateEmployee: persisted, emailMirror: { outcome, revokedCount: 0 } }
      })
      // Sin correo anterior no hay buzón que avisar ni imagen previa que auditar.
      if (
        emailMirror.outcome.status === 'written' &&
        emailMirror.outcome.previousEmail !== null
      ) {
        await notifyAndAudit({
          actorUserId: actorId,
          affectedUserId: emailMirror.outcome.targetId,
          origin: 'employee-file',
          previousEmail: emailMirror.outcome.previousEmail,
          newEmail: updateEmployee.employeeBusinessEmail!.trim(),
          userEmailType: 'institutional',
          previousRecipients: previousEmailRecipients(emailMirror.outcome),
          rawHeaders: request.request.rawHeaders,
          revokedCount: emailMirror.revokedCount,
        })
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employee was updated successfully',
        data: {
          employee: updateEmployee,
          emailMirror: toPublicEmailMirrorOutcome(emailMirror.outcome),
        },
      }
    } catch (error) {
      if (isEmailMirrorConflictError(error)) return respondEmailMirrorConflict(ctx, error)
      if (isEmailMirrorRefusedError(error)) return respondEmailMirrorRefused(ctx, error)
      if (isUserAccessEmailDuplicatedIndexError(error)) return respondUserAccessEmailDuplicated(ctx)
      if (error instanceof EmployeePositionLevelError) {
        const resolved = resolveEmployeePositionLevelApiError(error, error.httpStatus, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
        }
      }
      const workScheduleError = this.mapWorkScheduleErrorMessage(error?.message, i18n)
      if (workScheduleError) {
        response.status(400)
        return workScheduleError
      }
      if (error?.code === 'E_VALIDATION_ERROR') {
        // Regla 8 (USRH1788466831270): un dato mal formado es un rechazo por
        // datos, no un error del servidor. Con 500 el BO abre la pantalla de
        // error general y el usuario pierde lo capturado.
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t('validation_error'),
          message: error.messages?.[0]?.message ?? i18n.t('validation_error'),
          errors: error.messages,
        }
      }
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
   * /api/employees/{employeeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: delete employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - employeeTerminatedDate
   *               - employeeTerminationModality
   *               - employeeTerminationType
   *             properties:
   *               employeeTerminatedDate:
   *                 type: string
   *                 format: date
   *                 description: Fecha de baja (YYYY-MM-DD)
   *               employeeTerminationModality:
   *                 type: string
   *                 description: Modalidad de baja (catálogo GET /api/employees/termination-catalog)
   *               employeeTerminationType:
   *                 type: string
   *                 description: Tipo de baja coherente con la modalidad
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
  async delete({ auth, request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      let employeeTerminatedDate = request.input('employeeTerminatedDate')
      employeeTerminatedDate = employeeTerminatedDate
        ? (String(employeeTerminatedDate).split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const modality = this.normalizeTerminationInput(request.input('employeeTerminationModality'))
      const terminationType = this.normalizeTerminationInput(request.input('employeeTerminationType'))

      if (!employeeTerminatedDate || !modality || !terminationType) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Datos incompletos para la baja',
          message:
            'Para dar de baja al empleado debe enviarse la fecha de baja, la modalidad de baja y el tipo de baja.',
          data: {
            employeeId,
            employeeTerminatedDate,
            employeeTerminationModality: modality,
            employeeTerminationType: terminationType,
          },
        }
      }

      const catalogError = this.validateTerminationCatalogOrError(modality, terminationType)
      if (catalogError) {
        response.status(400)
        return {
          type: 'warning',
          title: catalogError.title,
          message: catalogError.message,
          data: catalogError.data,
        }
      }

      const currentEmployee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', employeeId)
        .first()
      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const deleteEmployee = await employeeService.delete(
        currentEmployee,
        {
          employeeTerminatedDate,
          employeeTerminationModality: modality,
          employeeTerminationType: terminationType,
        },
        // Quién dio la baja: queda en el historial de la revocación en checadores.
        auth.user?.userId ?? null
      )
      if (deleteEmployee) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was deleted successfully',
          data: { employee: deleteEmployee },
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
   * /api/employees/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get employee by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async show(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const allowed = await ensureEmployeeTabRead(
        ctx,
        Number(employeeId),
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployee
      )
      if (!allowed) {
        return
      }
      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)
      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was found successfully',
          data: { employee: showEmployee },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-by-slug/{employeeSlug}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get employee by opaque slug
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeSlug
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Employee opaque token
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '400':
   *         description: The slug was not provided
   *       '404':
   *         description: The employee was not found
   *       '500':
   *         description: Unexpected server error
   */
  /**
   * Canjea el token opaco de la URL del Backoffice por el empleado.
   *
   * Espeja a `getById`: mismo filtro por usuario responsable y mismo gate, que
   * se resuelve aquí adentro con `ensureEmployeeTabRead` porque necesita el id
   * ya resuelto para saber qué pestañas puede leer quien pregunta. El alcance
   * por empresa lo ponen `auth()` y `businessScope()` del prefijo — el token no
   * es el control de acceso, solo evita que el nombre y el código de nómina
   * viajen en la URL.
   */
  async getBySlug(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }

      const employeeSlug = request.param('employeeSlug')
      if (!employeeSlug) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee slug was not found',
          data: { employeeSlug },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.getBySlug(employeeSlug, userResponsibleId)
      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered slug',
          data: { employeeSlug },
        }
      }

      const allowed = await ensureEmployeeTabRead(
        ctx,
        showEmployee.employeeId,
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeById
      )
      if (!allowed) {
        return
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employee was found successfully',
        data: { employee: showEmployee },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-by-id/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get employee by Id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: Employee Identifier
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
  async getById(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const employeeCode = request.param('employeeId')
      if (!employeeCode) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee code was not found',
          data: { employeeCode },
        }
      }
      const allowed = await ensureEmployeeTabRead(
        ctx,
        Number(employeeCode),
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeById
      )
      if (!allowed) {
        return
      }
      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.getById(employeeCode, userResponsibleId)
      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered code',
          data: { employeeCode },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was found successfully',
          data: { employee: showEmployee },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/without-user:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
  async indexWithOutUser({ request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        page: page,
        limit: limit,
        branchNameIds: branchNameIds,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.indexWithOutUser(filters, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
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

  /**
   * @swagger
   * /api/employees/{employeeId}/photo:
   *   put:
   *     summary: Upload a photo for an employee
   *     tags:
   *       - Employees
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the employee
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: The photo file to upload
   *     responses:
   *       200:
   *         description: Photo uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 url:
   *                   type: string
   *                   description: URL of the uploaded photo
   *       400:
   *         description: Bad Request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   description: Error message
   *       500:
   *         description: Internal Server Error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   description: Error message
   *                 error:
   *                   type: object
   *                   description: Error details
   */
  @inject()
  async uploadPhoto(
    { request, response, i18n }: HttpContext,
    uploadService: UploadService
  ) {
    const employeeService = new EmployeeService(i18n)

    const validationOptions = {
      types: ['image'],
      size: '5mb',
    }
    const employeeId = request.param('employeeId')
    const photo = request.file('photo', validationOptions)
    // validate file required
    if (!photo) {
      return response.status(400).send({ message: 'Please upload a photo' })
    }

    const currentEmployee = await Employee.query().where('employee_id', employeeId).first()
    if (!currentEmployee) {
      return response.status(404).send({ message: 'Employee not found' })
    }
    // get file name and extensión

    // get employee and update employee photo
    try {
      const photoUrl = await uploadService.fileUpload(photo, 'profile-photo', 'employees')

      // `fileUpload` devuelve un centinela cuando el almacenamiento falla.
      // Guardarlo dejaba en la base una referencia que no apunta a nada y que
      // revienta al leerla: es lo que dejo al empleado 4282 sin foto legible.
      if (isUploadFailureSentinel(photoUrl)) {
        response.status(500)
        return {
          type: 'error',
          title: 'Foto no guardada',
          detail: 'No fue posible almacenar la foto. Intenta de nuevo.',
          key: 'foto-no-almacenada',
        }
      }

      if (currentEmployee.employeePhoto) {
        await uploadService.deleteFile(currentEmployee.employeePhoto)
      }
      const employee = await employeeService.updateEmployeePhotoUrl(employeeId, photoUrl)
      return response.status(200).send({ url: photoUrl, employee })
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      return response.status(500).send({ message: 'Error uploading file', error })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/photo:
   *   delete:
   *     summary: Delete a photo for an employee
   *     tags:
   *       - Employees
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the employee
   *     responses:
   *       200:
   *         description: Photo deleted successfully
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
   *                   description: Employee data
   *       400:
   *         description: Bad Request - No photo to delete
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *       404:
   *         description: Employee not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *       500:
   *         description: Internal Server Error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 error:
   *                   type: object
   *                   description: Error details
   */
  @inject()
  async deletePhoto(
    { request, response, i18n }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const result = await employeeService.deleteEmployeePhoto(employeeId, uploadService)

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-work-schedules:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all work schedules
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
  async getWorkSchedules({ response, i18n }: HttpContext) {
    try {
      const employeeService = new EmployeeService(i18n)
      const employeeWorkSchedules = await employeeService.getWorkSchedules()
      response.status(200)
      return {
        type: 'success',
        title: 'Employee work schedules',
        message: 'The employee work schedules were found successfully',
        data: {
          employeeWorkSchedules,
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

  /**
   * @swagger
   * /api/employees/termination-catalog:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Catálogo de modalidades y tipos de baja laboral
   *     produces:
   *       - application/json
   *     responses:
   *       '200':
   *         description: Catálogo obtenido correctamente
   */
  async getTerminationCatalog({ response }: HttpContext) {
    response.status(200)
    return {
      type: 'success',
      title: 'Catálogo de baja',
      message: 'Modalidades y tipos de baja obtenidos correctamente',
      data: {
        modalities: [...EMPLOYEE_TERMINATION_MODALITIES],
        types: EMPLOYEE_TERMINATION_TYPES,
      },
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/proceeding-files:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get proceeding files by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async getProceedingFiles({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const fileType = Number.parseInt(request.input('type'))

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const proceedingFiles = await employeeService.getProceedingFiles(employeeId, fileType)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The proceeding files were found successfully',
        data: { data: proceedingFiles },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-vacations-used:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get vacations used in current period by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async getVacationsUsed({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const vacations = await employeeService.getVacationsUsed(employee)
      if (vacations.status === 200) {
        response.status(vacations.status)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The vacations used were found successfully',
          data: { vacations: vacations.data },
        }
      } else {
        response.status(vacations.status)
        return {
          type: vacations.type,
          title: vacations.title,
          message: vacations.message,
          data: { vacations: 0 },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-vacations-corresponding:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get vacations corresponding in current period by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async getVacationsCorresponding({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const vacations = await employeeService.getDaysVacationsCorresponing(employee)
      if (vacations.status === 200) {
        response.status(vacations.status)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The vacations corresponding were found successfully',
          data: { vacations: vacations.data },
        }
      } else {
        response.status(vacations.status)
        return {
          type: vacations.type,
          title: vacations.title,
          message: vacations.message,
          data: { vacations: 0 },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-years-worked:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get years workedin by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: year
   *         in: query
   *         required: false
   *         description: Year
   *         schema:
   *           type: integer
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
  async getYearsWorked({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const year = request.input('year')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const yearsWorked = await employeeService.getYearsWorked(employee, year)
      if (yearsWorked.status === 200) {
        response.status(yearsWorked.status)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The years worked were found successfully',
          data: { yearsWorked: yearsWorked.data },
        }
      } else {
        response.status(yearsWorked.status)
        return {
          type: yearsWorked.type,
          title: yearsWorked.title,
          message: yearsWorked.message,
          data: { yearsWorked: 0 },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-vacations-by-period:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get years workedin by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: vacationSettingId
   *         in: query
   *         required: true
   *         description: Vacation Setting Id
   *         schema:
   *           type: integer
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
  async getVacationsByPeriod({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const vacationSettingId = request.input('vacationSettingId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      if (!vacationSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The vacation setting id was not found',
          data: { vacationSettingId },
        }
      }
      const employeeType = await EmployeeType.query()
        .whereNull('employee_type_deleted_at')
        .where('employee_type_id', employee.employeeTypeId)
        .first()
      let employeeIsCrew = false
      if (employeeType) {
        if (
          employeeType.employeeTypeSlug === 'pilot' ||
          employeeType.employeeTypeSlug === 'flight-attendant'
        ) {
          employeeIsCrew = true
        }
      }
      const vacationSetting = await VacationSetting.query()
        .where('vacation_setting_id', vacationSettingId)
        .whereNull('vacation_setting_deleted_at')
        .if(employeeIsCrew, (query) => {
          query.where('vacation_setting_crew', 1)
        })
      if (!vacationSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The vacation setting was not found',
          message: 'The vacation setting was not found with the entered ID',
          data: { vacationSettingId },
        }
      }
      const vacations = await employeeService.getVacationsByPeriod(
        employee.employeeId,
        vacationSettingId
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The vacations were found successfully',
        data: { vacations: vacations },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/employee-generate-excel:
   *   get:
   *     tags:
   *       - Employees
   *     summary: Generate an Excel report of employees
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         description: Business Unit Id
   *         schema:
   *           type: integer
   *       - in: query
   *         name: departmentId
   *         schema:
   *           type: integer
   *         description: ID of the department to filter
   *       - in: query
   *         name: positionId
   *         schema:
   *           type: integer
   *         description: ID of the position to filter
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: ID of the employee to filter
   *       - name: workSchedule
   *         in: query
   *         required: false
   *         description: Employee work schedule
   *         schema:
   *           type: string
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: employeeTypeId
   *         in: query
   *         required: false
   *         description: Employee Type Id
   *         schema:
   *           type: integer
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for filtering
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for filtering
   *     responses:
   *       200:
   *         description: Excel file generated successfully
   *       404:
   *         description: No employees found
   *       500:
   *         description: Error generating Excel file
   */
  async getExcel(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const search = request.qs().search
      const departmentId = this.parseIdOrIds(request.qs().departmentId)
      const positionId = this.parseIdOrIds(request.qs().positionId)
      const employeeId = request.qs().employeeId
      const filterStartDate = request.qs().startDate
      const filterEndDate = request.qs().endDate
      const employeeTypeId = request.qs().employeeTypeId
      const workSchedule = request.qs().workSchedule
      const onlyInactive = request.qs().onlyInactive
      if (isTerminatedEmployeesFilterRequested(onlyInactive)) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const businessUnitId = request.qs().businessUnitId

      let queryEmployees = Employee.query()
        .if(search, (query) => {
          query.where((subQuery) => {
            subQuery
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_code) = ?', [`${search.toUpperCase()}`])
            // PUNTO DE REINTRODUCCIÓN 08-10-04-01: búsqueda por rfc/curp/nss cifrados
          })
        })
        .if(workSchedule, (query) => {
          query.where((subQuery) => {
            subQuery.whereRaw('UPPER(employee_work_schedule) LIKE ?', [
              `%${workSchedule.toUpperCase()}%`,
            ])
          })
        })
        .if(employeeId, (query) => {
          query.where('employee_id', employeeId)
        })
        .if(departmentId, (query) => {
          if (Array.isArray(departmentId)) {
            query.whereIn('department_id', departmentId)
          } else {
            query.where('department_id', departmentId!)
          }
        })
        .if(positionId, (query) => {
          if (Array.isArray(positionId)) {
            query.whereIn('position_id', positionId)
          } else {
            query.where('position_id', positionId!)
          }
        })
        .if(isTerminatedEmployeesFilterRequested(onlyInactive), (query) => {
          query.whereNotNull('employee_deleted_at')
          query.withTrashed()
        })
        .if(employeeTypeId, (query) => {
          query.where('employee_type_id', employeeTypeId ? employeeTypeId : 0)
        })

      if (filterStartDate && filterEndDate) {
        const startDate = DateTime.fromISO(filterStartDate)
        const endDate = DateTime.fromISO(filterEndDate)
        const startDateSQL = startDate?.toSQLDate()
        const endDateSQL = endDate?.toSQLDate()

        if (startDateSQL && endDateSQL) {
          queryEmployees = queryEmployees.whereBetween('employeeHireDate', [
            startDateSQL,
            endDateSQL,
          ])
        }
      }
      const employees = await queryEmployees
        .where('businessUnitId', businessUnitId)
        .if(userResponsibleId &&
          typeof userResponsibleId && userResponsibleId > 0,
          (query) => {
            query.where((subQuery) => {
              subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
                userResponsibleEmployeeQuery.where('userId', userResponsibleId!)
              })
              subQuery.orWhereHas('person', (personQuery) => {
                personQuery.whereHas('user', (userQuery) => {
                  userQuery.where('userId', userResponsibleId!)
                })
              })
            })
          }
        )
        .preload('department')
        .preload('position')
        .preload('person')
        .exec()
      if (employees.length === 0) {
        return response.status(404).send({
          message: 'No employees found',
        })
      }

      const piiExportService = new PiiExportService()
      const exportDef = SENSITIVE_EXPORT_INVENTORY.find((item) => item.exportKey === 'employees-list-xlsx')!
      const buId = Number(businessUnitId)

      const buffer = await piiExportService.deliverSensitiveExport(
        ctx,
        {
          exportKey: exportDef.exportKey,
          sensitiveColumns: [...exportDef.sensitiveColumns],
          employeeIds: employees.map((employee) => employee.employeeId),
          filters: { ...request.qs() },
          businessUnitId: piiExportService.resolveAuditBusinessUnitId(businessUnitScope ?? [], buId),
          originModule: 'employees',
        },
        async (maskSensitive) => {
          const workbook = this.buildEmployeesListWorkbook(employees, maskSensitive)
          blankMissingTexts(workbook)
          return workbook.xlsx.writeBuffer()
        }
      )

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        contentDisposition(buildDownloadFileName(['empleados', formatDownloadFileDate()], 'xlsx'))
      )
      response.status(201).send(buffer)
    } catch (error) {
      const auditError = PiiExportService.formatAuditError(error, i18n)
      if (auditError) {
        return response.status(auditError.status).json(auditError.body)
      }
      response.status(500).send({
        message: 'Error generating Excel file',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/template-excel:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Generar plantilla de Excel para importación masiva de empleados
   *     description: Genera un archivo Excel con los encabezados necesarios y dropdowns para facilitar la importación masiva de empleados
   *     produces:
   *       - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   *     parameters:
   *       - in: query
   *         name: fillWithExisting
   *         required: false
   *         schema:
   *           type: boolean
   *         description: Si es true, la plantilla se llena con los empleados existentes (aplicando filtros si se envían).
   *       - in: query
   *         name: departmentId
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filtro opcional; solo empleados de este departamento (cuando fillWithExisting es true).
   *       - in: query
   *         name: positionId
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filtro opcional; solo empleados con esta posición (requiere departmentId; cuando fillWithExisting es true).
   *       - in: query
   *         name: businessUnitId
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filtro opcional; solo empleados de esta unidad de negocio de trabajo (cuando fillWithExisting es true).
   *       - in: query
   *         name: payrollBusinessUnitId
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filtro opcional; solo empleados de esta unidad de negocio de nómina (cuando fillWithExisting es true).
   *       - in: query
   *         name: branchNameIds
   *         required: false
   *         schema:
   *           type: string
   *         description: IDs de sucursal separados por comas (ej. 2,3,4). Solo empleados con asignación activa a alguna. Solo aplica cuando fillWithExisting es true.
   *       - in: query
   *         name: orderBy
   *         required: false
   *         schema:
   *           type: string
   *           enum: [number, name]
   *         description: Orden de filas en el Excel (solo con fillWithExisting). `number` = identificador de nómina; `name` = nombre completo. Si no se envía, por ID de empleado.
   *       - in: query
   *         name: orderDirection
   *         required: false
   *         schema:
   *           type: string
   *         description: Dirección del orden (asc, desc, descendente, etc.). Mismo criterio que el listado GET /api/employees.
   *     responses:
   *       200:
   *         description: Plantilla de Excel generada exitosamente
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       500:
   *         description: Error al generar la plantilla
   */
  async getTemplateExcel(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      const fillWithExisting = request.input('fillWithExisting') === true ||
        request.input('fillWithExisting') === '1' ||
        request.input('fillWithExisting') === 'true'

      const departmentIdParam = request.input('departmentId')
      const positionIdParam = request.input('positionId')
      const businessUnitIdParam = request.input('businessUnitId')
      const payrollBusinessUnitIdParam = request.input('payrollBusinessUnitId')
      const departmentId = departmentIdParam !== undefined && departmentIdParam !== '' ? Number(departmentIdParam) : undefined
      const positionId = positionIdParam !== undefined && positionIdParam !== '' ? Number(positionIdParam) : undefined
      const businessUnitId = businessUnitIdParam !== undefined && businessUnitIdParam !== '' ? Number(businessUnitIdParam) : undefined
      const payrollBusinessUnitId = payrollBusinessUnitIdParam !== undefined && payrollBusinessUnitIdParam !== '' ? Number(payrollBusinessUnitIdParam) : undefined

      if (positionId !== undefined && !Number.isNaN(positionId)) {
        if (departmentId === undefined || Number.isNaN(departmentId)) {
          response.status(400)
          return {
            type: 'error',
            title: 'Validación',
            message: 'Si se envía posición (positionId) debe enviarse también un departamento válido (departmentId) al que pertenezca esa posición.',
          }
        }
        const positionInDepartment = await DepartmentPosition.query()
          .where('departmentId', departmentId)
          .where('positionId', positionId)
          .whereNull('deletedAt')
          .first()
        if (!positionInDepartment) {
          response.status(400)
          return {
            type: 'error',
            title: 'Validación',
            message: 'La posición indicada no pertenece al departamento indicado. Envíe un departmentId y positionId válidos (la posición debe estar asignada a ese departamento).',
          }
        }
      }

      const employeeService = new EmployeeService(i18n)
      const orderByRaw = request.input('orderBy')
      const orderBy =
        orderByRaw === 'number' || orderByRaw === 'name' ? orderByRaw : undefined
      const orderDirection = request.input('orderDirection')
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))

      const templateOptions = {
        fillWithExisting,
        departmentId: departmentId !== undefined && !Number.isNaN(departmentId) ? departmentId : undefined,
        positionId: positionId !== undefined && !Number.isNaN(positionId) ? positionId : undefined,
        businessUnitId: businessUnitId !== undefined && !Number.isNaN(businessUnitId) ? businessUnitId : undefined,
        payrollBusinessUnitId: payrollBusinessUnitId !== undefined && !Number.isNaN(payrollBusinessUnitId) ? payrollBusinessUnitId : undefined,
        branchNameIds,
        orderBy,
        orderDirection: orderDirection !== undefined && orderDirection !== '' ? String(orderDirection) : undefined,
        allowedBusinessUnitIds: businessUnitScope,
      }

      let buffer: Buffer | ArrayBuffer

      if (fillWithExisting) {
        const piiExportService = new PiiExportService()
        const exportDef = SENSITIVE_EXPORT_INVENTORY.find(
          (item) => item.exportKey === 'employees-import-template-xlsx'
        )!
        const employeeIds = await employeeService.listImportTemplateEmployeeIds(templateOptions)

        buffer = await piiExportService.deliverSensitiveExport(
          ctx,
          {
            exportKey: exportDef.exportKey,
            sensitiveColumns: [...exportDef.sensitiveColumns],
            employeeIds,
            filters: { ...request.qs(), ...request.all() },
            businessUnitId: piiExportService.resolveAuditBusinessUnitId(
              businessUnitScope ?? [],
              templateOptions.businessUnitId
            ),
            originModule: 'employees',
          },
          async (maskSensitive) =>
            employeeService.generateEmployeeImportTemplate({
              ...templateOptions,
              maskSensitive,
            })
        )
      } else {
        buffer = await employeeService.generateEmployeeImportTemplate(templateOptions)
      }

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      const filename = buildDownloadFileName(
        ['plantilla-importacion-empleados', fillWithExisting ? 'con-datos' : null],
        'xlsx'
      )
      response.header('Content-Disposition', contentDisposition(filename))
      response.status(200)
      response.send(buffer)
    } catch (error: any) {
      const auditError = PiiExportService.formatAuditError(error, i18n)
      if (auditError) {
        return response.status(auditError.status).json(auditError.body)
      }
      response.status(500)
      return {
        type: 'error',
        title: 'Error',
        message: 'Error al generar la plantilla de Excel',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/reactivate:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: reactivate employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async reactivate({ request, response }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { ...request.all() },
        }
      }
      const currentEmployee = await Employee.query()
        .whereNotNull('employee_deleted_at')
        .where('employee_id', employeeId)
        .withTrashed()
        .first()
      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      currentEmployee.deletedAt = null
      await currentEmployee.save()
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employee was reactivate successfully',
        data: { employee: currentEmployee },
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
   * /api/employees/{employeeId}/export-excel:
   *   get:
   *     summary: Export shift exceptions of an employee to Excel
   *     description: Generates an Excel file containing shift exceptions for a specific employee, filtered by hire date and current date. Excludes exceptions of type "Día de descanso".
   *     tags:
   *       - Employees
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the employee
   *     responses:
   *       201:
   *         description: Excel file generated successfully
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       500:
   *         description: Error generating Excel file
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 error:
   *                   type: string
   */
  async exportShiftExceptionsToExcel({ params, response }: HttpContext) {
    try {
      const employeeId = params.employeeId

      const employee = await Employee.query()
        .where('employeeId', employeeId)
        .preload('person')
        .preload('department')
        .preload('position')
        .preload('shift_exceptions', (shiftExceptionsQuery) => {
          shiftExceptionsQuery.whereNull('shift_exceptions_deleted_at')
        })
        .firstOrFail()

      if (!employee.employeeHireDate) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee hire date was not found',
          data: { employee },
        }
      }

      const hireDate =
        employee.employeeHireDate instanceof DateTime
          ? employee.employeeHireDate.toJSDate()
          : new Date(employee.employeeHireDate)
      const currentDate = DateTime.now().toJSDate()

      const shiftExceptions = await ShiftException.query()
        .where('employeeId', employeeId)
        .whereBetween('shiftExceptionsDate', [hireDate, currentDate])
        .whereNot('exception_type_id', 9)
        .preload('exceptionType')
      // Obtener los turnos asignados al empleado durante el periodo
      const employeeShifts = await EmployeeShift.query()
        .where('employeeId', employeeId)
        .whereNull('deletedAt') // Excluir registros eliminados
        // Sin cota inferior: el turno vigente al contratar pudo asignarse antes.
        .where('employeShiftsApplySince', '<=', currentDate)
        .preload('shift')

      // Crear un mapa de fechas y turnos para facilitar la asociación
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Excepciones de turno')

      // Formato neutral: sin logo ni franjas de marca; título en la fila 1 y
      // periodo en la fila 2, ambos sin relleno y con texto negro/gris.
      const titleRow = worksheet.addRow(['Excepciones de turno del empleado'])
      titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells(`A${titleRow.number}:G${titleRow.number}`)

      const periodRow = worksheet.addRow([
        `Del ${formatReportCalendarDate(employee.employeeHireDate)} al ${DateTime.now().setZone(getBusinessTimeZone()).toFormat(REPORT_DATE_FORMAT)}`,
      ])
      periodRow.font = { italic: true, size: 12, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
      worksheet.mergeCells(`A${periodRow.number}:G${periodRow.number}`)
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      const headerRow = worksheet.addRow([
        'Código de empleado',
        'Nombre del empleado',
        'Departamento',
        'Puesto',
        'Fecha',
        'Turno asignado',
        'Notas de la excepción',
      ])
      headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      worksheet.columns = [
        { key: 'employeeCode', width: 20 },
        { key: 'employeeName', width: 30 },
        { key: 'department', width: 30 },
        { key: 'position', width: 30 },
        { key: 'date', width: 20 },
        { key: 'shiftAssigned', width: 35 },
        { key: 'exceptionNotes', width: 30 },
      ]
      worksheet.columns.forEach((col) => {
        col.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      const employeeName = reportFullName(
        employee.person?.personFirstname,
        employee.person?.personLastname,
        employee.person?.personSecondLastname
      )
      shiftExceptions.forEach((exception) => {
        // "Sin turno" es un estado real (ese día no había turno asignado), no
        // un dato ausente: por eso se conserva y no se deja en blanco.
        const shiftName = this.resolveVigentShiftName(employeeShifts, exception.shiftExceptionsDate)
        const exceptionTypeName = reportText(exception.exceptionType?.exceptionTypeTypeName)
        const description = reportText(exception.shiftExceptionsDescription)

        const row = worksheet.addRow({
          employeeCode: employee.employeeCode,
          employeeName,
          department: reportText(employee.department?.departmentName),
          position: reportText(employee.position?.positionName),
          date: formatReportCalendarDate(exception.shiftExceptionsDate),
          shiftAssigned: shiftName ?? 'Sin turno',
          exceptionNotes: description,
        })
        if (exceptionTypeName) {
          row.getCell('exceptionNotes').value = {
            richText: [
              { text: exceptionTypeName + ': ', font: { bold: true } },
              { text: description },
            ],
          }
        }
      })

      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        contentDisposition(buildDownloadFileName(['excepciones-turno', employee.employeeSlug], 'xlsx'))

      )
      response.status(201).send(buffer)
    } catch (error) {
      response.status(500).send({
        message: 'Error generating Excel file',
        error: error.message,
      })
    }
  }

  /**
   * Nombre del turno vigente en una fecha: la asignación con el mayor
   * `applySince` anterior o igual a esa fecha (a igual fecha, la creada al
   * final). Fechas comparadas como día civil (`toCalendarIsoDate`), igual que
   * el resto de la vigencia de turnos. `null` si ese día no había turno.
   */
  resolveVigentShiftName(
    employeeShifts: Array<
      Pick<EmployeeShift, 'employeShiftsApplySince'> & {
        employeShiftsCreatedAt?: DateTime | null
        shift?: { shiftName?: string | null } | null
      }
    >,
    date: Date | string
  ): string | null {
    const day = toCalendarIsoDate(date)
    if (!day) return null
    let vigent: (typeof employeeShifts)[number] | null = null
    let vigentSince = ''
    for (const assignment of employeeShifts) {
      const since = toCalendarIsoDate(assignment.employeShiftsApplySince)
      if (!since || since > day) continue
      const newer =
        since > vigentSince ||
        (since === vigentSince &&
          (assignment.employeShiftsCreatedAt?.toMillis() ?? 0) >
          (vigent?.employeShiftsCreatedAt?.toMillis() ?? 0))
      if (newer) {
        vigent = assignment
        vigentSince = since
      }
    }
    const name = reportText(vigent?.shift?.shiftName)
    return name || null
  }


  /**
   * Libro del reporte de empleados: título, separador, encabezado y una fila
   * por empleado en una sola pasada. Departamento y puesto llegan precargados
   * en la consulta; aquí no se consulta la base por fila.
   */
  buildEmployeesListWorkbook(
    employees: EmployeesListReportEmployee[],
    maskSensitive = false
  ): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Reporte de empleados')

    // Formato neutral: sin logo ni franjas de marca. El título ocupa la
    // fila 1 y la fila 2 queda como separador antes del encabezado.
    const titleRow = worksheet.addRow(['Reporte de empleados'])
    titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    titleRow.height = 42
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells(`A${titleRow.number}:K${titleRow.number}`)
    const spacerRow = worksheet.addRow([''])
    worksheet.mergeCells(`A${spacerRow.number}:K${spacerRow.number}`)
    this.addHeadRow(worksheet, employees, maskSensitive)
    return workbook
  }

  // Método para agregar fila de encabezado
  addHeadRow(
    worksheet: ExcelJS.Worksheet,
    employees: EmployeesListReportEmployee[],
    maskSensitive = false
  ) {
    const headerRow = worksheet.addRow([
      'Código de empleado',
      'Nombre del empleado',
      'Departamento',
      'Puesto',
      'Fecha de ingreso',
      'Modalidad de trabajo',
      'Teléfono',
      'Género',
      'CURP',
      'RFC',
      'NSS',
    ])

    // Encabezado neutral: gris claro con texto negro. Se toma la fila real
    // del encabezado en vez de una posición fija.
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    })

    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }

    this.adjustColumnWidths(worksheet)
    // Fija título, separador y encabezado de columnas
    worksheet.views = frozenHeaderViews(headerRow.number)
    employees.forEach((employee) => {
      const masked = SENSITIVE_EXPORT_PLACEHOLDER
      const phone = maskSensitive ? masked : employee.person?.personPhone || ''
      const curp = maskSensitive ? masked : employee.person?.personCurp || ''
      const rfc = maskSensitive ? masked : employee.person?.personRfc || ''
      const nss = maskSensitive ? masked : employee.person?.personImssNss || ''

      worksheet.addRow([
        employee.employeeCode,
        reportFullName(
          employee.person?.personFirstname,
          employee.person?.personLastname,
          employee.person?.personSecondLastname
        ),
        reportText(employee.department?.departmentName),
        reportText(employee.position?.positionName),
        formatReportCalendarDate(employee.employeeHireDate),
        EMPLOYEE_WORK_SCHEDULE_REPORT_LABEL[employee.employeeWorkSchedule as EmployeeWorkSchedule] ??
        employee.employeeWorkSchedule ??
        '',
        phone,
        reportText(employee.person?.personGender),
        curp,
        rfc,
        nss,
      ])
    })
  }

  adjustColumnWidths(worksheet: ExcelJS.Worksheet) {
    const widths = [20, 44, 44, 44, 25, 25, 25, 25, 25, 25, 25, 25, 30, 30, 30]
    widths.forEach((width, index) => {
      const column = worksheet.getColumn(index + 1)
      column.width = width
      column.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/contracts:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get contracts by employee id
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
  async getContracts({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const contracts = await employeeService.getContracts(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The contracts were found successfully',
        data: { data: contracts },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/banks:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get banks by employee id
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
  async getBanks({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const banks = await employeeService.getBanks(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The banks were found successfully',
        data: { data: banks },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
    * @swagger
    * /api/employees/{employeeId}/banks:
    *   get:
    *     security:
    *       - bearerAuth: []
    *     tags:
    *       - Employees
    *     summary: get banks by employee id
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
  async getZones({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const zones = await employeeService.getZones(employeeId)
      const coordinates = []
      for (const zone of zones) {
        // `zone.zone` puede llegar nulo desde que Zone está acotada por empresa:
        // una asignación cuya zona no pertenece al alcance activo (o sigue sin
        // empresa porque falta el backfill) no precarga la relación. Antes esto
        // reventaba el mapa del Monitor con un 500; ahora se omite la geocerca.
        if (!zone.zone?.zonePolygon) continue
        const polygon = JSON.parse(zone.zone.zonePolygon)
        coordinates.push(polygon.features[0].geometry.coordinates)
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The zones were found successfully',
        data: { data: zones, coordinates: coordinates },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-birthday:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all birthday
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: year
   *         in: query
   *         required: true
   *         description: Year
   *         schema:
   *           type: integer
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
  async getBirthday({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const year = request.input('year')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        year: year,
        userResponsibleId: userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getBirthday(filters, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
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

  /**
   * @swagger
   * /api/employees/get-anniversary:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all anniversaries
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: year
   *         in: query
   *         required: true
   *         description: Year
   *         schema:
   *           type: integer
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
  async getAnniversary({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const year = request.input('year')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        year: year,
        userResponsibleId: userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getAnniversary(filters, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
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

  /**
   * @swagger
   * /api/employees/get-vacations:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all vacations
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: year
   *         in: query
   *         required: true
   *         description: Year
   *         schema:
   *           type: integer
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         description: Solo empleados de esta unidad de negocio de trabajo
   *         schema:
   *           type: integer
   *           example: 1
   *       - name: payrollBusinessUnitId
   *         in: query
   *         required: false
   *         description: Solo empleados con esta unidad de negocio de nómina
   *         schema:
   *           type: integer
   *           example: 12
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
  async getVacations({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const year = request.input('year')
      const businessUnitIdRaw = request.input('businessUnitId')
      const payrollBusinessUnitIdRaw = request.input('payrollBusinessUnitId')
      const businessUnitId =
        businessUnitIdRaw !== undefined && businessUnitIdRaw !== '' && !Number.isNaN(Number(businessUnitIdRaw)) && Number(businessUnitIdRaw) > 0
          ? Number(businessUnitIdRaw)
          : undefined
      const payrollBusinessUnitId =
        payrollBusinessUnitIdRaw !== undefined && payrollBusinessUnitIdRaw !== '' && !Number.isNaN(Number(payrollBusinessUnitIdRaw)) && Number(payrollBusinessUnitIdRaw) > 0
          ? Number(payrollBusinessUnitIdRaw)
          : undefined
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        year: year,
        userResponsibleId: userResponsibleId,
        businessUnitId,
        payrollBusinessUnitId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getVacations(filters, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees vacations were found successfully',
        data: {
          employees,
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

  /**
   * @swagger
   * /api/employees/get-all-vacations-by-period:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all vacations by period
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: dateStart
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for filtering
   *       - name: dateEnd
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for filtering
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
  async getAllVacationsByPeriod({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      // Alcance: regla 1, 2, 4 de USRH1788466831312.
      const scope = user
        ? (await user.preload('role'), await resolveEmployeeRoleScopeForUser(user, i18n))
        : emptyEmployeeRoleScope()
      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        dateStart: dateStart,
        dateEnd: dateEnd,
        userResponsibleId: scope.userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getAllVacationsByPeriod(filters, scope, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees vacations were found successfully',
        data: {
          employees,
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

  /**
   * @swagger
   * /api/employees/{employeeId}/get-days-work-disability:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get days work disability by employee id
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: datePay
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: Pay date for filtering
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
  async getDaysWorkDisability({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }
      const datePay = request.input('datePay')

      if (!datePay) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The date pay was not found',
          data: { datePay },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const assistService = new AssistsService(i18n)
      const days = await assistService.getDaysWorkDisability(showEmployee, datePay)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The days work disability were found successfully',
        data: { data: days },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-days-work-disability-all:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get days work disability all employees
   *     parameters:
   *       - name: datePay
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: Pay date for filtering
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: Department Id
   *         schema:
   *           type: integer
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Employee Id
   *         schema:
   *           type: integer
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
  async getDaysWorkDisabilityAll({ request, response, i18n }: HttpContext) {
    try {

      const datePay = request.input('datePay')

      if (!datePay) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The date pay was not found',
          data: { datePay },
        }
      }
      const departmentId = request.input('departmentId')
      const employeeId = request.input('employeeId')

      const assistService = new AssistsService(i18n)
      const filter = {
        datePay: datePay,
        departmentId: departmentId ? departmentId : 0,
        employeeId: employeeId ? employeeId : 0,
      } as EmployeeWorkDaysDisabilityFilterInterface

      const employees = await assistService.getDaysWorkDisabilityAll(filter)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees with days work disability were found successfully',
        data: { data: employees },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  // async odooAuth() {
  //   const url = 'https://servicios-aereos-estrella.odoo.com'
  //   const db = 'servicios-aereos-estrella'
  //   const username = 'wramirez@siler-mx.com'
  //   const password = 'RQU2tre-vag8qnk0czp'

  //   try {
  //     const response = await client.post(
  //       `${url}/web/session/authenticate`,
  //       {
  //         jsonrpc: '2.0',
  //         params: {
  //           db,
  //           login: username,
  //           password,
  //         },
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     if (response.data.result) {
  //       console.log('Autenticación exitosa')
  //       return true
  //     } else {
  //       console.error('Error en la autenticación:', response.data.error)
  //       return false
  //     }
  //   } catch (error) {
  //     console.error(`Error en la autenticación: ${error.message}`)
  //     return false
  //   }
  // }

  // async getOdooEmployees() {
  //   const authenticated = await this.odooAuth()

  //   if (authenticated) {
  //     try {
  //       const url = 'https://servicios-aereos-estrella.odoo.com'
  //       const response = await client.post(
  //         `${url}/web/dataset/call_kw`,
  //         {
  //           jsonrpc: '2.0',
  //           method: 'call',
  //           params: {
  //             model: 'hr.employee',
  //             method: 'search_read',
  //             args: [[]],
  //             kwargs: {},
  //           },
  //         },
  //         {
  //           withCredentials: true,
  //         }
  //       )

  //       return response.data.result
  //     } catch (error) {
  //       console.error(`Error al obtener empleados: ${error.message}`)
  //       if (error.response) {
  //         console.error('Detalles del error:', error.response.data)
  //       }
  //       return null
  //     } finally {
  //       // Cerrar sesión independientemente del resultado
  //       await this.closeOdooSession()
  //     }
  //   }
  //   return null
  // }

  // async closeOdooSession() {
  //   try {
  //     const url = 'https://servicios-aereos-estrella.odoo.com'
  //     const response = await client.post(
  //       `${url}/web/session/destroy`,
  //       {
  //         jsonrpc: '2.0',
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     console.log('Sesión cerrada correctamente')
  //     return true
  //   } catch (error) {
  //     console.error(`Error al cerrar sesión: ${error.message}`)
  //     return false
  //   }
  // }

  /**
   * Crea un nuevo empleado en Odoo sin usuario asociado
   * @param {Object} employeeData - Datos del empleado a crear
   * @param {string} employeeData.name - Nombre completo del empleado (obligatorio)
   * @param {Object} [employeeData.additionalFields] - Campos adicionales para el empleado
   * @returns {Promise<number|null>} - ID del empleado creado o null en caso de error
   */
  // async createOdooEmployee(employeeData) {
  //   const authenticated = await this.odooAuth()

  //   if (!authenticated) {
  //     console.error('No se pudo autenticar para crear el empleado')
  //     return null
  //   }

  //   try {
  //     const url = 'https://servicios-aereos-estrella.odoo.com'

  //     // Validar que se proporcionó un nombre
  //     if (!employeeData.name) {
  //       throw new Error('El nombre del empleado es obligatorio')
  //     }

  //     // Preparar los datos del empleado
  //     const employeeVals = {
  //       name: employeeData.name,
  //     }

  //     // Añadir campos adicionales si se proporcionan
  //     if (employeeData.additionalFields) {
  //       Object.assign(employeeVals, employeeData.additionalFields)
  //     }

  //     // Crear el empleado
  //     const response = await client.post(
  //       `${url}/web/dataset/call_kw`,
  //       {
  //         jsonrpc: '2.0',
  //         method: 'call',
  //         params: {
  //           model: 'hr.employee',
  //           method: 'create',
  //           args: [employeeVals],
  //           kwargs: {},
  //         },
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     const employeeId = response.data.result
  //     console.log(`Empleado creado exitosamente con ID: ${employeeId}`)
  //     return employeeId
  //   } catch (error) {
  //     console.error(`Error al crear empleado: ${error.message}`)
  //     if (error.response && error.response.data) {
  //       console.error('Detalles del error:', error.response.data)
  //     }
  //     return null
  //   } finally {
  //     // Cerrar sesión después de la operación
  //     await this.closeOdooSession()
  //   }
  // }

  // async createNewOdooEmployee() {
  //   try {
  //     // Crear un empleado sin usuario vinculado
  //     const empleadoId = await this.createOdooEmployee({
  //       name: 'Empleado de Prueba',
  //       additionalFields: {
  //         // department_id: 1, // ID del departamento
  //         // job_id: 2, // ID del puesto de trabajo
  //         work_phone: '5551234567',
  //         work_email: 'carlos.rodriguez@ejemplo.com',
  //         // work_location_id: 1, // ID de la ubicación de trabajo
  //         mobile_phone: '5559876543',
  //         // coach_id: 5, // ID del supervisor
  //         // Otros campos según necesites
  //       },
  //     })

  //     return empleadoId
  //   } catch (error) {
  //     console.error('Error en el proceso:', error);
  //   }
  // }

  // async getOdooGroups() {
  //   const authenticated = await this.odooAuth()

  //   if (!authenticated) {
  //     console.error('No se pudo autenticar para obtener los grupos')
  //     return null
  //   }

  //   try {
  //     const url = 'https://servicios-aereos-estrella.odoo.com'

  //     // Buscar grupos de seguridad
  //     const response = await client.post(
  //       `${url}/web/dataset/call_kw`,
  //       {
  //         jsonrpc: '2.0',
  //         method: 'call',
  //         params: {
  //           model: 'res.groups',
  //           method: 'search_read',
  //           args: [[]],
  //           kwargs: {
  //             fields: ['id', 'name', 'category_id', 'comment'],
  //             order: 'category_id, name',
  //           },
  //         },
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     console.log('Grupos obtenidos exitosamente')
  //     const groups = response.data.result

  //     if (groups && groups.length > 0) {
  //       console.log('groups de seguridad disponibles:')

  //       // Organizar por categoría
  //       const groupsByCategory = {}

  //       groups.forEach((group) => {
  //         const categoryName = group.category_id ? group.category_id[1] : 'Sin categoría'

  //         if (!groupsByCategory[categoryName]) {
  //           groupsByCategory[categoryName] = []
  //         }

  //         groupsByCategory[categoryName].push({
  //           id: group.id,
  //           name: group.name,
  //           description: group.comment || 'Sin descripción',
  //         })
  //       })

  //       // Mostrar groups organizados por categoría
  //       for (const category in groupsByCategory) {
  //         console.log(`\n--- ${category} ---`)
  //         groupsByCategory[category].forEach((group) => {
  //           console.log(`ID: ${group.id}, Nombre: ${group.name}`)
  //         })
  //       }

  //       // Buscar específicamente el grupo "Empleado"
  //       const grupoEmpleado = groups.find(
  //         (g) => g.name.toLowerCase() === 'employee' || g.name.toLowerCase() === 'empleado'
  //       )

  //       if (grupoEmpleado) {
  //         console.log(`\nEl grupo "Empleado" tiene el ID: ${grupoEmpleado.id}`)
  //         return grupoEmpleado
  //       } else {
  //         console.log('\nNo se encontró un grupo con el nombre exacto "Empleado"')
  //       }
  //     } else {
  //       console.log('No se pudieron obtener los groups o la lista está vacía')
  //     }
  //   } catch (error) {
  //     console.error(`Error al obtener groups: ${error.message}`)
  //     if (error.response && error.response.data) {
  //       console.error('Detalles del error:', error.response.data)
  //     }
  //     return null
  //   } finally {
  //     // Cerrar sesión después de la operación
  //     await this.closeOdooSession()
  //   }
  // }


  /**
   * @swagger
   * /api/employees/{employeeId}/user-responsibles/{userId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get user responsibles by employee id
   *     parameters:
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: ID of the employee to filter
   *       - in: query
   *         required: false
   *         name: userId
   *         schema:
   *           type: integer
   *         description: ID of the user to filter
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
  async getUserResponsible({ request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const userId = request.param('userId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const userResponsibles = await employeeService.getUserResponsible(employeeId, userId, businessUnitScope)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The user responsibles were found successfully',
        data: { data: userResponsibles },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }


  /**
   * @swagger
   * /api/employees/quota:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Cupo de empleados vigente de la empresa activa
   *     description: |
   *       Devuelve el cupo efectivo, el conteo de vigentes y los lugares restantes
   *       de la empresa del header `X-Business-Unit-Id`. Capa de lectura sobre
   *       `EmployeeQuotaService` (USRH1785441819658).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       '200':
   *         description: Cupo resuelto para la empresa activa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     limit:
   *                       type: integer
   *                       nullable: true
   *                     active:
   *                       type: integer
   *                     remaining:
   *                       type: integer
   *                       nullable: true
   *                     hasPlan:
   *                       type: boolean
   *       '400':
   *         description: Falta header X-Business-Unit-Id
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '401':
   *         description: No autenticado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '404':
   *         description: Empresa fuera de alcance o inexistente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   */
  async getQuota({ response }: HttpContext) {
    const businessUnitId = TenantContext.getScope()[0]
    const quotaService = new EmployeeQuotaService()
    const quota = await quotaService.resolveQuota(businessUnitId)
    const active = await quotaService.countActiveEmployees(businessUnitId)

    const limit = quota.limit
    const remaining = limit === null ? null : limit - active
    const hasPlan = quota.source !== 'no_plan'

    return response.status(200).json({
      type: 'success',
      title: 'Cupo de empleados',
      message: 'Cupo vigente de la empresa',
      data: {
        limit,
        active,
        remaining,
        hasPlan,
      },
    })
  }

  /**
   * @swagger
   * /api/employees/get-biometrics:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all biometrics
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
  async getBiometrics({ response, i18n, businessUnitScope }: HttpContext) {
    try {
      const employeeService = new EmployeeService(i18n)
      let employeesSync = [] as EmployeeSyncInterface[]
      employeesSync = await employeeService.getEmployeesToSyncFromBiometrics(businessUnitScope)
      response.status(200)

      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employeesSync
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


  /**
   * @swagger
   * /api/employees/import-excel:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Importar empleados desde archivo Excel
   *     description: |
   *       Carga masiva de empleados. Requiere autenticación y alcance de unidad de negocio.
   *       La actualización aplica solo cuando la fila incluye la columna oculta ID Empleado de la plantilla.
   *       Si el archivo incluye altas nuevas y rebasa el cupo efectivo, responde 409 y no aplica
   *       ninguna fila (todo-o-nada). Un archivo con solo correcciones no evalúa cupo.
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema:
   *           type: string
   *         description: Bearer access token
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador de unidad de negocio (tenant)
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema:
   *           type: string
   *           enum: [es, en]
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Archivo Excel con datos de empleados
   *             required:
   *               - file
   *     responses:
   *       200:
   *         description: Importación procesada (éxito o con advertencias/errores por fila)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   enum: [success, warning]
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     summary:
   *                       type: object
   *                       properties:
   *                         totalRows:
   *                           type: integer
   *                         processed:
   *                           type: integer
   *                         created:
   *                           type: integer
   *                         updated:
   *                           type: integer
   *                         failed:
   *                           type: integer
   *                         skipped:
   *                           type: integer
   *                         limitReached:
   *                           type: boolean
   *                           deprecated: true
   *                           description: Siempre false. Si el cupo no alcanza, la API responde 409 sin escribir nada.
   *                     rowErrors:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           row:
   *                             type: integer
   *                           field:
   *                             type: string
   *                           message:
   *                             type: string
   *                     warnings:
   *                       type: array
   *                       items:
   *                         type: string
   *                     errors:
   *                       type: array
   *                       description: Alias legado deprecado
   *                       items:
   *                         type: string
   *       400:
   *         description: Archivo inválido o cabeceras faltantes
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
   *                 message:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *                 data:
   *                   nullable: true
   *             examples:
   *               cabecerasInvalidas:
   *                 value:
   *                   type: error
   *                   title: Cabeceras del archivo inválidas
   *                   message: "Faltan los siguientes encabezados requeridos: Identificador de nómina"
   *                   detail: "Faltan los siguientes encabezados requeridos: Identificador de nómina"
   *                   key: cabeceras-invalidas
   *                   code: EMP.IMPORT.VAL_HEADERS
   *                   data: null
   *       403:
   *         description: |
   *           El archivo incluye columnas de datos sensibles sin permiso de escritura de la categoría.
   *           No se procesa ningún renglón. En otras rutas de escritura, un valor con forma de máscara
   *           del sistema se trata como no enviado cuando el usuario no tiene lectura de la categoría.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: El archivo contiene datos sensibles que no puedes modificar
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: el-archivo-contiene-datos-sensibles-que-no-puedes-modificar
   *                 code:
   *                   type: string
   *                   example: EMP.SENS.WRITE.IMPORT_FORBIDDEN
   *       409:
   *         description: |
   *           El archivo rebasa el cupo de empleados, la empresa self-service no tiene plan vigente,
   *           o alguna fila declara una empresa distinta de la activa (trabajo o nómina).
   *           No se aplica ninguna fila del Excel (todo-o-nada).
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
   *                 message:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   enum: [cupo-empleados-agotado-importacion, sin-plan-contratado-importacion, archivo-de-otra-empresa]
   *                 code:
   *                   type: string
   *                   enum: [EMP.IMPORT.QUOTA_EXCEEDED, EMP.IMPORT.NO_PLAN, EMP.IMPORT.VAL_BUSINESS_UNIT]
   *                 data:
   *                   oneOf:
   *                     - type: object
   *                       description: Solo cantidades; nunca identificadores internos de empresa
   *                       properties:
   *                         contracted:
   *                           type: integer
   *                         active:
   *                           type: integer
   *                         incoming:
   *                           type: integer
   *                           description: Altas nuevas en el archivo (filas sin ID Empleado)
   *                     - type: object
   *                       properties:
   *                         offendingRows:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               row:
   *                                 type: integer
   *                               businessUnit:
   *                                 type: string
   *                               payrollBusinessUnit:
   *                                 type: string
   *             examples:
   *               cupoRebasado:
   *                 value:
   *                   type: error
   *                   title: El archivo rebasa tu cupo de empleados
   *                   message: El archivo daría de alta 5 empleados y solo te quedan 2 lugares.
   *                   detail: "Contratados: 20. Vigentes: 18. Altas en el archivo: 5. No se aplicó ninguna línea del archivo; escríbenos a hola@valanserh.com para ampliar tu cupo."
   *                   key: cupo-empleados-agotado-importacion
   *                   code: EMP.IMPORT.QUOTA_EXCEEDED
   *                   data:
   *                     contracted: 20
   *                     active: 18
   *                     incoming: 5
   *               sinPlan:
   *                 value:
   *                   type: error
   *                   title: No tienes un plan vigente
   *                   message: No se aplicó ninguna línea del archivo porque tu empresa no tiene un plan vigente.
   *                   detail: El archivo traía 3 altas y no se aplicó ninguna. Escríbenos a hola@valanserh.com para activar tu plan y vuelve a subirlo.
   *                   key: sin-plan-contratado-importacion
   *                   code: EMP.IMPORT.NO_PLAN
   *                   data:
   *                     contracted: 0
   *                     active: 12
   *                     incoming: 3
   *               otraEmpresa:
   *                 value:
   *                   type: error
   *                   title: El archivo tiene empleados de otra empresa
   *                   message: "La empresa activa es «Acme». Estas filas declaran otra: fila 12 («Otra SA»), fila 13 («Otra SA»), fila 40 («Otra SA»). … y 5 filas más. No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo."
   *                   detail: "La empresa activa es «Acme». Estas filas declaran otra: fila 12 («Otra SA»), fila 13 («Otra SA»), fila 40 («Otra SA»). … y 5 filas más. No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo."
   *                   key: archivo-de-otra-empresa
   *                   code: EMP.IMPORT.VAL_BUSINESS_UNIT
   *                   data:
   *                     offendingRows:
   *                       - row: 12
   *                         businessUnit: Otra SA
   *                         payrollBusinessUnit: ''
   *                       - row: 13
   *                         businessUnit: Otra SA
   *                         payrollBusinessUnit: ''
   *                       - row: 40
   *                         businessUnit: ''
   *                         payrollBusinessUnit: Otra SA
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
   *                 message:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-importacion
   *                 code:
   *                   type: string
   *                   example: EMP.IMPORT.SERVER
   *                 data:
   *                   nullable: true
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string, example: Sin permiso para modificar datos sensibles }
   *                 detail: { type: string, example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó. }
   *                 key: { type: string, example: sin-permiso-para-modificar-datos-sensibles }
   *                 code: { type: string, example: EMP.SENS.WRITE.FORBIDDEN }
   */
  async importFromExcel(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      const file = request.file('file')

      if (!file) {
        return respondEmployeeImportValFileError({ i18n }, response, 'missing')
      }

      if (typeof file.size === 'number' && file.size > EMPLOYEE_IMPORT_UPLOAD.maxFileBytes) {
        return respondEmployeeImportValFileError({ i18n }, response, 'too_large')
      }

      // La hoja no se abre sin comprobar antes que es OOXML real: un `.xlsx`
      // es un ZIP y el nombre no prueba nada.
      await assertSpreadsheetFile(file)

      // Validar que el archivo sea un Excel
      const allowedExtensions = [...EMPLOYEE_IMPORT_UPLOAD.acceptedExtensions]
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/octet-stream' // Fallback para algunos casos
      ]

      // Verificar por extensión del archivo
      const fileName = file.clientName || file.tmpPath || ''
      const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))

      // Verificar por MIME type
      const mimeType = file.type || ''

      const isValidExtension = (allowedExtensions as readonly string[]).includes(fileExtension)
      const isValidMimeType = allowedMimeTypes.includes(mimeType.toLowerCase())

      const blockedExtensions = ['.sql', '.pdf', '.zip', '.csv', '.txt']
      if (fileExtension && blockedExtensions.includes(fileExtension)) {
        return respondEmployeeImportValFileError({ i18n }, response, 'invalid_type')
      }

      // Si no pasa la validación básica, intentar validar por contenido
      if (!isValidExtension && !isValidMimeType) {
        try {
          // Intentar leer el archivo con ExcelJS para verificar si es realmente un Excel
          const ExcelJSModule = await import('exceljs')
          const ExcelJSLib = ExcelJSModule.default
          const workbook = new ExcelJSLib.Workbook()

          await workbook.xlsx.readFile(file.tmpPath || '')
          // Si llega aquí, es un archivo Excel válido
        } catch (excelError: unknown) {
          logger.warn({ err: excelError }, 'Archivo de importación de empleados inválido')
          return respondEmployeeImportValFileError({ i18n }, response, 'invalid_type')
        }
      }

      const employeeService = new EmployeeService(i18n)
      const result = await employeeService.importFromExcel(file, businessUnitScope)

      const { summary, rowErrors, warnings } = result

      // Determinar el tipo de respuesta basado en los resultados
      let responseType = 'success'
      let title = 'Importación completada'
      let message = ''

      if (rowErrors.length > 0 || warnings.length > 0) {
        responseType = 'warning'
        title = 'Importación completada con advertencias'
        message = `Se procesaron ${summary.processed} empleados: ${summary.created} creados, ${summary.updated} actualizados. ${summary.failed} filas con error.`
      } else {
        message = `Importación exitosa: ${summary.created} empleados creados, ${summary.updated} empleados actualizados.`
      }

      response.status(200)
      return {
        type: responseType,
        title: title,
        message: message,
        data: result,
      }
    } catch (error: unknown) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      if (error instanceof EmployeeQuotaError) {
        const resolved = resolveEmployeeQuotaApiError(error, error.httpStatus, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
          data: resolved.data,
        }
      }

      // USRH1789747321650 reglas 1 y 6: el archivo declaraba otra empresa.
      // Rechazo todo-o-nada con el listado de filas para corregir (409, mismo
      // camino que cupo: no se aplica ninguna línea del archivo).
      if ((error as { isCompanyMismatchError?: boolean }).isCompanyMismatchError) {
        const resolved = resolveEmployeeImportApiError(error, 409, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
          data: resolved.data,
        }
      }

      // Detectar errores de validación de cabeceras
      if (
        (error as { isHeaderValidationError?: boolean }).isHeaderValidationError ||
        (error as { statusCode?: number }).statusCode === 400
      ) {
        const resolved = resolveEmployeeImportApiError(error, 400, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
          data: null,
        }
      }

      logger.error({ err: error }, 'Error inesperado en importación de empleados por Excel')
      const resolved = resolveEmployeeImportApiError(error, 500, i18n)
      response.status(resolved.status)
      return {
        type: 'error',
        title: resolved.title,
        message: resolved.message,
        detail: resolved.detail,
        key: resolved.key,
        code: resolved.errorCode,
        data: null,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/inverse-synchronization:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Sincronizar un empleado existente a la API de biométricos
   *     description: Envía un empleado existente en la base de datos local a la API de biométricos
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: integer
   *                 description: ID del empleado a sincronizar
   *                 required: true
   *     responses:
   *       200:
   *         description: Empleado sincronizado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Response type (success, error)
   *                 title:
   *                   type: string
   *                   description: Response title
   *                 message:
   *                   type: string
   *                   description: Response message
   *       400:
   *         description: Bad request - ID de empleado requerido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *       404:
   *         description: Empleado no encontrado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *                 error:
   *                   type: string
   *                   description: Detailed error information
   */
  async inverseSync({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'El ID del empleado es requerido',
        }
      }

      const employeeService = new EmployeeService(i18n)
      const result = await employeeService.sendEmployeeToBiometrics(employeeId)

      if (!result.success) {
        response.status(404)
        return {
          type: 'error',
          title: 'Sincronización fallida',
          message: result.message,
          error: result.error,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Sincronización exitosa',
        message: result.message,
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'Ocurrió un error inesperado al sincronizar el empleado',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/shift-assignment-template:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Generar plantilla de Excel para asignación de turnos
   *     description: |
   *       Genera una plantilla de Excel dinámica para la asignación de turnos a empleados.
   *       La plantilla incluye:
   *       - Columnas dinámicas para cada día del rango de fechas especificado
   *       - Dropdowns para seleccionar empleados (con auto-completado de posición)
   *       - Dropdowns para seleccionar turnos (incluyendo opciones como vacaciones, día de descanso, día festivo)
   *       - Días festivos de México marcados automáticamente como "Día festivo"
   *       - Formato con colores de la unidad de negocio activa
   *     produces:
   *       - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   *     parameters:
   *       - in: query
   *         name: startDate
   *         required: true
   *         schema:
   *           type: string
   *           format: date
   *         description: "Fecha de inicio del rango (formato: yyyy-MM-dd)"
   *         example: "2025-11-10"
   *       - in: query
   *         name: endDate
   *         required: true
   *         schema:
   *           type: string
   *           format: date
   *         description: "Fecha de fin del rango (formato: yyyy-MM-dd)"
   *         example: "2025-11-16"
   *       - in: query
   *         name: employeeIds
   *         required: false
   *         schema:
   *           type: string
   *         description: "Array opcional de IDs de empleados separados por comas para filtrar el template (ejemplo: 1,2,3)"
   *         example: "1,2,3"
   *       - in: query
   *         name: isReport
   *         required: false
   *         schema:
   *           type: boolean
   *         description: Si es true, genera un reporte mostrando los turnos asignados actuales con colores (solo lectura). Si es false o no se proporciona, genera un template editable.
   *         example: true
   *       - in: query
   *         name: businessUnitId
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filtro opcional; solo incluir empleados de esta unidad de negocio de trabajo.
   *       - in: query
   *         name: payrollBusinessUnitId
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filtro opcional; solo incluir empleados de esta unidad de negocio de nómina.
   *       - in: query
   *         name: branchNameIds
   *         required: false
   *         schema:
   *           type: string
   *         description: IDs de sucursal (branch_office_id) separados por comas. Solo empleados con asignación activa a alguna. Vacío u omitido = sin filtro. Aplica en plantilla editable y en isReport.
   *         example: "2,3,4"
   *     responses:
   *       200:
   *         description: Plantilla de Excel generada exitosamente
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *         headers:
   *           Content-Disposition:
   *             description: Nombre del archivo descargable
   *             schema:
   *               type: string
   *               example: 'attachment; filename="plantilla-asignacion-turnos-2026-09-01-2026-09-15.xlsx"'
   *       400:
   *         description: Parámetros inválidos o faltantes
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
   *                   example: Validation error
   *                 message:
   *                   type: string
   *                   example: Las fechas de inicio y fin son requeridas y deben tener el formato yyyy-MM-dd
   *       500:
   *         description: Error interno del servidor
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
   *                   example: Server error
   *                 message:
   *                   type: string
   *                   example: Ocurrió un error inesperado al generar la plantilla
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-importacion-turnos
   *                 code:
   *                   type: string
   *                   example: EMP.IMPORT.SERVER_SHIFTS
   */
  async getShiftAssignmentTemplate({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()

      const startDate = request.input('startDate')
      const endDate = request.input('endDate')
      const employeeIdsParam = request.input('employeeIds')
      const isReportParam = request.input('isReport')
      const businessUnitIdParam = request.input('businessUnitId')
      const payrollBusinessUnitIdParam = request.input('payrollBusinessUnitId')

      // Convertir isReport a boolean
      const isReport = isReportParam === 'true' || isReportParam === true

      // Validar que las fechas sean proporcionadas
      if (!startDate || !endDate) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'Las fechas de inicio (startDate) y fin (endDate) son requeridas',
        }
      }

      // Validar formato de fechas
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'Las fechas deben tener el formato yyyy-MM-dd (ejemplo: 2025-11-10)',
        }
      }

      // Parsear employeeIds si se proporciona
      let employeeIds: number[] | undefined
      if (employeeIdsParam) {
        try {
          // Si es un array (cuando se usa employeeIds[]=1&employeeIds[]=2)
          if (Array.isArray(employeeIdsParam)) {
            employeeIds = employeeIdsParam.map((id) => {
              const numId = typeof id === 'string' ? Number.parseInt(id, 10) : id
              if (Number.isNaN(numId) || !Number.isInteger(numId)) {
                throw new Error('IDs inválidos')
              }
              return numId
            })
          } else if (typeof employeeIdsParam === 'string') {
            // Si es una cadena separada por comas (ejemplo: "1,2,3")
            employeeIds = employeeIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
              .map((id) => {
                const numId = Number.parseInt(id, 10)
                if (Number.isNaN(numId) || !Number.isInteger(numId)) {
                  throw new Error('IDs inválidos')
                }
                return numId
              })
          } else {
            // Si es un número único
            const numId = typeof employeeIdsParam === 'number' ? employeeIdsParam : Number.parseInt(String(employeeIdsParam), 10)
            if (Number.isNaN(numId) || !Number.isInteger(numId)) {
              throw new Error('ID inválido')
            }
            employeeIds = [numId]
          }

          // Validar que al menos haya un ID válido
          if (!employeeIds || employeeIds.length === 0) {
            response.status(400)
            return {
              type: 'error',
              title: 'Validation error',
              message: 'employeeIds debe contener al menos un ID válido',
            }
          }
        } catch (error: any) {
          response.status(400)
          return {
            type: 'error',
            title: 'Validation error',
            message: 'employeeIds debe ser una cadena de números separados por comas (ejemplo: "1,2,3") o un número',
          }
        }
      }

      const businessUnitId = businessUnitIdParam !== undefined && businessUnitIdParam !== '' ? Number(businessUnitIdParam) : undefined
      const payrollBusinessUnitId = payrollBusinessUnitIdParam !== undefined && payrollBusinessUnitIdParam !== '' ? Number(payrollBusinessUnitIdParam) : undefined
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))

      const employeeService = new EmployeeService(i18n)
      const buffer = await employeeService.generateShiftAssignmentTemplate(
        startDate,
        endDate,
        employeeIds,
        isReport,
        businessUnitId !== undefined && !Number.isNaN(businessUnitId) ? businessUnitId : undefined,
        payrollBusinessUnitId !== undefined && !Number.isNaN(payrollBusinessUnitId) ? payrollBusinessUnitId : undefined,
        branchNameIds,
        businessUnitScope
      )

      // Configurar headers para la descarga del archivo
      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        contentDisposition(
          buildDownloadFileName(
            ['plantilla-asignacion-turnos', formatDownloadFileDate(startDate), formatDownloadFileDate(endDate)],
            'xlsx'
          )
        )
      )
      response.status(200)
      return response.send(buffer)
    } catch (error: any) {
      logger.error({ err: error }, 'Error inesperado al generar la plantilla de asignación de turnos')
      const resolved = resolveEmployeeImportApiError(error, 500, i18n, {
        errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS,
        key: 'error-importacion-turnos',
      })
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'Ocurrió un error inesperado al generar la plantilla',
        detail: resolved.detail,
        key: resolved.key,
        code: resolved.errorCode,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/attendance-report:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Generar reporte de asistencia en Excel
   *     description: |
   *       Genera un reporte de asistencia en Excel agrupado por departamento.
   *       Parámetros en query string. También acepta start_date/end_date como alias.
   *       Si el cliente envía datos en el cuerpo (p. ej. axios con `data` en GET), usar POST /attendance-report con JSON.
   *       Muestra empleados con sus turnos y colores según el estado de asistencia.
   *       - Verde: ontime
   *       - Azul: tolerance
   *       - Naranja: delay
   *       - Rojo: fault
   *       - Blanco: excepciones, festividades, vacaciones
   *     produces:
   *       - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   *     parameters:
   *       - name: startDate
   *         in: query
   *         required: true
   *         description: "Fecha de inicio del periodo (formato: yyyy-MM-dd)"
   *         schema:
   *           type: string
   *           format: date
   *           example: "2024-10-01"
   *       - name: endDate
   *         in: query
   *         required: true
   *         description: "Fecha de fin del periodo (formato: yyyy-MM-dd)"
   *         schema:
   *           type: string
   *           format: date
   *           example: "2024-10-31"
   *       - name: departmentIds
   *         in: query
   *         required: false
   *         description: IDs de departamentos a filtrar (separados por comas)
   *         schema:
   *           type: string
   *           example: "1,2,3"
   *       - name: employeeIds
   *         in: query
   *         required: false
   *         description: IDs de empleados a filtrar (separados por comas)
   *         schema:
   *           type: string
   *           example: "1,2,3"
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         description: Solo empleados de esta unidad de negocio de trabajo (debe estar en las unidades del sistema)
   *         schema:
   *           type: integer
   *           example: 1
   *       - name: payrollBusinessUnitId
   *         in: query
   *         required: false
   *         description: Solo empleados con esta unidad de negocio de nómina
   *         schema:
   *           type: integer
   *           example: 12
   *       - name: branchNameIds
   *         in: query
   *         required: false
   *         description: IDs de sucursal (branch_office_id) separados por comas. Solo empleados con asignación activa a alguna. Vacío u omitido = sin filtro.
   *         schema:
   *           type: string
   *           example: "2,3,4"
   *     responses:
   *       '200':
   *         description: Archivo Excel generado exitosamente
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       '400':
   *         description: Error de validación
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *       '500':
   *         description: Error del servidor
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 error:
   *                   type: string
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Generar reporte de asistencia en Excel (cuerpo JSON)
   *     description: |
   *       Igual que GET pero los filtros van en el cuerpo (application/json).
   *       Útil cuando el cliente envía parámetros en el body o usa alias snake_case.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - startDate
   *               - endDate
   *             properties:
   *               startDate:
   *                 type: string
   *                 format: date
   *                 example: "2026-04-08"
   *               endDate:
   *                 type: string
   *                 format: date
   *                 example: "2026-04-08"
   *               start_date:
   *                 type: string
   *                 description: Alternativa a startDate
   *               end_date:
   *                 type: string
   *                 description: Alternativa a endDate
   *               departmentIds:
   *                 oneOf:
   *                   - type: string
   *                     example: "1,2,3"
   *                   - type: array
   *                     items:
   *                       type: integer
   *               employeeIds:
   *                 oneOf:
   *                   - type: string
   *                   - type: array
   *                     items:
   *                       type: integer
   *               businessUnitId:
   *                 type: integer
   *               payrollBusinessUnitId:
   *                 type: integer
   *               business_unit_id:
   *                 type: integer
   *               payroll_business_unit_id:
   *                 type: integer
   *     responses:
   *       '200':
   *         description: Archivo Excel generado exitosamente
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       '400':
   *         description: Error de validación
   *       '500':
   *         description: Error del servidor
   */
  async getAttendanceReport({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()

      const firstNonEmptyInput = (...keys: string[]): string | undefined => {
        for (const key of keys) {
          const v = request.input(key)
          if (v === undefined || v === null) continue
          const s = typeof v === 'string' ? v.trim() : String(v).trim()
          if (s !== '') return s
        }
        return undefined
      }

      const startDate = firstNonEmptyInput('startDate', 'start_date')
      const endDate = firstNonEmptyInput('endDate', 'end_date')
      const departmentIdsParam =
        request.input('departmentIds') ?? request.input('department_ids')
      const employeeIdsParam = request.input('employeeIds') ?? request.input('employee_ids')


      // Validar que las fechas sean proporcionadas
      if (!startDate || !endDate) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'Las fechas de inicio (startDate) y fin (endDate) son requeridas',
        }
      }

      // Validar formato de fechas
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'Las fechas deben tener el formato yyyy-MM-dd (ejemplo: 2024-10-01)',
        }
      }

      // Parsear departmentIds si se proporciona
      let departmentIds: number[] | undefined
      if (departmentIdsParam) {
        try {
          if (Array.isArray(departmentIdsParam)) {
            departmentIds = departmentIdsParam.map((id) => {
              const numId = typeof id === 'string' ? Number.parseInt(id, 10) : id
              if (Number.isNaN(numId) || !Number.isInteger(numId)) {
                throw new Error('IDs inválidos')
              }
              return numId
            })
          } else if (typeof departmentIdsParam === 'string') {
            departmentIds = departmentIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
              .map((id) => {
                const numId = Number.parseInt(id, 10)
                if (Number.isNaN(numId) || !Number.isInteger(numId)) {
                  throw new Error('IDs inválidos')
                }
                return numId
              })
          } else {
            const numId = typeof departmentIdsParam === 'number' ? departmentIdsParam : Number.parseInt(String(departmentIdsParam), 10)
            if (Number.isNaN(numId) || !Number.isInteger(numId)) {
              throw new Error('ID inválido')
            }
            departmentIds = [numId]
          }
        } catch (error: any) {
          response.status(400)
          return {
            type: 'error',
            title: 'Validation error',
            message: 'departmentIds debe ser una cadena de números separados por comas (ejemplo: "1,2,3") o un número',
          }
        }
      }

      // Parsear employeeIds si se proporciona
      let employeeIds: number[] | undefined
      if (employeeIdsParam) {
        try {
          if (Array.isArray(employeeIdsParam)) {
            employeeIds = employeeIdsParam.map((id) => {
              const numId = typeof id === 'string' ? Number.parseInt(id, 10) : id
              if (Number.isNaN(numId) || !Number.isInteger(numId)) {
                throw new Error('IDs inválidos')
              }
              return numId
            })
          } else if (typeof employeeIdsParam === 'string') {
            employeeIds = employeeIdsParam
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
              .map((id) => {
                const numId = Number.parseInt(id, 10)
                if (Number.isNaN(numId) || !Number.isInteger(numId)) {
                  throw new Error('IDs inválidos')
                }
                return numId
              })
          } else {
            const numId = typeof employeeIdsParam === 'number' ? employeeIdsParam : Number.parseInt(String(employeeIdsParam), 10)
            if (Number.isNaN(numId) || !Number.isInteger(numId)) {
              throw new Error('ID inválido')
            }
            employeeIds = [numId]
          }
        } catch (error: any) {
          response.status(400)
          return {
            type: 'error',
            title: 'Validation error',
            message: 'employeeIds debe ser una cadena de números separados por comas (ejemplo: "1,2,3") o un número',
          }
        }
      }

      const businessUnitIdParam =
        request.input('businessUnitId') ?? request.input('business_unit_id')
      const payrollBusinessUnitIdParam =
        request.input('payrollBusinessUnitId') ?? request.input('payroll_business_unit_id')
      const businessUnitIdParsed =
        businessUnitIdParam !== undefined && businessUnitIdParam !== ''
          ? Number(businessUnitIdParam)
          : undefined
      const payrollBusinessUnitIdParsed =
        payrollBusinessUnitIdParam !== undefined && payrollBusinessUnitIdParam !== ''
          ? Number(payrollBusinessUnitIdParam)
          : undefined
      const businessUnitId =
        businessUnitIdParsed !== undefined && !Number.isNaN(businessUnitIdParsed) && businessUnitIdParsed > 0
          ? businessUnitIdParsed
          : undefined
      const payrollBusinessUnitId =
        payrollBusinessUnitIdParsed !== undefined &&
          !Number.isNaN(payrollBusinessUnitIdParsed) &&
          payrollBusinessUnitIdParsed > 0
          ? payrollBusinessUnitIdParsed
          : undefined
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))

      const employeeService = new EmployeeService(i18n)
      const buffer = await employeeService.generateAttendanceReport(
        startDate,
        endDate,
        departmentIds,
        employeeIds,
        businessUnitId,
        payrollBusinessUnitId,
        branchNameIds,
        businessUnitScope
      )

      // Reporte de un solo empleado: el nombre lleva su slug (token opaco), nunca nombre ni número.
      const singleEmployee =
        employeeIds?.length === 1
          ? await Employee.query().withTrashed().where('employee_id', employeeIds[0]).select('employee_slug').first()
          : null

      // Configurar headers para la descarga del archivo
      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        contentDisposition(
          buildDownloadFileName(
            [
              'reporte-asistencia',
              singleEmployee?.employeeSlug,
              formatDownloadFileDate(startDate),
              formatDownloadFileDate(endDate),
            ],
            'xlsx'
          )
        )
      )
      response.status(200)
      return response.send(buffer)
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'Ocurrió un error inesperado al generar el reporte de asistencia',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/import-shift-assignments:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Importar asignaciones de turnos desde archivo Excel
   *     description: |
   *       Importa las asignaciones de turnos desde un archivo Excel generado con la plantilla.
   *       Solo procesa las filas que tengan un código de empleado en la primera columna.
   *       Las celdas vacías se ignoran.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Archivo Excel con asignaciones de turnos (generado con la plantilla)
   *             required:
   *               - file
   *     responses:
   *       200:
   *         description: Asignaciones importadas exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Importación completada
   *                 message:
   *                   type: string
   *                   example: Las asignaciones de turnos se importaron correctamente
   *                 data:
   *                   type: object
   *                   properties:
   *                     totalRows:
   *                       type: number
   *                       description: Total de filas procesadas
   *                     processed:
   *                       type: number
   *                       description: Filas procesadas exitosamente
   *                     created:
   *                       type: number
   *                       description: Registros nuevos creados
   *                     updated:
   *                       type: number
   *                       description: Registros actualizados
   *                     skipped:
   *                       type: number
   *                       description: Filas omitidas
   *                     errors:
   *                       type: array
   *                       items:
   *                         type: string
   *                       description: Lista de errores encontrados
   *       400:
   *         description: Archivo no proporcionado o inválido
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
   *                   example: Validation error
   *                 message:
   *                   type: string
   *                   example: El archivo debe ser un Excel válido (.xlsx o .xls).
   *       500:
   *         description: Error interno del servidor
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
   *                   example: Error al importar
   *                 message:
   *                   type: string
   *                   example: Ocurrió un error al procesar el archivo Excel
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-importacion-turnos
   *                 code:
   *                   type: string
   *                   example: EMP.IMPORT.SERVER_SHIFTS
   */
  async importShiftAssignments({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      await auth.check()

      const file = request.file('file')

      if (!file) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'Excel file is required',
        }
      }

      // La hoja no se abre sin comprobar antes que es OOXML real: un `.xlsx`
      // es un ZIP y el nombre no prueba nada.
      await assertSpreadsheetFile(file)

      // Validar que el archivo sea un Excel
      const allowedExtensions = ['.xlsx', '.xls']
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/octet-stream' // Fallback para algunos casos
      ]

      const fileName = file.clientName || file.tmpPath || ''
      const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
      const mimeType = file.type || ''

      const isValidExtension = allowedExtensions.includes(fileExtension)
      const isValidMimeType = allowedMimeTypes.includes(mimeType.toLowerCase())

      if (!isValidExtension && !isValidMimeType) {
        try {
          const ExcelJSModule = await import('exceljs')
          const ExcelJSLib = ExcelJSModule.default
          const workbook = new ExcelJSLib.Workbook()
          await workbook.xlsx.readFile(file.tmpPath || '')
        } catch (excelError: any) {
          logger.warn({ err: excelError }, 'ExcelJS no pudo leer el archivo de importación de turnos')
          response.status(400)
          return {
            type: 'error',
            title: 'Validation error',
            message: 'El archivo debe ser un Excel válido (.xlsx o .xls).',
          }
        }
      }

      const employeeService = new EmployeeService(i18n)
      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      const result = await employeeService.importShiftAssignmentsFromExcel(
        file,
        rawHeaders,
        userId,
        businessUnitScope
      )

      response.status(result.status)
      return result
    } catch (error: any) {
      logger.error({ err: error }, 'Error inesperado al importar asignaciones de turnos')
      const resolved = resolveEmployeeImportApiError(error, 500, i18n, {
        errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS,
        key: 'error-importacion-turnos',
      })
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'Ocurrió un error inesperado al importar las asignaciones',
        detail: resolved.detail,
        key: resolved.key,
        code: resolved.errorCode,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/vacation-deductions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Aplicar deducción de días de vacaciones a un periodo sin registrar fechas
   *     description: Permite inhabilitar (descontar) días de vacaciones disponibles de un periodo específico sin necesidad de registrar fechas concretas. La descripción es opcional.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: ID del empleado
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - vacationSettingId
   *               - vacationDeductionDays
   *             properties:
   *               vacationSettingId:
   *                 type: number
   *                 description: ID del periodo de vacaciones (vacation setting)
   *               vacationDeductionDays:
   *                 type: number
   *                 description: Número de días a descontar
   *               vacationDeductionDescription:
   *                 type: string
   *                 description: Descripción opcional de la razón de la deducción
   *     responses:
   *       '201':
   *         description: Deducción aplicada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '400':
   *         description: Datos inválidos o días insuficientes disponibles
   *       '404':
   *         description: Empleado o periodo de vacaciones no encontrado
   *       default:
   *         description: Error inesperado del servidor
   */
  async applyVacationDeduction({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Datos incompletos',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'No se encontró el empleado con el ID ingresado',
          data: { employeeId },
        }
      }

      const data = await request.validateUsing(createVacationDeductionValidator)
      const result = await employeeService.applyVacationDeduction(
        employee,
        data.vacationSettingId,
        data.vacationDeductionDays,
        data.vacationDeductionDescription
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/vacation-deductions:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Obtener las deducciones de vacaciones de un empleado por periodo
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: ID del empleado
   *         required: true
   *       - in: query
   *         name: vacationSettingId
   *         schema:
   *           type: number
   *         description: ID del periodo de vacaciones para filtrar
   *         required: false
   *     responses:
   *       '200':
   *         description: Deducciones encontradas correctamente
   *       '404':
   *         description: Empleado no encontrado
   *       default:
   *         description: Error inesperado del servidor
   */
  async getVacationDeductions({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Datos incompletos',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'No se encontró el empleado con el ID ingresado',
          data: { employeeId },
        }
      }

      const vacationSettingId = request.input('vacationSettingId')
      const deductions = await employeeService.getVacationDeductionsByPeriod(
        employee.employeeId,
        vacationSettingId
      )

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'Las deducciones de vacaciones fueron encontradas correctamente',
        data: { deductions },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/vacation-deductions/{vacationDeductionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Eliminar una deducción de vacaciones del empleado
   *     description: Realiza borrado lógico (soft delete) del registro. Los días vuelven a estar disponibles en el periodo.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         required: true
   *       - in: path
   *         name: vacationDeductionId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Deducción eliminada correctamente
   *       '404':
   *         description: Empleado o deducción no encontrada
   *       default:
   *         description: Error inesperado del servidor
   */
  async deleteVacationDeduction({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const vacationDeductionId = Number(request.param('vacationDeductionId'))

      if (!employeeId || Number.isNaN(vacationDeductionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Datos incompletos',
          message: 'El ID del empleado y el ID de la deducción son requeridos',
          data: { employeeId, vacationDeductionId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'No se encontró el empleado con el ID ingresado',
          data: { employeeId },
        }
      }

      const result = await employeeService.deleteVacationDeduction(
        employee.employeeId,
        vacationDeductionId
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/salary-history:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Obtener el histórico de salarios de un empleado
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Histórico de salarios ordenado del más reciente al más antiguo
   *       '404':
   *         description: Empleado no encontrado
   */
  async salaryHistory({ request, response }: HttpContext) {
    try {
      const employeeId = Number(request.param('employeeId'))

      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: 'ID inválido',
          message: 'El ID del empleado no es válido',
        }
      }

      const service = new EmployeeSalaryHistoryService()
      const result = await service.getHistory(employeeId)

      if ('data' in result) {
        response.status(200)
        return {
          type: 'success',
          title: 'Historial de salarios',
          message: 'Historial de salarios encontrado correctamente',
          data: result.data,
        }
      }

      response.status(result.status)
      return {
        type: 'warning',
        title: result.title,
        message: result.message,
        key: result.key,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/to-assigned:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all employees to assigned
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: employeeWorkSchedule
   *         in: query
   *         required: false
   *         description: Employee work schedule
   *         schema:
   *           type: string
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: employeeTypeId
   *         in: query
   *         required: false
   *         description: Employee Type Id
   *         schema:
   *           type: integer
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: orderBy
   *         in: query
   *         required: false
   *         description: Order by field (number or name)
   *         schema:
   *           type: string
   *           enum: [number, name]
   *       - name: orderDirection
   *         in: query
   *         required: false
   *         description: Order direction (ascend or descend)
   *         schema:
   *           type: string
   *           enum: [ascend, descend]
   *       - name: businessUnitId
   *         in: query
   *         required: false
   *         description: Business Unit Id
   *         schema:
   *           type: integer
   *       - name: payrollBusinessUnitId
   *         in: query
   *         required: false
   *         description: Payroll Business Unit Id
   *         schema:
   *           type: integer
   *       - name: branchNameIds
   *         in: query
   *         required: false
   *         description: IDs de sucursal (branch_office_id) separados por comas. Solo empleados con asignación activa a alguna de ellas. Vacío u omitido = sin filtro.
   *         schema:
   *           type: string
   *           example: "2,3,4"
   *       - name: getMails
   *         in: query
   *         required: false
   *         description: Si es true, employeeBusinessEmail en la respuesta usa jerarquía (usuario > empresa > personal)
   *         schema:
   *           type: boolean
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
  async indexToAssigned(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      await auth.check()
      const user = auth.user

      let hasAccessToFullEmployees = false
      let userResponsibleId = null

      if (user) {
        await user.load('role')

        if (user.role.roleSlug !== 'root') {
          const roleService = new RoleService()
          hasAccessToFullEmployees = await roleService.hasAccessToFullEmployees(user.role.roleId)
        }

        if (user.role.roleSlug !== 'root' && !hasAccessToFullEmployees) {
          userResponsibleId = user?.userId
        }
      }

      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>

      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId, hasAccessToFullEmployees)
      }

      const search = request.input('search')
      const departmentId = this.parseIdOrIds(request.input('departmentId'))
      const positionId = this.parseIdOrIds(request.input('positionId'))
      const employeeWorkSchedule = request.input('employeeWorkSchedule')
      const onlyInactive = request.input('onlyInactive')
      if (isTerminatedEmployeesFilterRequested(onlyInactive)) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_TERMINATED_EMPLOYEES_READ_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
      const employeeTypeId = request.input('employeeTypeId')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const orderBy = request.input('orderBy')
      const orderDirection = request.input('orderDirection')
      const shiftStartTimeInit = request.input('shiftStartTimeInit')
      const shiftStartTimeEnd = request.input('shiftStartTimeEnd')
      const shiftEndTimeStart = request.input('shiftEndTimeStart')
      const shiftEndTimeEnd = request.input('shiftEndTimeEnd')
      const exceptionDate = request.input('exceptionDate')
      const shiftStartTime = request.input('shiftStartTime')
      const shiftEndTime = request.input('shiftEndTime')
      const businessUnitId = request.input('businessUnitId')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const getMails = request.input('getMails')
      const branchNameIds = this.parseBranchNameIds(request.input('branchNameIds'))

      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        employeeWorkSchedule: employeeWorkSchedule,
        onlyInactive: onlyInactive,
        employeeTypeId: employeeTypeId,
        userResponsibleId: userResponsibleId,
        page: page,
        limit: limit,
        orderBy: orderBy,
        orderDirection: orderDirection,
        shiftStartTimeInit: shiftStartTimeInit,
        shiftStartTimeEnd: shiftStartTimeEnd,
        shiftEndTimeStart: shiftEndTimeStart,
        shiftEndTimeEnd: shiftEndTimeEnd,
        exceptionDate: exceptionDate,
        shiftStartTime: shiftStartTime,
        shiftEndTime: shiftEndTime,
        businessUnitId: businessUnitId,
        payrollBusinessUnitId: payrollBusinessUnitId,
        branchNameIds: branchNameIds,
        getMails: getMails,
      } as EmployeeFilterSearchInterface

      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.indexToAssigned(filters, departmentsList, businessUnitScope)

      response.status(200)

      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
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

  /**
   * Excel de cumpleaños del año con los filtros del calendario unificado.
   * Reusa el mismo listado que `getBirthday`, así el archivo y la pantalla
   * coinciden fila por fila.
   */
  async getBirthdayExcel(ctx: HttpContext) {
    return this.sendCalendarExcel(ctx, 'birthdays')
  }

  /** Excel de aniversarios laborales del año; espejo de `getAnniversary`. */
  async getAnniversaryExcel(ctx: HttpContext) {
    return this.sendCalendarExcel(ctx, 'anniversaries')
  }

  private async sendCalendarExcel(
    { auth, request, response, i18n, businessUnitScope }: HttpContext,
    kind: 'birthdays' | 'anniversaries'
  ) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (resolveResponsibleUserId(user) !== null) {
          userResponsibleId = user?.userId
        }
      }
      const requestedYear = Number.parseInt(request.input('year'), 10)
      const year = Number.isFinite(requestedYear) ? requestedYear : new Date().getFullYear()
      const filters = {
        search: request.input('search'),
        departmentId: this.parseIdOrIds(request.input('departmentId')),
        positionId: this.parseIdOrIds(request.input('positionId')),
        year,
        userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const exportService = new CalendarExportService()
      const buffer =
        kind === 'birthdays'
          ? await exportService.birthdays(await employeeService.getBirthday(filters, businessUnitScope), year)
          : await exportService.anniversaries(await employeeService.getAnniversary(filters, businessUnitScope), year)
      response.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      response.header('Content-Disposition', contentDisposition(buildCalendarExportFileName(kind, year)))
      return response.status(200).send(buffer)
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
