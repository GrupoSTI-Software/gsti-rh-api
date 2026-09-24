import { DateTime } from 'luxon'
import { AssistDayInterface } from '../interfaces/assist_day_interface.js'
import { AssistEmployeeExcelFilterInterface } from '../interfaces/assist_employee_excel_filter_interface.js'
import ExcelJS from 'exceljs'
import Employee from '#models/employee'
import SyncAssistsService from './sync_assists_service.js'
import { AssistPositionExcelFilterInterface } from '../interfaces/assist_position_excel_filter_interface.js'
import EmployeeService from './employee_service.js'
import { EmployeeFilterSearchInterface } from '../interfaces/employee_filter_search_interface.js'
import { AssistDepartmentExcelFilterInterface } from '../interfaces/assist_department_excel_filter_interface.js'
import DepartmentService from './department_service.js'
import { AssistExcelRowInterface } from '../interfaces/assist_excel_row_interface.js'
import { AssistExcelFilterInterface } from '../interfaces/assist_excel_filter_interface.js'
import Department from '#models/department'
import { ShiftExceptionInterface } from '../interfaces/shift_exception_interface.js'
import { AssistIncidentExcelRowInterface } from '../interfaces/assist_incident_excel_row_interface.js'
import Assist from '#models/assist'
import { LogStore } from '#models/MongoDB/log_store'
import { LogAssist } from '../interfaces/MongoDB/log_assist.js'
import BusinessUnit from '#models/business_unit'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { resolveOrgAliasDisplay } from '#utils/org_alias_display'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import { AssistIncidentPayrollExcelRowInterface } from '../interfaces/assist_incident_payroll_excel_row_interface.js'
import { EmployeeWorkDaysDisabilityFilterInterface } from '../interfaces/employee_work_days_disability_filter_interface.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import { AssistIncidentPayrollCalendarExcelFilterInterface } from '../interfaces/assist_incident_payroll_calendar_excel_filter_interface.js'
import { AssistIncidentSummaryCalendarExcelFilterInterface } from '../interfaces/assist_incident_summary_calendar_excel_filter_interface.js'
import { AssistInterface } from '../interfaces/assist_interface.js'
import { PermissionsDatesExcelFilterInterface } from '../interfaces/permissions_dates_excel_filter_interface.js'
import ShiftException from '#models/shift_exception'
import WorkDisability from '#models/work_disability'
import { AssistFlatFilterInterface } from '../interfaces/assist_flat_filter_interface.js'
import { I18n } from '@adonisjs/i18n'
import Holiday from '#models/holiday'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import { resolveSiteTimeZone, wallTime, dayKeyOf, toInstant } from '#modules/attendance-time/attendance_clock'
import EmployeeShift from '#models/employee_shift'
import User from '#models/user'
import mail from '@adonisjs/mail/services/main'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import PayrollOvertimeMeasurementService from './payroll_overtime_measurement_service.js'
import PayrollOvertimeAllocationService from './payroll_overtime_allocation_service.js'
import PayrollOvertimeWeeklyDetailService from './payroll_overtime_weekly_detail_service.js'
import PayrollOvertimeUnauthorizedService from './payroll_overtime_unauthorized_service.js'
import {
  getIncidentPayrollExcelColumnCount,
  getIncidentPayrollExcelLastColumnLetter,
  isPayrollOvertimeIncludeUnauthorizedEnabled,
} from '#constants/payroll_overtime.constants'
import EffectiveService from '#modules/working-time-rules/effective/effective.service'
import { AssistIncidentSummaryV2ExcelRowInterface } from '../interfaces/assist_incident_summary_v2_excel_row_interface.js'
import { AssistIncidentSummaryV2CalendarExcelFilterInterface } from '../interfaces/assist_incident_summary_v2_calendar_excel_filter_interface.js'
import { PLATFORM_FALLBACK_TRADE_NAME } from '#constants/system_setting_defaults'
import { REPORT_NEUTRAL_ARGB } from '#constants/report_neutral_theme'
import {
  formatReportCalendarDate,
  REPORT_DATE_FORMAT,
  REPORT_LOCALE,
} from '#helpers/report_locale'
import { frozenHeaderViews } from '#helpers/report_sheet_views'
import { blankMissingTexts, reportFullName, reportText } from '#helpers/report_text'

/**
 * Defaults de tolerancia cuando no hay empresa en contexto o la empresa no tiene
 * la suya configurada. Son los valores que estos métodos ya usaban en duro.
 */
const DEFAULT_DELAY_TOLERANCE_MINUTES = 10
const DEFAULT_TARDINESS_TOLERANCE_MINUTES = 3
const DEFAULT_TOLERANCE_COUNT_PER_ABSENCE = 3

/** Fecha y hora de checada en los archivos descargables (reloj de 24 h). */
const REPORT_DATE_TIME_FORMAT = 'dd/MM/yyyy HH:mm:ss'

/**
 * Horas decimales como `HH:mm` en los archivos descargables. Redondea los
 * minutos TOTALES antes de partirlos en horas y minutos: redondear solo la
 * fracción daba "07:60" con 7.999 h. Un valor negativo lleva `-` delante.
 */
export function formatDecimalHours(decimal: number): string {
  if (!Number.isFinite(decimal)) return '00:00'
  const totalMinutes = Math.round(Math.abs(decimal) * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const clock = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  return decimal < 0 && totalMinutes > 0 ? `-${clock}` : clock
}

/**
 * Día de calendario de una columna DATE (medianoche UTC) o de un
 * `yyyy-MM-dd`, en UTC: leerlo en la zona del servidor lo corre un día.
 */
function utcCalendarDay(value: Date | string | null | undefined): DateTime {
  if (!value) return DateTime.invalid('fecha vacía')
  const parsed =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: 'utc' })
      : DateTime.fromISO(String(value).slice(0, 10), { zone: 'utc' })
  return parsed.startOf('day')
}

export default class AssistsService {
  private t: (key: string,params?: { [key: string]: string | number }) => string
  private i18n: I18n
  private localeToUse: string
  private businessUnits: BusinessUnit[] = []

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
    // Solo lo usan los formatos de fecha de los archivos descargables, que
    // salen siempre en el idioma de los reportes (no en el de la petición).
    this.localeToUse = REPORT_LOCALE
  }

  /**
   * Zona IANA del sitio del calendario en curso. La devuelve el sync junto con
   * cada calendario (`data.timeZone`); los reportes se recorren empleado por
   * empleado, así que un solo valor vivo basta y cada fila se formatea en la
   * hora del sitio y no en la del servidor.
   */
  private siteZone: string = resolveSiteTimeZone([]).zone

  /** Toma la zona con la que el sync calculó el calendario recién obtenido. */
  private adoptCalendarZone(data: { timeZone?: string } | null | undefined): void {
    this.siteZone = data?.timeZone ?? resolveSiteTimeZone([]).zone
  }

  /**
   * Prioriza el `businessUnitId` explícito del query sobre el scope del header.
   */
  private resolveBusinessUnitFilterIds(
    businessUnitId: number | undefined,
    allowedBusinessUnitIds: number[]
  ): number[] {
    if (businessUnitId && businessUnitId > 0) {
      return [businessUnitId]
    }
    return allowedBusinessUnitIds
  }

  /**
   * Resuelve el scope de BU requerido por employeeService.index sin tocar ese servicio.
   */
  private resolveExcelBusinessUnitScope(
    businessUnitId: number | undefined,
    allowedBusinessUnitIds: number[] = []
  ): { businessUnitFilterIds: number[]; resolvedBusinessUnitId: number } | null {
    const businessUnitFilterIds = this.resolveBusinessUnitFilterIds(
      businessUnitId,
      allowedBusinessUnitIds
    )
    const resolvedBusinessUnitId = businessUnitFilterIds[0]
    if (!resolvedBusinessUnitId || resolvedBusinessUnitId <= 0) {
      return null
    }
    return { businessUnitFilterIds, resolvedBusinessUnitId }
  }

  private buildExcelBusinessUnitScopeError() {
    return {
      status: 400,
      type: 'warning' as const,
      title: 'Parámetros inválidos',
      message: 'El scope de unidad de negocio es requerido para generar el reporte',
      error: 'MISSING_BUSINESS_UNIT_SCOPE',
    }
  }

  private async fetchEmployeesForExcelReport(
    employeeService: EmployeeService,
    filters: EmployeeFilterSearchInterface,
    departmentIds: number[],
    businessUnitId: number | undefined,
    allowedBusinessUnitIds: number[] = []
  ) {
    const scope = this.resolveExcelBusinessUnitScope(businessUnitId, allowedBusinessUnitIds)
    if (!scope) {
      return null
    }
    return employeeService.index(
      { ...filters, businessUnitId: scope.resolvedBusinessUnitId },
      departmentIds,
      scope.businessUnitFilterIds
    )
  }

  async getExcelByEmployeeAssistance(
    employee: Employee,
    filters: AssistEmployeeExcelFilterInterface
  ) {
    try {
      return await this.generateAssistanceEmployeeBuffer(
        employee,
        filters,
        async () => {
          /* sin progreso en el camino síncrono */
        }
      )
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: err.message,
      }
    }
  }

  /**
   * Genera el Excel de asistencias de un solo empleado (mismo layout de 20
   * columnas que `generateAssistanceAllBuffer`). Conserva `withTrashed` vía
   * el empleado ya cargado y señala baja en el layout.
   * Usado por jobs asíncronos (`assistance_employee`) y por el endpoint síncrono.
   */
  async generateAssistanceEmployeeBuffer(
    employee: Employee,
    filters: AssistEmployeeExcelFilterInterface,
    onProgress: (current: number, total: number) => Promise<void>
  ) {
    const filterDate = filters.filterDate
    const filterDateEnd = filters.filterDateEnd
    await onProgress(0, 1)

    const syncAssistsService = new SyncAssistsService(this.i18n)
    const result = await syncAssistsService.index(
      {
        date: filterDate,
        dateEnd: filterDateEnd,
        employeeID: employee.employeeId,
      },
      { page: 1, limit: 999999999999999 }
    )
    const data: any = result.data
    this.adoptCalendarZone(data)
    const rows = [] as AssistExcelRowInterface[]
    if (data) {
      const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
      const newRows = await this.addRowCalendar(employee, employeeCalendar)
      for await (const row of newRows) {
        rows.push(row)
      }
    }

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(this.t('assistance_report'))
    // Formato neutral: sin logotipo ni franjas de marca. La fila 1 se conserva
    // vacía con altura normal porque el resto de la hoja usa filas fijas.
    worksheet.mergeCells('A1:Q1')
    const titleRow = worksheet.addRow([this.t('assistance_report')])
    titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    titleRow.height = 42
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells('A2:Q2')
    const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
    periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
    periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
    periodRow.height = 30
    worksheet.mergeCells('A3:Q3')
    worksheet.views = frozenHeaderViews(4)
    this.addHeadRow(worksheet)
    const status = employee.deletedAt ? 'Terminated' : 'Active'
    await this.addRowToWorkSheet(rows, worksheet, status)
    await onProgress(1, 1)

    blankMissingTexts(workbook)
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      status: 201,
      type: 'success' as const,
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      buffer,
    }
  }

  async getExcelByEmployeeIncidentSummary(
    employee: Employee,
    filters: AssistEmployeeExcelFilterInterface
  ) {
    try {
      const employeeId = filters.employeeId
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const page = 1
      const limit = 999999999999999
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const result = await syncAssistsService.index(
        {
          date: filterDate,
          dateEnd: filterDateEnd,
          employeeID: employeeId,
        },
        { page, limit }
      )
      const data: any = result.data
      this.adoptCalendarZone(data)
      const rows = [] as AssistExcelRowInterface[]
      if (data) {
        const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
        let newRows = [] as AssistExcelRowInterface[]
        newRows = await this.addRowCalendar(employee, employeeCalendar)
        for await (const row of newRows) {
          rows.push(row)
        }
      }
      const workbook = new ExcelJS.Workbook()
      const rowsIncident = [] as AssistIncidentExcelRowInterface[]
      const worksheet = workbook.addWorksheet(this.t('incident_summary'))
      const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentToWorkSheet(worksheet, title)
      this.addHeadRowIncident(worksheet)
      const totalRowIncident = {} as AssistIncidentExcelRowInterface
      await this.cleanTotalByDepartment(totalRowIncident)
      const totalRowByDepartmentIncident = {} as AssistIncidentExcelRowInterface
      await this.cleanTotalByDepartment(totalRowByDepartmentIncident)
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      if (data) {
        const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
        let newRows = [] as AssistIncidentExcelRowInterface[]
        const incidentSummaryFilters: AssistIncidentSummaryCalendarExcelFilterInterface = {
          employee: employee,
          employeeCalendar:employeeCalendar,
          tardies: tardies,
          toleranceCountPerAbsences: toleranceCountPerAbsences,
        }
        newRows = await this.addRowIncidentCalendar(incidentSummaryFilters)
        for await (const row of newRows) {
          rowsIncident.push(row)
          await this.addTotalByDepartment(totalRowByDepartmentIncident, row)
        }
      }
      await this.addTotalRow(totalRowIncident, totalRowByDepartmentIncident)
      await rowsIncident.push(totalRowByDepartmentIncident)
      await rowsIncident.push(totalRowIncident)
      await this.addRowIncidentToWorkSheet(rowsIncident, worksheet)
      if (employee.deletedAt) {
        await this.paintEmployeeTerminated(worksheet, 'C', 4)
      }
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelByEmployeeIncidentSummaryPayroll(
    employee: Employee,
    filters: AssistEmployeeExcelFilterInterface
  ) {
    try {
      const employeeId = filters.employeeId
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const page = 1
      const limit = 999999999999999
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const result = await syncAssistsService.index(
        {
          date: filterDate,
          dateEnd: filterDateEnd,
          employeeID: employeeId,
          withOutExternal: true,
        },
        { page, limit }
      )
      const data: any = result.data
      this.adoptCalendarZone(data)
      const rows = [] as AssistExcelRowInterface[]
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      if (data) {
        const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
        let newRows = [] as AssistExcelRowInterface[]
        newRows = await this.addRowCalendar(employee, employeeCalendar)
        for await (const row of newRows) {
          rows.push(row)
        }
      }
      const workbook = new ExcelJS.Workbook()
      const rowsIncidentPayroll = [] as AssistIncidentPayrollExcelRowInterface[]
      const tradeName = await this.getTradeName()
      const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll_sheet'))
      const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentPayrollToWorkSheet(worksheet, titlePayroll)
      this.addHeadRowIncidentPayroll(worksheet)

      await this.getBusinessUnits()
      if (data) {
        const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
        let newRows = [] as AssistIncidentPayrollExcelRowInterface[]
        const incidentPayrollFilters: AssistIncidentPayrollCalendarExcelFilterInterface = {
          employee: employee,
          employeeCalendar: employeeCalendar,
          tardies: tardies,
          datePay: filters.filterDatePay,
          toleranceCountPerAbsences: toleranceCountPerAbsences,
        }
        newRows = await this.addRowIncidentPayrollCalendar(
          incidentPayrollFilters
        )
        for await (const row of newRows) {
          rowsIncidentPayroll.push(row)
        }
      }
      await this.addRowIncidentPayrollToWorkSheet(rowsIncidentPayroll, worksheet)
      await this.paintBorderAll(worksheet, rowsIncidentPayroll.length)
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelByPosition(
    filters: AssistPositionExcelFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const departmentId = filters.departmentId
      const positionId = filters.positionId
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const page = 1
      const limit = 999999999999999
      const employeeService = new EmployeeService(this.i18n)
      const resultEmployes = await this.fetchEmployeesForExcelReport(
        employeeService,
        {
          search: '',
          departmentId: departmentId,
          positionId: positionId,
          employeeWorkSchedule: '',
          page: page,
          limit: limit,
          ignoreDiscriminated: 0,
          ignoreExternal: 1,
        },
        [departmentId],
        filters.businessUnitId,
        allowedBusinessUnitIds
      )
      if (!resultEmployes) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const dataEmployes: any = resultEmployes
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const rows = [] as AssistExcelRowInterface[]
      for await (const employee of dataEmployes) {
        const result = await syncAssistsService.index(
          {
            date: filterDate,
            dateEnd: filterDateEnd,
            employeeID: employee.employeeId,
          },
          { page, limit }
        )
        const data: any = result.data
        this.adoptCalendarZone(data)
        if (data) {
          const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
          let newRows = [] as AssistExcelRowInterface[]
          newRows = await this.addRowCalendar(employee, employeeCalendar)
          for await (const row of newRows) {
            rows.push(row)
          }
        }
      }
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      let worksheet = workbook.addWorksheet(this.t('assistance_report'))
      // Formato neutral: sin logotipo ni franjas de marca. La fila 1 se conserva
      // vacía con altura normal porque el resto de la hoja usa filas fijas.
      worksheet.mergeCells('A1:P1')
      const titleRow = worksheet.addRow([this.t('assistance_report')])
      titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:P2')
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:P3')
      worksheet.views = frozenHeaderViews(4)
      // Añadir columnas de datos (encabezados)
      this.addHeadRow(worksheet)
      await this.addRowToWorkSheet(rows, worksheet)
      // hasta aquí era lo de asistencia
      const rowsIncident = [] as AssistIncidentExcelRowInterface[]
      worksheet = workbook.addWorksheet(this.t('incident_summary'))
      const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentToWorkSheet(worksheet, title)
      this.addHeadRowIncident(worksheet)
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      for await (const employee of dataEmployes) {
        const result = await syncAssistsService.index(
          {
            date: filterDate,
            dateEnd: filterDateEnd,
            employeeID: employee.employeeId,
          },
          { page, limit }
        )
        const data: any = result.data
        this.adoptCalendarZone(data)
        if (data) {
          const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
          let newRows = [] as AssistIncidentExcelRowInterface[]
          const incidentSummaryFilters: AssistIncidentSummaryCalendarExcelFilterInterface = {
            employee: employee,
            employeeCalendar:employeeCalendar,
            tardies: tardies,
            toleranceCountPerAbsences: toleranceCountPerAbsences,
          }
          newRows = await this.addRowIncidentCalendar(incidentSummaryFilters)
          for await (const row of newRows) {
            rowsIncident.push(row)
          }
          this.addRowIncidentExcelEmpty(rowsIncident)
          this.addRowIncidentExcelEmptyWithCode(rowsIncident)
        }
      }
      await this.addRowIncidentToWorkSheet(rowsIncident, worksheet)
      // hasta aquí era lo de asistencia
      // Crear un buffer del archivo Excel
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelByDepartmentAssistance(
    filters: AssistDepartmentExcelFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
      if (!scope) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const departmentId = filters.departmentId
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const page = 1
      const limit = 999999999999999
      const departmentService = new DepartmentService(this.i18n)
      const resultPositions = await departmentService.getPositions(departmentId, filters.userResponsibleId)
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const rows = [] as AssistExcelRowInterface[]
      for await (const position of resultPositions) {
        const employeeService = new EmployeeService(this.i18n)
        const resultEmployes = await this.fetchEmployeesForExcelReport(
          employeeService,
          {
            search: '',
            departmentId: departmentId,
            positionId: position.positionId,
            employeeWorkSchedule: '',
            page: page,
            limit: limit,
            ignoreDiscriminated: 0,
            ignoreExternal: 1,
            userResponsibleId: filters.userResponsibleId,
          },
          [departmentId],
          scope.resolvedBusinessUnitId,
          scope.businessUnitFilterIds
        )
        if (!resultEmployes) {
          return this.buildExcelBusinessUnitScopeError()
        }
        const dataEmployes: any = resultEmployes
        for await (const employee of dataEmployes) {
          const result = await syncAssistsService.index(
            {
              date: filterDate,
              dateEnd: filterDateEnd,
              employeeID: employee.employeeId,
            },
            { page, limit }
          )
          const data: any = result.data
          this.adoptCalendarZone(data)
          if (data) {
            const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
            let newRows = [] as AssistExcelRowInterface[]
            newRows = await this.addRowCalendar(employee, employeeCalendar)
            for await (const row of newRows) {
              rows.push(row)
            }
          }
        }
      }
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      let worksheet = workbook.addWorksheet(this.t('assistance_report'))
      // Formato neutral: sin logotipo ni franjas de marca. La fila 1 se conserva
      // vacía con altura normal porque el resto de la hoja usa filas fijas.
      worksheet.mergeCells('A1:P1')
      const titleRow = worksheet.addRow([this.t('assistance_report')])
      titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:P2')
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:P3')
      worksheet.views = frozenHeaderViews(4)
      // Añadir columnas de datos (encabezados)
      this.addHeadRow(worksheet)
      await this.addRowToWorkSheet(rows, worksheet)
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelByDepartmentIncidentSummary(
    filters: AssistDepartmentExcelFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
      if (!scope) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const departmentId = filters.departmentId
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const page = 1
      const limit = 999999999999999
      const departmentService = new DepartmentService(this.i18n)
      const resultPositions = await departmentService.getPositions(departmentId, filters.userResponsibleId)
      const syncAssistsService = new SyncAssistsService(this.i18n)
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      const rowsIncident = [] as AssistIncidentExcelRowInterface[]
      const worksheet = workbook.addWorksheet(this.t('incident_summary'))
      const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentToWorkSheet(worksheet, title)
      this.addHeadRowIncident(worksheet)
      const totalRowIncident = {} as AssistIncidentExcelRowInterface
      await this.cleanTotalByDepartment(totalRowIncident)
      const totalRowByDepartmentIncident = {} as AssistIncidentExcelRowInterface
      await this.cleanTotalByDepartment(totalRowByDepartmentIncident)
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      for await (const position of resultPositions) {
        const employeeService = new EmployeeService(this.i18n)
        const resultEmployes = await this.fetchEmployeesForExcelReport(
          employeeService,
          {
            search: '',
            departmentId: departmentId,
            positionId: position.positionId,
            employeeWorkSchedule: '',
            page: page,
            limit: limit,
            ignoreDiscriminated: 0,
            ignoreExternal: 1,
            userResponsibleId: filters.userResponsibleId,
          },
          [departmentId],
          scope.resolvedBusinessUnitId,
          scope.businessUnitFilterIds
        )
        if (!resultEmployes) {
          return this.buildExcelBusinessUnitScopeError()
        }
        const dataEmployes: any = resultEmployes
        for await (const employee of dataEmployes) {
          const result = await syncAssistsService.index(
            {
              date: filterDate,
              dateEnd: filterDateEnd,
              employeeID: employee.employeeId,
            },
            { page, limit }
          )
          const data: any = result.data
          this.adoptCalendarZone(data)
          if (data) {
            const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
            let newRows = [] as AssistIncidentExcelRowInterface[]
            const incidentSummaryFilters: AssistIncidentSummaryCalendarExcelFilterInterface = {
              employee: employee,
              employeeCalendar:employeeCalendar,
              tardies: tardies,
              toleranceCountPerAbsences: toleranceCountPerAbsences,
            }
            newRows = await this.addRowIncidentCalendar(incidentSummaryFilters)
            for await (const row of newRows) {
              rowsIncident.push(row)
              await this.addTotalByDepartment(totalRowByDepartmentIncident, row)
            }
          }
        }
      }
      await this.addTotalRow(totalRowIncident, totalRowByDepartmentIncident)
      await rowsIncident.push(totalRowByDepartmentIncident)
      await rowsIncident.push(totalRowIncident)
      await this.addRowIncidentToWorkSheet(rowsIncident, worksheet)
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelByDepartmentIncidentSummaryPayRoll(
    filters: AssistDepartmentExcelFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
      if (!scope) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const departmentId = filters.departmentId
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const page = 1
      const limit = 999999999999999
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const employeeService = new EmployeeService(this.i18n)
      const workbook = new ExcelJS.Workbook()
      const rowsIncidentPayroll = [] as AssistIncidentPayrollExcelRowInterface[]
      const tradeName = await this.getTradeName()
      const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll_sheet'))
      const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentPayrollToWorkSheet(worksheet, titlePayroll)
      this.addHeadRowIncidentPayroll(worksheet)
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      await this.getBusinessUnits()
      await this.appendIncidentPayrollRowsForDepartmentEmployees({
        departmentId,
        filterDate,
        filterDateEnd,
        filterDatePay: filters.filterDatePay ?? '',
        userResponsibleId: filters.userResponsibleId,
        businessUnitId: scope.resolvedBusinessUnitId,
        payrollBusinessUnitId: filters.payrollBusinessUnitId,
        branchNameIds: filters.branchNameIds,
        businessUnitFilterIds: scope.businessUnitFilterIds,
        employeeService,
        syncAssistsService,
        tardies,
        toleranceCountPerAbsences,
        rowsIncidentPayroll,
        page,
        limit,
      })
      await this.addRowIncidentPayrollToWorkSheet(rowsIncidentPayroll, worksheet)
      await this.paintBorderAll(worksheet, rowsIncidentPayroll.length)
      // Crear un buffer del archivo Excel
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelAllAssistance(
    filters: AssistExcelFilterInterface,
    departmentsList: Array<number>,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
      if (!scope) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const businessUnitFilterIds = scope.businessUnitFilterIds
      const departments = await Department.query()
        .whereNull('department_deleted_at')
        .whereIn('departmentId', departmentsList)
        .if(businessUnitFilterIds.length > 0, (query) => {
          query.whereIn('businessUnitId', businessUnitFilterIds)
        })
        .orderBy('departmentId')
      const rows = [] as AssistExcelRowInterface[]
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const departmentService = new DepartmentService(this.i18n)
      const employeeService = new EmployeeService(this.i18n)
      for await (const departmentRow of departments) {
        const departmentId = departmentRow.departmentId
        const page = 1
        const limit = 999999999999999
        const resultPositions = await departmentService.getPositions(departmentId, filters.userResponsibleId)
        const syncAssistsService = new SyncAssistsService(this.i18n)
        for await (const position of resultPositions) {
          const resultEmployes = await this.fetchEmployeesForExcelReport(
            employeeService,
            {
              search: '',
              departmentId: departmentId,
              positionId: position.positionId,
              page: page,
              limit: limit,
              employeeWorkSchedule: '',
              ignoreDiscriminated: 0,
              ignoreExternal: 1,
              userResponsibleId: filters.userResponsibleId,
              payrollBusinessUnitId: filters.payrollBusinessUnitId,
            },
            [departmentId],
            scope.resolvedBusinessUnitId,
            scope.businessUnitFilterIds
          )
          if (!resultEmployes) {
            return this.buildExcelBusinessUnitScopeError()
          }
          const dataEmployes: any = resultEmployes
          for await (const employee of dataEmployes) {
            const result = await syncAssistsService.index(
              {
                date: filterDate,
                dateEnd: filterDateEnd,
                employeeID: employee.employeeId,
              },
              { page, limit }
            )
            const data: any = result.data
            this.adoptCalendarZone(data)
            if (data) {
              const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
              let newRows = [] as AssistExcelRowInterface[]
              newRows = await this.addRowCalendar(employee, employeeCalendar)
              for await (const row of newRows) {
                rows.push(row)
              }
            }
          }
        }
      }
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      let worksheet = workbook.addWorksheet(this.t('assistance_report'))
      // Formato neutral: sin logotipo ni franjas de marca. La fila 1 se conserva
      // vacía con altura normal porque el resto de la hoja usa filas fijas.
      worksheet.mergeCells('A1:Q1')
      const titleRow = worksheet.addRow([this.t('assistance_report')])
      titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:Q2')
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:Q3')
      worksheet.views = frozenHeaderViews(4)
      // Añadir columnas de datos (encabezados)
      this.addHeadRow(worksheet)
      await this.addRowToWorkSheet(rows, worksheet)
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * Genera el buffer Excel de "todas las asistencias" con callback de progreso.
   * Reutiliza exactamente el mismo código que `getExcelAllAssistance` pero
   * acepta `allowedBusinessUnitIds` directamente (para uso en jobs asíncronos)
   * e invoca `onProgress(current, total)` tras procesar cada empleado.
   *
   * Calcula primero el total de empleados (un pase de conteo) para poder
   * reportar progreso real. Si el conteo falla, el callback recibe 0/0 y
   * el progreso queda indeterminado sin bloquear la generación.
   */
  async generateAssistanceAllBuffer(
    filters: import('../interfaces/assist_excel_filter_interface.js').AssistExcelFilterInterface,
    departmentsList: number[],
    allowedBusinessUnitIds: number[],
    onProgress: (current: number, total: number) => Promise<void>
  ) {
    const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
    if (!scope) {
      return this.buildExcelBusinessUnitScopeError()
    }
    const businessUnitFilterIds = scope.businessUnitFilterIds
    const departments = await Department.query()
      .whereNull('department_deleted_at')
      .whereIn('departmentId', departmentsList)
      .if(businessUnitFilterIds.length > 0, (query) => {
        query.whereIn('businessUnitId', businessUnitFilterIds)
      })
      .orderBy('departmentId')

    const departmentService = new DepartmentService(this.i18n)
    const employeeService = new EmployeeService(this.i18n)
    const filterDate = filters.filterDate
    const filterDateEnd = filters.filterDateEnd

    let progressTotal = 0
    try {
      for (const departmentRow of departments) {
        const positions = await departmentService.getPositions(departmentRow.departmentId, filters.userResponsibleId)
        for (const position of positions) {
          const emps: any = await this.fetchEmployeesForExcelReport(
            employeeService,
            {
              search: '',
              departmentId: departmentRow.departmentId,
              positionId: position.positionId,
              page: 1,
              limit: 999999999999999,
              employeeWorkSchedule: '',
              ignoreDiscriminated: 0,
              ignoreExternal: 1,
              userResponsibleId: filters.userResponsibleId,
              payrollBusinessUnitId: filters.payrollBusinessUnitId,
            },
            [departmentRow.departmentId],
            scope.resolvedBusinessUnitId,
            scope.businessUnitFilterIds
          )
          if (emps) progressTotal += Array.isArray(emps) ? emps.length : 0
        }
      }
    } catch {
      progressTotal = 0
    }

    const rows = [] as AssistExcelRowInterface[]
    let progressCurrent = 0

    for await (const departmentRow of departments) {
      const departmentId = departmentRow.departmentId
      const resultPositions = await departmentService.getPositions(departmentId, filters.userResponsibleId)
      const syncAssistsService = new SyncAssistsService(this.i18n)
      for await (const position of resultPositions) {
        const resultEmployes = await this.fetchEmployeesForExcelReport(
          employeeService,
          {
            search: '',
            departmentId: departmentId,
            positionId: position.positionId,
            page: 1,
            limit: 999999999999999,
            employeeWorkSchedule: '',
            ignoreDiscriminated: 0,
            ignoreExternal: 1,
            userResponsibleId: filters.userResponsibleId,
            payrollBusinessUnitId: filters.payrollBusinessUnitId,
          },
          [departmentId],
          scope.resolvedBusinessUnitId,
          scope.businessUnitFilterIds
        )
        if (!resultEmployes) {
          return this.buildExcelBusinessUnitScopeError()
        }
        const dataEmployes: any = resultEmployes
        for await (const employee of dataEmployes) {
          const result = await syncAssistsService.index(
            { date: filterDate, dateEnd: filterDateEnd, employeeID: employee.employeeId },
            { page: 1, limit: 999999999999999 }
          )
          const data: any = result.data
          this.adoptCalendarZone(data)
          if (data) {
            const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
            const newRows = await this.addRowCalendar(employee, employeeCalendar)
            for await (const row of newRows) {
              rows.push(row)
            }
          }
          progressCurrent++
          await onProgress(progressCurrent, progressTotal)
        }
      }
    }

    const workbook = new ExcelJS.Workbook()
    let worksheet = workbook.addWorksheet(this.t('assistance_report'))
    // Formato neutral: sin logotipo ni franjas de marca. La fila 1 se conserva
    // vacía con altura normal porque el resto de la hoja usa filas fijas.
    worksheet.mergeCells('A1:Q1')
    const titleRow = worksheet.addRow([this.t('assistance_report')])
    titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    titleRow.height = 42
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells('A2:Q2')
    const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
    periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
    periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
    periodRow.height = 30
    worksheet.mergeCells('A3:Q3')
    worksheet.views = frozenHeaderViews(4)
    this.addHeadRow(worksheet)
    await this.addRowToWorkSheet(rows, worksheet)
    blankMissingTexts(workbook)
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      status: 201,
      type: 'success' as const,
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      buffer,
    }
  }

  // ---------------------------------------------------------------------
  // Resumen de incidencias (USRH1785766125036) — port server-side del
  // builder client-side `AssistExcelService.getExcelIncidentSummary`.
  // Interfaces propias (`AssistIncidentSummaryV2*`) para no tocar la forma
  // de 19 columnas que sigue usando el builder 3 (nómina).
  // ---------------------------------------------------------------------

  /**
   * Construye el mapa `fecha-inicio-de-semana (ISO) → tope semanal legal`
   * para el periodo `[dateStart, dateEnd]`, resolviendo el motor de jornada
   * (`EffectiveService`) directamente (sin HTTP interno) para la unidad de
   * negocio del reporte. Una semana sin regla aplicable queda en `null`
   * (jornada no resuelta ↦ N/D para los empleados con días en esa semana).
   * No relanza: el Excel se genera completo aunque falte alguna regla.
   */
  private async buildIncidentSummaryWeekHoursByLawMap(
    dateStart: string,
    dateEnd: string,
    businessUnitId: number
  ): Promise<Map<string, number | null>> {
    const map = new Map<string, number | null>()
    const startISO = dateStart || dateEnd
    if (!startISO || !dateEnd || !businessUnitId) {
      return map
    }
    const effectiveService = new EffectiveService()
    let cursor = DateTime.fromISO(startISO).startOf('week')
    const end = DateTime.fromISO(dateEnd)
    while (cursor.isValid && cursor <= end) {
      const key = cursor.toISODate()
      if (key && !map.has(key)) {
        const rules = await effectiveService.getRulesForDate(businessUnitId, key)
        map.set(key, rules.effective ? rules.effective.maxWeeklyHours : null)
      }
      cursor = cursor.plus({ weeks: 1 })
    }
    return map
  }

  /**
   * Acumula un valor de "horas por ley" respetando el caso N/D: si el
   * acumulado o el valor entrante es `null` (jornada no resuelta), el total
   * queda en `null` y se reporta N/D. Un total de grupo nunca mezcla filas
   * resueltas con no resueltas.
   */
  private accumulateIncidentSummaryLawValue(
    accumulated: number | null,
    value: number | null
  ): number | null {
    if (accumulated === null || value === null) {
      return null
    }
    return accumulated + value
  }

  private formatIncidentSummaryTimeDifference(hoursDiff: number): string {
    const formatted = formatDecimalHours(Math.abs(hoursDiff))
    if (formatted === '00:00') {
      return '0:00'
    }
    return hoursDiff < 0 ? `-${formatted}` : `+${formatted}`
  }

  /**
   * Calcula las horas por ley del periodo del empleado iterando semana por
   * semana sobre sus días laborables. El tope de cada semana se toma del
   * `weekHoursByLawMap`. Devuelve `null` si alguna semana laborada del
   * periodo no tiene tope resuelto (jornada no resuelta ↦ N/D). Port 1:1
   * del builder client-side, sin "mejoras".
   */
  private calculateIncidentSummaryHoursByLaw(
    startDate: DateTime,
    endDate: DateTime,
    weekHoursByLawMap: Map<string, number | null>,
    employeeCalendar: AssistDayInterface[]
  ): number | null {
    let totalHours = 0
    const calendarMap = new Map<string, AssistDayInterface>()
    for (const day of employeeCalendar) {
      const dayDate = DateTime.fromISO(day.day).toISODate()
      if (dayDate) {
        calendarMap.set(dayDate, day)
      }
    }
    const tempStartDate = startDate.toJSDate()
    const tempEndDate = endDate.toJSDate()
    const weekStart = DateTime.fromJSDate(tempStartDate).startOf('week')
    let currentWeekStart = weekStart

    while (currentWeekStart <= DateTime.fromJSDate(tempEndDate)) {
      const weekEnd = currentWeekStart.endOf('week')
      const weekRangeStart = currentWeekStart > startDate ? currentWeekStart : startDate
      const weekRangeEnd = weekEnd < endDate ? weekEnd : endDate

      let workingDays = 0
      let currentDay = weekRangeStart
      while (currentDay <= weekRangeEnd) {
        const dayDate = currentDay.toISODate()
        if (dayDate) {
          const calendarDay = calendarMap.get(dayDate)
          if (
            calendarDay &&
            calendarDay.assist.dateShift &&
            !calendarDay.assist.isHoliday &&
            !calendarDay.assist.isRestDay &&
            !calendarDay.assist.isFutureDay &&
            !calendarDay.assist.isWorkDisabilityDate &&
            !calendarDay.assist.isVacationDate
          ) {
            workingDays++
          }
        }
        currentDay = currentDay.plus({ days: 1 })
      }

      let totalDaysInWeek = 0
      let tempDay = currentWeekStart
      let daysFoundInCalendar = 0
      while (tempDay <= weekEnd) {
        const dayDate = tempDay.toISODate()
        if (dayDate) {
          const calendarDay = calendarMap.get(dayDate)
          if (calendarDay && calendarDay.assist.dateShift && !calendarDay.assist.isRestDay) {
            totalDaysInWeek++
            daysFoundInCalendar++
          }
        }
        tempDay = tempDay.plus({ days: 1 })
      }

      if (daysFoundInCalendar < 5 && workingDays > 0) {
        let searchWeekStart = startDate.startOf('week')
        let searchWeekEnd = searchWeekStart.endOf('week')
        while (searchWeekStart <= endDate) {
          if (searchWeekStart >= startDate && searchWeekEnd <= endDate) {
            let tempDay2 = searchWeekStart
            let weekDaysCount = 0
            while (tempDay2 <= searchWeekEnd) {
              const dayDate = tempDay2.toISODate()
              if (dayDate) {
                const calendarDay = calendarMap.get(dayDate)
                if (calendarDay && calendarDay.assist.dateShift && !calendarDay.assist.isRestDay) {
                  weekDaysCount++
                }
              }
              tempDay2 = tempDay2.plus({ days: 1 })
            }
            if (weekDaysCount > 0) {
              totalDaysInWeek = weekDaysCount
              break
            }
          }
          searchWeekStart = searchWeekStart.plus({ weeks: 1 })
          searchWeekEnd = searchWeekStart.endOf('week')
        }
      }

      if (totalDaysInWeek === 0 && workingDays > 0) {
        totalDaysInWeek = workingDays
      }

      if (totalDaysInWeek > 0 && workingDays > 0) {
        const weekKey = currentWeekStart.toISODate()
        const weekCap = weekKey ? weekHoursByLawMap.get(weekKey) : undefined
        if (weekCap === null || weekCap === undefined) {
          return null
        }
        const hoursForThisWeek = (workingDays / totalDaysInWeek) * weekCap
        totalHours += hoursForThisWeek
      }

      currentWeekStart = currentWeekStart.plus({ weeks: 1 })
    }

    return totalHours
  }

  private cleanIncidentSummaryTotalRow(totalRow: AssistIncidentSummaryV2ExcelRowInterface) {
    totalRow.employeeId = ''
    totalRow.employeeName = 'null'
    totalRow.daysWorked = 0
    totalRow.daysOnTime = 0
    totalRow.tolerances = 0
    totalRow.delays = 0
    totalRow.earlyOuts = 0
    totalRow.rests = 0
    totalRow.sundayBonus = 0
    totalRow.vacations = 0
    totalRow.exeptions = 0
    totalRow.holidaysWorked = 0
    totalRow.restWorked = 0
    totalRow.faults = 0
    totalRow.delayFaults = 0
    totalRow.earlyOutsFaults = 0
    totalRow.totalFaults = 0
    totalRow.hoursWorked = 0
    totalRow.hoursAssigned = 0
    totalRow.timeDifferenceAssigned = 0
    totalRow.hoursByLaw = 0
    totalRow.timeDifferenceLaw = 0
    totalRow.toPay = 0
    totalRow.discountFaults = 0
  }

  private addIncidentSummaryDepartmentTotal(
    totalRow: AssistIncidentSummaryV2ExcelRowInterface,
    row: AssistIncidentSummaryV2ExcelRowInterface
  ) {
    totalRow.employeeId = ''
    totalRow.employeeName = ''
    totalRow.daysOnTime += row.daysOnTime
    totalRow.tolerances += row.tolerances
    totalRow.delays += row.delays
    totalRow.earlyOuts += row.earlyOuts
    totalRow.rests += row.rests
    totalRow.sundayBonus += row.sundayBonus
    totalRow.vacations += row.vacations
    totalRow.exeptions += row.exeptions
    totalRow.holidaysWorked += row.holidaysWorked
    totalRow.restWorked += row.restWorked
    totalRow.faults += row.faults
    totalRow.delayFaults += row.delayFaults
    totalRow.earlyOutsFaults += row.earlyOutsFaults
    totalRow.totalFaults += row.totalFaults
    totalRow.hoursWorked += row.hoursWorked
    totalRow.hoursAssigned += row.hoursAssigned || 0
    totalRow.timeDifferenceAssigned = (totalRow.hoursWorked || 0) - (totalRow.hoursAssigned || 0)
    totalRow.hoursByLaw = this.accumulateIncidentSummaryLawValue(totalRow.hoursByLaw, row.hoursByLaw)
    totalRow.timeDifferenceLaw = this.accumulateIncidentSummaryLawValue(
      totalRow.timeDifferenceLaw,
      row.timeDifferenceLaw
    )
    totalRow.toPay += row.toPay || 0
    totalRow.discountFaults += row.discountFaults
  }

  private addIncidentSummaryGrandTotal(
    totalRow: AssistIncidentSummaryV2ExcelRowInterface,
    rowByDepartment: AssistIncidentSummaryV2ExcelRowInterface
  ) {
    totalRow.employeeId = ''
    totalRow.employeeName = ''
    totalRow.department = this.t('totals').toUpperCase()
    totalRow.daysOnTime += rowByDepartment.daysOnTime
    totalRow.tolerances += rowByDepartment.tolerances
    totalRow.delays += rowByDepartment.delays
    totalRow.earlyOuts += rowByDepartment.earlyOuts
    totalRow.rests += rowByDepartment.rests
    totalRow.sundayBonus += rowByDepartment.sundayBonus
    totalRow.vacations += rowByDepartment.vacations
    totalRow.exeptions += rowByDepartment.exeptions
    totalRow.holidaysWorked += rowByDepartment.holidaysWorked
    totalRow.restWorked += rowByDepartment.restWorked
    totalRow.faults += rowByDepartment.faults
    totalRow.delayFaults += rowByDepartment.delayFaults
    totalRow.earlyOutsFaults += rowByDepartment.earlyOutsFaults
    totalRow.totalFaults += rowByDepartment.totalFaults
    totalRow.hoursWorked += rowByDepartment.hoursWorked
    totalRow.hoursAssigned += rowByDepartment.hoursAssigned || 0
    totalRow.timeDifferenceAssigned = (totalRow.hoursWorked || 0) - (totalRow.hoursAssigned || 0)
    totalRow.hoursByLaw = this.accumulateIncidentSummaryLawValue(totalRow.hoursByLaw, rowByDepartment.hoursByLaw)
    totalRow.timeDifferenceLaw = this.accumulateIncidentSummaryLawValue(
      totalRow.timeDifferenceLaw,
      rowByDepartment.timeDifferenceLaw
    )
    totalRow.toPay += rowByDepartment.toPay || 0
    totalRow.discountFaults += rowByDepartment.discountFaults
  }

  /**
   * Calcula la fila de un empleado para el resumen de incidencias V2. Port
   * 1:1 de `addRowIncidentCalendar` del builder client-side: corte
   * `dateEnd`, cascada tolerancias→retardos→faltas, `hoursAssigned` (turno
   * menos comida no computable), `hoursWorked` (trabajado menos comida),
   * reforma 40h y `toPay`/`discountFaults` desde `dailySalary`.
   */
  private buildIncidentSummaryRow(
    filters: AssistIncidentSummaryV2CalendarExcelFilterInterface
  ): AssistIncidentSummaryV2ExcelRowInterface {
    // TODO(USRH1788466831291): misma regla que #utils/org_alias_display.
    // Converger al helper cuando se toque este reporte.
    let department = filters.employee.department?.departmentAlias
      ? filters.employee.department.departmentAlias
      : ''
    department =
      department === '' && filters.employee.department?.departmentName
        ? filters.employee.department.departmentName
        : department
    let daysWorked = 0
    let daysOnTime = 0
    let tolerances = 0
    let delays = 0
    let earlyOuts = 0
    let rests = 0
    let sundayBonus = 0
    let vacations = 0
    let holidaysWorked = 0
    let restWorked = 0
    let faults = 0
    let hoursWorked = 0
    let hoursAssigned = 0
    const dateEndFormat = new Date(filters.dateEnd)
    const exceptions: ShiftExceptionInterface[] = []
    let firstDate: DateTime | null = null

    for (const calendar of filters.employeeCalendar) {
      const date = new Date(calendar.day)
      if (date > dateEndFormat) {
        continue
      }
      if (!firstDate) {
        firstDate = DateTime.fromISO(calendar.day)
      }
      if (calendar.assist.isFutureDay) {
        continue
      }
      let faultProcessed = false
      let holidayWorked = false
      if (calendar.assist.isHoliday && calendar.assist.checkIn) {
        holidaysWorked += 1
        holidayWorked = true
      }
      if (calendar.assist.exceptions.length > 0) {
        for (const exception of calendar.assist.exceptions) {
          if (!exception.exceptionType) {
            continue
          }
          const exceptionTypeSlug = exception.exceptionType.exceptionTypeSlug
          if (exceptionTypeSlug !== 'rest-day' && exceptionTypeSlug !== 'vacation') {
            exceptions.push(exception)
          }
          if (exceptionTypeSlug === 'descanso-laborado' && !holidayWorked) {
            if (
              exception.shiftExceptionEnjoymentOfSalary &&
              exception.shiftExceptionEnjoymentOfSalary === 1 &&
              calendar.assist.checkIn
            ) {
              restWorked += 1
            }
          }
          if (exceptionTypeSlug === 'absence-from-work' && exception.shiftExceptionEnjoymentOfSalary !== 1) {
            faultProcessed = true
            if (calendar.assist.dateShift && calendar.assist.dateShift.shiftAccumulatedFault > 0) {
              faults += calendar.assist.dateShift.shiftAccumulatedFault
            } else {
              faults += 1
            }
          }
        }
      }
      const firstCheck = this.chekInTime(calendar)
      if (calendar.assist.dateShift) {
        daysWorked += 1
        if (
          !calendar.assist.isRestDay &&
          !calendar.assist.isFutureDay &&
          !calendar.assist.isHoliday &&
          !calendar.assist.isVacationDate &&
          !calendar.assist.isWorkDisabilityDate
        ) {
          const shiftActiveHours = calendar.assist.dateShift.shiftActiveHours
            ? Number.parseFloat(calendar.assist.dateShift.shiftActiveHours.toString())
            : 0
          hoursAssigned += shiftActiveHours
          if (calendar.assist.dateShift?.shiftCompensableLunchSchedule !== 1) {
            const lunchTimeHours = (calendar.assist.dateShift.shiftLunchTime || 0) / 60
            hoursAssigned -= lunchTimeHours
          }
        }
        if (calendar.assist.checkInStatus !== 'fault') {
          if (calendar.assist.checkInStatus === 'ontime') {
            daysOnTime += 1
          } else if (calendar.assist.checkInStatus === 'tolerance') {
            tolerances += 1
          } else if (calendar.assist.checkInStatus === 'delay') {
            delays += 1
          }
        }
        if (calendar.assist.checkOutStatus !== 'fault' && calendar.assist.checkOutStatus === 'delay') {
          earlyOuts += 1
        }
        if (
          calendar.assist.isSundayBonus &&
          (calendar.assist.checkIn ||
            calendar.assist.checkOut ||
            (calendar.assist.assitFlatList && calendar.assist.assitFlatList.length > 0))
        ) {
          sundayBonus += 1
        }
        if (calendar.assist.isRestDay && !firstCheck) {
          rests += 1
        }
        if (calendar.assist.isVacationDate) {
          vacations += 1
        }
        if (calendar.assist.checkInStatus === 'fault' && !calendar.assist.isRestDay && !faultProcessed) {
          if (calendar.assist.dateShift && calendar.assist.dateShift.shiftAccumulatedFault > 0) {
            faults += calendar.assist.dateShift.shiftAccumulatedFault
          } else {
            faults += 1
          }
        }
      }
      const checkInTime = calendar.assist.checkIn?.assistPunchTimeUtc
      const checkOutTime = calendar.assist.checkOut?.assistPunchTimeUtc
      const firstCheckTime = checkInTime ? toInstant(checkInTime) : null
      const lastCheckTime = checkOutTime ? toInstant(checkOutTime) : null
      if (firstCheckTime && lastCheckTime && firstCheckTime.isValid && lastCheckTime.isValid) {
        const duration = lastCheckTime.diff(firstCheckTime, 'minutes')
        const hours = Math.floor(duration.as('minutes') / 60)
        const minutes = duration.as('minutes') % 60
        hoursWorked += hours + minutes / 60
      }
      if (calendar.assist.dateShift?.shiftCompensableLunchSchedule !== 1) {
        const checkInLunch = calendar.assist.checkEatIn?.assistPunchTimeUtc
          ? toInstant(calendar.assist.checkEatIn.assistPunchTimeUtc)
          : null
        const checkOutLunch = calendar.assist.checkEatOut?.assistPunchTimeUtc
          ? toInstant(calendar.assist.checkEatOut.assistPunchTimeUtc)
          : null
        if (checkInLunch && checkOutLunch) {
          const durationInMinutes = checkOutLunch.diff(checkInLunch, 'minutes').as('minutes')
          hoursWorked -= durationInMinutes / 60
        }
      }
    }

    const delayTolerances = this.getFaultsFromDelays(tolerances, filters.toleranceCountPerAbsences)
    delays += delayTolerances
    const delayFaults = this.getFaultsFromDelays(delays, filters.tardies)
    const earlyOutsFaults = this.getFaultsFromDelays(earlyOuts, filters.tardies)
    const timeDifferenceAssigned = hoursWorked - hoursAssigned

    let hoursByLaw: number | null = 0
    let timeDifferenceLaw: number | null = 0
    if (firstDate) {
      const endDate = DateTime.fromISO(filters.dateEnd)
      const resolvedHoursByLaw = this.calculateIncidentSummaryHoursByLaw(
        firstDate,
        endDate,
        filters.weekHoursByLawMap,
        filters.employeeCalendar
      )
      hoursByLaw = resolvedHoursByLaw
      timeDifferenceLaw = resolvedHoursByLaw === null ? null : hoursWorked - resolvedHoursByLaw
    }

    const dailySalary = filters.employee.dailySalary || 0
    const totalFaultsForPay = faults + delayFaults + earlyOutsFaults

    return {
      workBusinessUnit: filters.employee.businessUnit?.businessUnitName || '',
      payrollBusinessUnit: filters.employee.payrollBusinessUnit?.businessUnitName || '',
      employeeId: filters.employee.employeePayrollCode?.toString() || '',
      employeeName: reportFullName(
        filters.employee.person?.personFirstname,
        filters.employee.person?.personLastname,
        filters.employee.person?.personSecondLastname
      ),
      department,
      daysWorked,
      daysOnTime,
      tolerances,
      delays,
      earlyOuts,
      rests,
      sundayBonus,
      vacations,
      exeptions: exceptions.length,
      holidaysWorked,
      restWorked,
      faults,
      delayFaults,
      earlyOutsFaults,
      totalFaults: totalFaultsForPay,
      hoursWorked,
      hoursAssigned,
      timeDifferenceAssigned,
      hoursByLaw,
      timeDifferenceLaw,
      toPay: dailySalary * daysWorked - dailySalary * totalFaultsForPay,
      discountFaults: dailySalary * totalFaultsForPay,
    }
  }

  /**
   * Título del resumen de incidencias V2 (formato neutral, sin logo): B1 bold 18 + merge
   * dinámico hasta Z/AA/AB según las columnas salariales habilitadas por el
   * servidor (nunca por el cliente).
   */
  private addTitleIncidentSummaryV2Sheet(
    worksheet: ExcelJS.Worksheet,
    title: string,
    canDisplayPaymentsSummary: boolean,
    canDisplayDiscountsSummary: boolean
  ) {
    // Sin logo: la fila 1 solo lleva el título, con altura acorde a la fuente
    worksheet.getRow(1).height = 30
    worksheet.getCell('B1').value = title
    worksheet.getCell('B1').font = { bold: true, size: 18, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    worksheet.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' }
    let lastColumn = 'Z'
    if (canDisplayPaymentsSummary) {
      lastColumn = 'AA'
    }
    if (canDisplayDiscountsSummary) {
      lastColumn = canDisplayPaymentsSummary ? 'AB' : 'AA'
    }
    worksheet.mergeCells(`B1:${lastColumn}1`)
    worksheet.views = frozenHeaderViews(3)
    worksheet.addRow([])
  }

  /** Encabezado del resumen de incidencias V2: 25 columnas base + `to_pay`/`discounts` condicionales. */
  private addHeadRowIncidentSummaryV2(
    worksheet: ExcelJS.Worksheet,
    canDisplayPaymentsSummary: boolean,
    canDisplayDiscountsSummary: boolean
  ) {
    const headers = [
      this.t('work_business_unit'),
      this.t('payroll_business_unit'),
      this.t('department'),
      this.t('report_employee_id'),
      this.t('report_employee_name'),
      this.t('days_worked'),
      this.t('on_time'),
      this.t('tolerances'),
      this.t('delays'),
      this.t('early_outs'),
      this.t('rests'),
      this.t('sunday_bonus'),
      this.t('vacations'),
      this.t('exceptions'),
      this.t('holidays_worked'),
      this.t('rest_worked'),
      this.t('faults'),
      this.t('delays_faults'),
      this.t('early_outs_faults'),
      this.t('total_faults'),
      this.t('total_hours_worked'),
      this.t('hours_assigned'),
      this.t('time_difference_assigned'),
      this.t('hours_by_law'),
      this.t('time_difference_law'),
    ]
    if (canDisplayPaymentsSummary) {
      headers.push(this.t('to_pay'))
    }
    if (canDisplayDiscountsSummary) {
      headers.push(this.t('discounts'))
    }
    const headerRow = worksheet.addRow(headers)
    const totalColumns = headers.length
    for (let col = 1; col <= totalColumns; col++) {
      worksheet.getCell(3, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    const widths: Array<[number, number, 'left' | 'center']> = [
      [1, 23, 'center'],
      [2, 16, 'center'],
      [3, 32, 'left'],
      [4, 16, 'center'],
      [5, 16, 'center'],
      [6, 16, 'center'],
      [7, 16, 'center'],
      [8, 16, 'center'],
      [9, 16, 'center'],
      [10, 16, 'center'],
      [11, 16, 'center'],
      [12, 16, 'center'],
      [13, 16, 'center'],
      [14, 16, 'center'],
      [15, 16, 'center'],
      [16, 16, 'center'],
      [17, 16, 'center'],
      [18, 16, 'center'],
      [19, 16, 'center'],
      [20, 16, 'center'],
      [21, 20, 'center'],
      [22, 20, 'center'],
      [23, 20, 'center'],
      [24, 20, 'center'],
      [25, 20, 'center'],
    ]
    for (const [col, width, align] of widths) {
      const column = worksheet.getColumn(col)
      column.width = width
      column.alignment = { vertical: 'middle', horizontal: align }
    }
    let colIndex = 26
    if (canDisplayPaymentsSummary) {
      const column = worksheet.getColumn(colIndex)
      column.width = 20
      column.alignment = { vertical: 'middle', horizontal: 'center' }
      colIndex++
    }
    if (canDisplayDiscountsSummary) {
      const column = worksheet.getColumn(colIndex)
      column.width = 20
      column.alignment = { vertical: 'middle', horizontal: 'center' }
    }
  }

  /**
   * Escribe las filas del resumen de incidencias V2, con merge vertical de
   * departamento en la columna C (fill `subheaderFill`) y fila de totales
   * (fill `totalFill`), ambos de la paleta neutral. Los N/D de horas por ley se renderizan con la llave
   * `hours_by_law_not_resolved`.
   */
  private addIncidentSummaryRowsToWorksheet(
    rows: AssistIncidentSummaryV2ExcelRowInterface[],
    worksheet: ExcelJS.Worksheet,
    canDisplayPaymentsSummary: boolean,
    canDisplayDiscountsSummary: boolean
  ) {
    let rowCount = 5
    let currentDepartment = ''
    let currentDepartmentRow = 5
    const totalColumns = 25 + (canDisplayPaymentsSummary ? 1 : 0) + (canDisplayDiscountsSummary ? 1 : 0)
    for (const rowData of rows) {
      if (rowData.employeeName === 'null') {
        continue
      }
      if (currentDepartment !== rowData.department && rowData.department) {
        if (currentDepartment !== '') {
          worksheet.mergeCells(`C${currentDepartmentRow}:C${rowCount - 3}`)
          for (let rowCurrent = currentDepartmentRow; rowCurrent < rowCount - 2; rowCurrent++) {
            const cell = worksheet.getCell(rowCurrent, 3)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NEUTRAL_ARGB.subheaderFill } }
            cell.font = { color: { argb: REPORT_NEUTRAL_ARGB.text } }
          }
        }
        currentDepartment = rowData.department
        currentDepartmentRow = rowCount - 1
      }
      const rowValues: Array<string | number> = [
        rowData.workBusinessUnit,
        rowData.payrollBusinessUnit,
        rowData.department,
        rowData.employeeId,
        rowData.employeeName,
        rowData.daysWorked,
        rowData.daysOnTime,
        rowData.tolerances,
        rowData.delays,
        rowData.earlyOuts,
        rowData.rests,
        rowData.sundayBonus,
        rowData.vacations,
        rowData.exeptions,
        rowData.holidaysWorked,
        rowData.restWorked,
        rowData.faults,
        rowData.delayFaults,
        rowData.earlyOutsFaults,
        rowData.totalFaults,
        this.decimalToTimeString(rowData.hoursWorked),
        this.decimalToTimeString(rowData.hoursAssigned || 0),
        this.formatIncidentSummaryTimeDifference(rowData.timeDifferenceAssigned || 0),
        rowData.hoursByLaw === null
          ? this.t('hours_by_law_not_resolved')
          : this.decimalToTimeString(rowData.hoursByLaw || 0),
        rowData.timeDifferenceLaw === null
          ? this.t('hours_by_law_not_resolved')
          : this.formatIncidentSummaryTimeDifference(rowData.timeDifferenceLaw || 0),
      ]
      if (canDisplayPaymentsSummary) {
        rowValues.push(rowData.toPay || 0)
      }
      if (canDisplayDiscountsSummary) {
        rowValues.push(rowData.discountFaults)
      }
      worksheet.addRow(rowValues)
      if (!rowData.employeeName && rowData.employeeId === '') {
        for (let col = 1; col <= totalColumns; col++) {
          const cell = worksheet.getCell(rowCount - 1, col)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NEUTRAL_ARGB.subheaderFill } }
          cell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
        }
      }
      if (rowData.department === this.t('totals').toUpperCase()) {
        for (let col = 1; col <= totalColumns; col++) {
          const cell = worksheet.getCell(rowCount - 1, col)
          const row = worksheet.getRow(rowCount - 1)
          row.height = 30
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NEUTRAL_ARGB.totalFill } }
          cell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
        }
      }
      rowCount += 1
    }
  }

  /**
   * Genera el buffer del resumen de incidencias para toda la empresa
   * (job asíncrono `assistance_incident_summary`). Las columnas de pagos y
   * descuentos las decide EXCLUSIVAMENTE el servidor (`canDisplayPaymentsSummary`
   * / `canDisplayDiscountsSummary`, resueltas vía `RoleService.hasAccess` en
   * el controlador) — nunca un flag del cliente.
   */
  async generateIncidentSummaryBuffer(
    filters: AssistExcelFilterInterface,
    departmentsList: number[],
    allowedBusinessUnitIds: number[],
    canDisplayPaymentsSummary: boolean,
    canDisplayDiscountsSummary: boolean,
    onProgress: (current: number, total: number) => Promise<void>
  ) {
    const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
    if (!scope) {
      return this.buildExcelBusinessUnitScopeError()
    }
    const businessUnitFilterIds = scope.businessUnitFilterIds
    const departments = await Department.query()
      .whereNull('department_deleted_at')
      .whereIn('departmentId', departmentsList)
      .if(businessUnitFilterIds.length > 0, (query) => {
        query.whereIn('businessUnitId', businessUnitFilterIds)
      })
      .orderBy('departmentId')

    const departmentService = new DepartmentService(this.i18n)
    const employeeService = new EmployeeService(this.i18n)
    const filterDate = filters.filterDate
    const filterDateEnd = filters.filterDateEnd
    const tardies = await this.getTardiesTolerance()
    const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
    const weekHoursByLawMap = await this.buildIncidentSummaryWeekHoursByLawMap(
      filterDate,
      filterDateEnd,
      scope.resolvedBusinessUnitId
    )

    let progressTotal = 0
    try {
      for (const departmentRow of departments) {
        const positions = await departmentService.getPositions(departmentRow.departmentId, filters.userResponsibleId)
        for (const position of positions) {
          const emps: any = await this.fetchEmployeesForExcelReport(
            employeeService,
            {
              search: '',
              departmentId: departmentRow.departmentId,
              positionId: position.positionId,
              page: 1,
              limit: 999999999999999,
              employeeWorkSchedule: '',
              ignoreDiscriminated: 0,
              ignoreExternal: 1,
              userResponsibleId: filters.userResponsibleId,
              payrollBusinessUnitId: filters.payrollBusinessUnitId,
            },
            [departmentRow.departmentId],
            scope.resolvedBusinessUnitId,
            scope.businessUnitFilterIds
          )
          if (emps) progressTotal += Array.isArray(emps) ? emps.length : 0
        }
      }
    } catch {
      progressTotal = 0
    }

    const rowsIncident: AssistIncidentSummaryV2ExcelRowInterface[] = []
    const totalRowIncident = {} as AssistIncidentSummaryV2ExcelRowInterface
    this.cleanIncidentSummaryTotalRow(totalRowIncident)
    let progressCurrent = 0

    for await (const departmentRow of departments) {
      const departmentId = departmentRow.departmentId
      const totalRowByDepartmentIncident = {} as AssistIncidentSummaryV2ExcelRowInterface
      this.cleanIncidentSummaryTotalRow(totalRowByDepartmentIncident)
      let hasEmployees = false
      const resultPositions = await departmentService.getPositions(departmentId, filters.userResponsibleId)
      const syncAssistsService = new SyncAssistsService(this.i18n)
      for await (const position of resultPositions) {
        const resultEmployes = await this.fetchEmployeesForExcelReport(
          employeeService,
          {
            search: '',
            departmentId: departmentId,
            positionId: position.positionId,
            page: 1,
            limit: 999999999999999,
            employeeWorkSchedule: '',
            ignoreDiscriminated: 0,
            ignoreExternal: 1,
            userResponsibleId: filters.userResponsibleId,
            payrollBusinessUnitId: filters.payrollBusinessUnitId,
          },
          [departmentId],
          scope.resolvedBusinessUnitId,
          scope.businessUnitFilterIds
        )
        if (!resultEmployes) {
          return this.buildExcelBusinessUnitScopeError()
        }
        const dataEmployes: any = resultEmployes
        for await (const employee of dataEmployes) {
          const result = await syncAssistsService.index(
            { date: filterDate, dateEnd: filterDateEnd, employeeID: employee.employeeId },
            { page: 1, limit: 999999999999999 }
          )
          const data: any = result.data
          this.adoptCalendarZone(data)
          if (data) {
            hasEmployees = true
            const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
            const row = this.buildIncidentSummaryRow({
              employee,
              employeeCalendar,
              tardies,
              toleranceCountPerAbsences,
              dateEnd: filterDateEnd,
              weekHoursByLawMap,
            })
            this.addIncidentSummaryDepartmentTotal(totalRowByDepartmentIncident, row)
            rowsIncident.push(row)
          }
          progressCurrent++
          await onProgress(progressCurrent, progressTotal)
        }
      }
      if (hasEmployees) {
        rowsIncident.push(JSON.parse(JSON.stringify(totalRowByDepartmentIncident)))
        this.addIncidentSummaryGrandTotal(totalRowIncident, totalRowByDepartmentIncident)
      }
    }
    rowsIncident.push(totalRowIncident)

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(this.t('incident_summary'))
    const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
    this.addTitleIncidentSummaryV2Sheet(
      worksheet,
      title,
      canDisplayPaymentsSummary,
      canDisplayDiscountsSummary
    )
    this.addHeadRowIncidentSummaryV2(worksheet, canDisplayPaymentsSummary, canDisplayDiscountsSummary)
    this.addIncidentSummaryRowsToWorksheet(rowsIncident, worksheet, canDisplayPaymentsSummary, canDisplayDiscountsSummary)

    blankMissingTexts(workbook)
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      status: 201,
      type: 'success' as const,
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      buffer,
    }
  }

  /**
   * Genera el buffer del resumen de incidencias para un solo empleado
   * (job asíncrono `assistance_incident_summary` en la ruta by-employee).
   * Respeta `withTrashed` vía el empleado ya cargado (baja fuera de scope
   * no se distingue: no-oráculo del USRH1785766125028).
   */
  async generateIncidentSummaryEmployeeBuffer(
    employee: Employee,
    filters: AssistEmployeeExcelFilterInterface,
    canDisplayPaymentsSummary: boolean,
    canDisplayDiscountsSummary: boolean,
    onProgress: (current: number, total: number) => Promise<void>
  ) {
    const filterDate = filters.filterDate
    const filterDateEnd = filters.filterDateEnd
    await onProgress(0, 1)

    const syncAssistsService = new SyncAssistsService(this.i18n)
    const result = await syncAssistsService.index(
      { date: filterDate, dateEnd: filterDateEnd, employeeID: employee.employeeId },
      { page: 1, limit: 999999999999999 }
    )
    const data: any = result.data
    this.adoptCalendarZone(data)
    const rowsIncident: AssistIncidentSummaryV2ExcelRowInterface[] = []
    const totalRowIncident = {} as AssistIncidentSummaryV2ExcelRowInterface
    this.cleanIncidentSummaryTotalRow(totalRowIncident)
    const totalRowByDepartmentIncident = {} as AssistIncidentSummaryV2ExcelRowInterface
    this.cleanIncidentSummaryTotalRow(totalRowByDepartmentIncident)
    const tardies = await this.getTardiesTolerance()
    const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
    const weekHoursByLawMap = await this.buildIncidentSummaryWeekHoursByLawMap(
      filterDate,
      filterDateEnd,
      employee.businessUnitId
    )

    if (data) {
      const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
      const row = this.buildIncidentSummaryRow({
        employee,
        employeeCalendar,
        tardies,
        toleranceCountPerAbsences,
        dateEnd: filterDateEnd,
        weekHoursByLawMap,
      })
      rowsIncident.push(row)
      this.addIncidentSummaryDepartmentTotal(totalRowByDepartmentIncident, row)
    }
    this.addIncidentSummaryGrandTotal(totalRowIncident, totalRowByDepartmentIncident)
    rowsIncident.push(totalRowByDepartmentIncident)
    rowsIncident.push(totalRowIncident)

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(this.t('incident_summary'))
    const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
    this.addTitleIncidentSummaryV2Sheet(
      worksheet,
      title,
      canDisplayPaymentsSummary,
      canDisplayDiscountsSummary
    )
    this.addHeadRowIncidentSummaryV2(worksheet, canDisplayPaymentsSummary, canDisplayDiscountsSummary)
    this.addIncidentSummaryRowsToWorksheet(rowsIncident, worksheet, canDisplayPaymentsSummary, canDisplayDiscountsSummary)
    await onProgress(1, 1)

    blankMissingTexts(workbook)
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      status: 201,
      type: 'success' as const,
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      buffer,
    }
  }

  /**
   * Genera el buffer del reporte de incidencias de nómina de toda la
   * empresa (job asíncrono `assistance_incident_summary_payroll` sin
   * `employeeId`, USRH1785766125045). Reutiliza SIN CAMBIOS el motor de
   * cálculo ya existente (`appendIncidentPayrollRowsForDepartmentEmployees`,
   * `addRowIncidentPayrollCalendar`, motor `PayrollOvertime*`, elegibilidad,
   * persistencia de asignaciones de HE): esta historia solo cambia la
   * forma de entrega (job asíncrono con progreso), nunca el cálculo.
   */
  async generateIncidentSummaryPayrollBuffer(
    filters: AssistExcelFilterInterface,
    departmentsList: Array<number>,
    allowedBusinessUnitIds: number[],
    onProgress: (current: number, total: number) => Promise<void>
  ) {
    const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
    if (!scope) {
      return this.buildExcelBusinessUnitScopeError()
    }
    const businessUnitFilterIds = scope.businessUnitFilterIds
    const departments = await Department.query()
      .whereNull('department_deleted_at')
      .whereIn('departmentId', departmentsList)
      .if(businessUnitFilterIds.length > 0, (query) => {
        query.whereIn('businessUnitId', businessUnitFilterIds)
      })
      .orderBy('departmentId')
    const filterDate = filters.filterDate
    const filterDateEnd = filters.filterDateEnd
    const employeeService = new EmployeeService(this.i18n)
    const tardies = await this.getTardiesTolerance()
    const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
    await this.getBusinessUnits()

    // Primera pasada solo para estimar el total del progreso (no altera el
    // cálculo del reporte; si falla, el progreso queda indeterminado).
    let progressTotal = 0
    try {
      for (const departmentRow of departments) {
        const countResult = await this.fetchEmployeesForExcelReport(
          employeeService,
          {
            search: '',
            departmentId: departmentRow.departmentId,
            positionId: 0,
            employeeWorkSchedule: '',
            page: 1,
            limit: 999999999999999,
            orderBy: 'name',
            orderDirection: 'ascend',
            ignoreDiscriminated: 1,
            ignoreExternal: 1,
            onlyPayroll: false,
            userResponsibleId: filters.userResponsibleId,
            payrollBusinessUnitId: filters.payrollBusinessUnitId,
            branchNameIds: filters.branchNameIds,
          },
          [departmentRow.departmentId],
          scope.resolvedBusinessUnitId,
          scope.businessUnitFilterIds
        )
        if (countResult) progressTotal += countResult.all().length
      }
    } catch {
      progressTotal = 0
    }

    const workbook = new ExcelJS.Workbook()
    const rowsIncidentPayroll = [] as AssistIncidentPayrollExcelRowInterface[]
    const tradeName = await this.getTradeName()
    const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll_sheet'))
    const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
    this.addTitleIncidentPayrollToWorkSheet(worksheet, titlePayroll)
    this.addHeadRowIncidentPayroll(worksheet)
    const syncAssistsService = new SyncAssistsService(this.i18n)
    let progressCurrent = 0
    for await (const departmentRow of departments) {
      const departmentId = departmentRow.departmentId
      await this.appendIncidentPayrollRowsForDepartmentEmployees({
        departmentId,
        filterDate,
        filterDateEnd,
        filterDatePay: filters.filterDatePay ?? '',
        userResponsibleId: filters.userResponsibleId,
        businessUnitId: scope.resolvedBusinessUnitId,
        payrollBusinessUnitId: filters.payrollBusinessUnitId,
        branchNameIds: filters.branchNameIds,
        businessUnitFilterIds: scope.businessUnitFilterIds,
        employeeService,
        syncAssistsService,
        tardies,
        toleranceCountPerAbsences,
        rowsIncidentPayroll,
        page: 1,
        limit: 999999999999999,
        onEmployeeIterated: async () => {
          progressCurrent++
          await onProgress(progressCurrent, progressTotal)
        },
      })
    }
    await this.addRowIncidentPayrollToWorkSheet(rowsIncidentPayroll, worksheet)
    await this.paintBorderAll(worksheet, rowsIncidentPayroll.length)

    blankMissingTexts(workbook)
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      status: 201,
      type: 'success' as const,
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      buffer,
    }
  }

  /**
   * Genera el buffer del reporte de incidencias de nómina de un solo
   * empleado (job asíncrono `assistance_incident_summary_payroll` en la
   * ruta by-employee, USRH1785766125045). Reutiliza SIN CAMBIOS
   * `addRowIncidentPayrollCalendar` (mismo motor que la variante de toda
   * la empresa). Respeta `withTrashed` vía el empleado ya cargado
   * (no-oráculo del USRH1785766125028).
   */
  async generateIncidentSummaryPayrollEmployeeBuffer(
    employee: Employee,
    filters: AssistEmployeeExcelFilterInterface,
    onProgress: (current: number, total: number) => Promise<void>
  ) {
    await onProgress(0, 1)
    const filterDate = filters.filterDate
    const filterDateEnd = filters.filterDateEnd
    const syncAssistsService = new SyncAssistsService(this.i18n)
    const result = await syncAssistsService.index(
      {
        date: filterDate,
        dateEnd: filterDateEnd,
        employeeID: filters.employeeId,
        withOutExternal: true,
      },
      { page: 1, limit: 999999999999999 }
    )
    const data: any = result.data
    this.adoptCalendarZone(data)
    const tardies = await this.getTardiesTolerance()
    const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()

    const workbook = new ExcelJS.Workbook()
    const rowsIncidentPayroll = [] as AssistIncidentPayrollExcelRowInterface[]
    const tradeName = await this.getTradeName()
    const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll_sheet'))
    const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
    this.addTitleIncidentPayrollToWorkSheet(worksheet, titlePayroll)
    this.addHeadRowIncidentPayroll(worksheet)

    await this.getBusinessUnits()
    if (data) {
      const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
      const incidentPayrollFilters: AssistIncidentPayrollCalendarExcelFilterInterface = {
        employee: employee,
        employeeCalendar: employeeCalendar,
        tardies: tardies,
        datePay: filters.filterDatePay,
        toleranceCountPerAbsences: toleranceCountPerAbsences,
      }
      const newRows = await this.addRowIncidentPayrollCalendar(incidentPayrollFilters)
      for (const row of newRows) {
        rowsIncidentPayroll.push(row)
      }
    }
    await this.addRowIncidentPayrollToWorkSheet(rowsIncidentPayroll, worksheet)
    await this.paintBorderAll(worksheet, rowsIncidentPayroll.length)
    await onProgress(1, 1)

    blankMissingTexts(workbook)
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      status: 201,
      type: 'success' as const,
      title: this.t('resource'),
      message: this.t('resource_was_created_successfully'),
      buffer,
    }
  }

  async getExcelAllIncidentSummary(
    filters: AssistExcelFilterInterface,
    departmentsList: Array<number>,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
      if (!scope) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const businessUnitFilterIds = scope.businessUnitFilterIds
      const departments = await Department.query()
        .whereNull('department_deleted_at')
        .whereIn('departmentId', departmentsList)
        .if(businessUnitFilterIds.length > 0, (query) => {
          query.whereIn('businessUnitId', businessUnitFilterIds)
        })
        .orderBy('departmentId')

      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const departmentService = new DepartmentService(this.i18n)
      const employeeService = new EmployeeService(this.i18n)

      const workbook = new ExcelJS.Workbook()
      // hasta aquí era lo de asistencia
      const rowsIncident = [] as AssistIncidentExcelRowInterface[]
      const worksheet = workbook.addWorksheet(this.t('incident_summary'))
      const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentToWorkSheet(worksheet, title)
      this.addHeadRowIncident(worksheet)
      const totalRowIncident = {} as AssistIncidentExcelRowInterface
      await this.cleanTotalByDepartment(totalRowIncident)
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      for await (const departmentRow of departments) {
        const totalRowByDepartmentIncident = {} as AssistIncidentExcelRowInterface
        await this.cleanTotalByDepartment(totalRowByDepartmentIncident)
        const departmentId = departmentRow.departmentId
        const page = 1
        const limit = 999999999999999
        const resultPositions = await departmentService.getPositions(departmentId, filters.userResponsibleId)
        const syncAssistsService = new SyncAssistsService(this.i18n)
        for await (const position of resultPositions) {
          const resultEmployes = await this.fetchEmployeesForExcelReport(
            employeeService,
            {
              search: '',
              departmentId: departmentId,
              positionId: position.positionId,
              employeeWorkSchedule: '',
              page: page,
              limit: limit,
              ignoreDiscriminated: 0,
              ignoreExternal: 1,
              userResponsibleId: filters.userResponsibleId,
              payrollBusinessUnitId: filters.payrollBusinessUnitId,
            },
            [departmentId],
            scope.resolvedBusinessUnitId,
            scope.businessUnitFilterIds
          )
          if (!resultEmployes) {
            return this.buildExcelBusinessUnitScopeError()
          }
          const dataEmployes: any = resultEmployes
          for await (const employee of dataEmployes) {
            const result = await syncAssistsService.index(
              {
                date: filterDate,
                dateEnd: filterDateEnd,
                employeeID: employee.employeeId,
              },
              { page, limit }
            )
            const data: any = result.data
            this.adoptCalendarZone(data)
            if (data) {
              const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
              let newRows = [] as AssistIncidentExcelRowInterface[]
              const incidentSummaryFilters: AssistIncidentSummaryCalendarExcelFilterInterface = {
                employee: employee,
                employeeCalendar:employeeCalendar,
                tardies: tardies,
                toleranceCountPerAbsences: toleranceCountPerAbsences,
              }
              newRows = await this.addRowIncidentCalendar(incidentSummaryFilters)
              for await (const row of newRows) {
                await this.addTotalByDepartment(totalRowByDepartmentIncident, row)
                rowsIncident.push(row)
              }
            }
          }
        }
        await rowsIncident.push(totalRowByDepartmentIncident)
        await this.addTotalRow(totalRowIncident, totalRowByDepartmentIncident)
      }
      await rowsIncident.push(totalRowIncident)
      await this.addRowIncidentToWorkSheet(rowsIncident, worksheet)
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getExcelAllIncidentSummaryPayRoll(
    filters: AssistExcelFilterInterface,
    departmentsList: Array<number>,
    allowedBusinessUnitIds: number[] = []
  ) {
    try {
      const scope = this.resolveExcelBusinessUnitScope(filters.businessUnitId, allowedBusinessUnitIds)
      if (!scope) {
        return this.buildExcelBusinessUnitScopeError()
      }
      const businessUnitFilterIds = scope.businessUnitFilterIds
      const departments = await Department.query()
        .whereNull('department_deleted_at')
        .whereIn('departmentId', departmentsList)
        .if(businessUnitFilterIds.length > 0, (query) => {
          query.whereIn('businessUnitId', businessUnitFilterIds)
        })
        .orderBy('departmentId')
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const employeeService = new EmployeeService(this.i18n)
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      await this.getBusinessUnits()
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      // hasta aquí era lo de incidencias
      const rowsIncidentPayroll = [] as AssistIncidentPayrollExcelRowInterface[]
      const tradeName = await this.getTradeName()
      const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll_sheet'))
      const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
      this.addTitleIncidentPayrollToWorkSheet(worksheet, titlePayroll)
      this.addHeadRowIncidentPayroll(worksheet)
      const syncAssistsService = new SyncAssistsService(this.i18n)
      for await (const departmentRow of departments) {
        const totalRowByDepartmentIncident = {} as AssistIncidentExcelRowInterface
        await this.cleanTotalByDepartment(totalRowByDepartmentIncident)
        const departmentId = departmentRow.departmentId
        const page = 1
        const limit = 999999999999999
        await this.appendIncidentPayrollRowsForDepartmentEmployees({
          departmentId,
          filterDate,
          filterDateEnd,
          filterDatePay: filters.filterDatePay ?? '',
          userResponsibleId: filters.userResponsibleId,
          businessUnitId: scope.resolvedBusinessUnitId,
          payrollBusinessUnitId: filters.payrollBusinessUnitId,
          branchNameIds: filters.branchNameIds,
          businessUnitFilterIds: scope.businessUnitFilterIds,
          employeeService,
          syncAssistsService,
          tardies,
          toleranceCountPerAbsences,
          rowsIncidentPayroll,
          page,
          limit,
        })
      }
      await this.addRowIncidentPayrollToWorkSheet(rowsIncidentPayroll, worksheet)
      await this.paintBorderAll(worksheet, rowsIncidentPayroll.length)
      // Crear un buffer del archivo Excel
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('AssistsService.getExcelAllIncidentSummaryPayRoll: error al generar reporte', err)
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: err.message,
        ...(env.get('NODE_ENV') !== 'production' ? { errorDetail: err.stack } : {}),
      }
    }
  }

  /** Colores de estatus (semánticos, no de marca): se conservan en el formato neutral. */
  private paintIncidents(worksheet: ExcelJS.Worksheet, row: number, value: string) {
    let color: string = REPORT_NEUTRAL_ARGB.background
    let fgColor: string = REPORT_NEUTRAL_ARGB.text
    if (value === this.t('fault').toUpperCase()) {
      color = 'FFD45633'
      fgColor = REPORT_NEUTRAL_ARGB.textInverse
    } else if (value === this.t('ontime').toUpperCase()) {
      color = 'FF33D4AD'
      fgColor = REPORT_NEUTRAL_ARGB.textInverse
    } else if (value === this.t('next').toUpperCase()) {
      color = 'FFE4E4E4'
      fgColor = REPORT_NEUTRAL_ARGB.text
    } else if (value === this.t('rest').toUpperCase()) {
      color = 'FFE4E4E4'
      fgColor = REPORT_NEUTRAL_ARGB.text
    } else if (value === this.t('vacations').toUpperCase()) {
      color = REPORT_NEUTRAL_ARGB.background
      fgColor = REPORT_NEUTRAL_ARGB.text
    } else if (value === this.t('holiday').toUpperCase()) {
      color = REPORT_NEUTRAL_ARGB.background
      fgColor = REPORT_NEUTRAL_ARGB.text
    } else if (value === this.t('delay').toUpperCase()) {
      color = 'FFFF993A'
    } else if (value === this.t('tolerance').toUpperCase()) {
      color = 'FF3CB4E5'
    } else if (value === this.t('exception').toUpperCase()) {
      fgColor = REPORT_NEUTRAL_ARGB.text
    }
    worksheet.getCell('P' + row).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    worksheet.getCell('P' + row).font = {
      color: { argb: fgColor },
    }
  }

  private paintEmployeeTerminated(worksheet: ExcelJS.Worksheet, columnName: string, row: number) {
    const color = 'FFD45633'
    const fgColor = REPORT_NEUTRAL_ARGB.textInverse
    worksheet.getCell(columnName + row).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    worksheet.getCell(columnName + row).font = {
      color: { argb: fgColor },
    }
  }

  private paintCheckOutStatus(worksheet: ExcelJS.Worksheet, row: number, value: string) {
    if (value.toString().toUpperCase() === 'DELAY') {
      const fgColor = 'FFFF993A'
      worksheet.getCell('N' + row).font = {
        color: { argb: fgColor },
      }
    }
  }

  private getRange(dateStart: string, dateEnd: string) {
    const dayStart = this.dateDay(dateStart)
    const monthStart = this.dateMonth(dateStart)
    const yearStart = this.dateYear(dateStart)
    const calendarDayStart = this.calendarDay(yearStart, monthStart, dayStart)
    const dayEnd = this.dateDay(dateEnd)
    const monthEnd = this.dateMonth(dateEnd)
    const yearEnd = this.dateYear(dateEnd)
    const calendarDayEnd = this.calendarDay(yearEnd, monthEnd, dayEnd)

    return `${this.capitalizeFirstLetter(this.t('from'))} ${calendarDayStart} ${this.t('to')} ${calendarDayEnd}`
  }

  private dateYear(day: string) {
    if (!day) {
      return 0
    }

    const year = Number.parseInt(`${day.split('-')[0]}`)
    return year
  }

  private dateMonth(day: string) {
    if (!day) {
      return 0
    }

    const month = Number.parseInt(`${day.split('-')[1]}`)
    return month
  }

  private dateDay(day: string) {
    if (!day) {
      return 0
    }

    const dayTemp = Number.parseInt(`${day.split('-')[2]}`)
    return dayTemp
  }

  private calendarDay(dateYear: number, dateMonth: number, dateDay: number) {
    const date = DateTime.local(dateYear, dateMonth, dateDay, 0).setLocale(this.localeToUse)
    const day = date.toFormat('DDD')
    return day
  }

  private chekInTime(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.checkIn?.assistPunchTimeUtc) {
      return ''
    }
    const timeCheckIn = wallTime(checkAssist.assist.checkIn.assistPunchTimeUtc, this.siteZone).setLocale(
      this.localeToUse
    )
    return timeCheckIn.toFormat(REPORT_DATE_TIME_FORMAT)
  }

  private chekOutTime(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.checkOut?.assistPunchTimeUtc) {
      return ''
    }

    const now = DateTime.now().setZone(this.siteZone).toFormat('yyyy-LL-dd')
    const timeCheckOut = wallTime(checkAssist.assist.checkOut.assistPunchTimeUtc, this.siteZone).setLocale(
      this.localeToUse
    )
    if (timeCheckOut.toFormat('yyyy-LL-dd') === now) {
      checkAssist.assist.checkOutStatus = ''
      return ''
    }
    return timeCheckOut.toFormat(REPORT_DATE_TIME_FORMAT)
  }

  addHeadRow(worksheet: ExcelJS.Worksheet) {
    const headerRow = worksheet.addRow([
      this.t('report_employee_id'),
      this.t('report_employee_name'),
      this.t('department'),
      this.t('position'),
      this.t('date'),
      '',
      this.t('shift_assigned'),
      this.t('shift_start_date'),
      this.t('shift_ends_date'),
      '',
      this.t('check_in'),
      this.t('check_go_eat'),
      this.t('check_back_from_eat'),
      this.t('check_out'),
      this.t('hours_worked'),
      this.t('status'),
      this.t('exception_notes')
    ])
    // Encabezado neutral: todas las columnas con el mismo gris y texto negro
    for (let col = 1; col <= 17; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    const columnA = worksheet.getColumn(1)
    columnA.width = 20
    columnA.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnB = worksheet.getColumn(2)
    columnB.width = 44
    columnB.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnC = worksheet.getColumn(3)
    columnC.width = 44
    columnC.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnD = worksheet.getColumn(4)
    columnD.width = 44
    columnD.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnE = worksheet.getColumn(5)
    columnE.width = 25
    columnE.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnF = worksheet.getColumn(6)
    columnF.width = 5
    columnF.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnG = worksheet.getColumn(7)
    columnG.width = 25
    columnG.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnH = worksheet.getColumn(8)
    columnH.width = 25
    columnH.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnI = worksheet.getColumn(9)
    columnI.width = 25
    columnI.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnJ = worksheet.getColumn(10)
    columnJ.width = 5
    columnJ.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnK = worksheet.getColumn(11)
    columnK.width = 25
    columnK.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnL = worksheet.getColumn(12)
    columnL.width = 25
    columnL.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnM = worksheet.getColumn(13)
    columnM.width = 25
    columnM.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnN = worksheet.getColumn(14)
    columnN.width = 25
    columnN.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnO = worksheet.getColumn(15)
    columnO.width = 25
    columnO.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnP = worksheet.getColumn(16)
    columnP.width = 30
    columnP.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnQ = worksheet.getColumn(17)
    columnQ.width = 30
    columnQ.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  async addRowCalendar(employee: Employee, employeeCalendar: AssistDayInterface[]) {
    const rows = [] as AssistExcelRowInterface[]
    for await (const calendar of employeeCalendar) {
      const exceptions = [] as ShiftExceptionInterface[]
      if (calendar.assist.exceptions.length > 0) {
        for await (const exception of calendar.assist.exceptions) {
          exceptions.push(exception)
        }
      }
      const calendarDay = formatReportCalendarDate(calendar.day)
      const firstCheck = this.chekInTime(calendar)
      const lastCheck = this.chekOutTime(calendar)
      let status = calendar.assist.checkInStatus
        ? `${calendar.assist.checkInStatus}`.toUpperCase()
        : ''
      if (calendar.assist.isFutureDay) {
        status = 'NEXT'
      } else if (calendar.assist.isRestDay && !firstCheck) {
        status = 'REST'
      } else if (calendar.assist.isVacationDate && status !== 'ONTIME') {
        status = 'VACATIONS'
      } else if (calendar.assist.isHoliday) {
        if (!calendar.assist.checkIn) {
          status = 'HOLIDAY'
        }
      }
      if (!calendar.assist.dateShift) {
        status = ''
      }
      const department = resolveOrgAliasDisplay(
        employee.department?.departmentAlias,
        employee.department?.departmentName,
        Boolean(employee.department?.deletedAt)
      )
      const position = resolveOrgAliasDisplay(
        employee.position?.positionAlias,
        employee.position?.positionName,
        Boolean(employee.position?.deletedAt)
      )
      let shiftName = ''
      let shiftStartDate = ''
      let shiftEndsDate = ''
      let hoursWorked = 0
      if (calendar && calendar.assist && calendar.assist.dateShift) {
        shiftName = reportText(calendar.assist.dateShift.shiftName)
        shiftStartDate = reportText(calendar.assist.dateShift.shiftTimeStart)
        const hoursToAddParsed = calendar.assist.dateShift.shiftActiveHours
        const time = DateTime.fromFormat(shiftStartDate, 'HH:mm:ss')
        const newTime = time.plus({ hours: hoursToAddParsed })
        shiftEndsDate = newTime.isValid ? newTime.toFormat('HH:mm:ss') : ''
      }

      const checkInTime = calendar.assist.checkIn?.assistPunchTimeUtc
      const checkOutTime = calendar.assist.checkOut?.assistPunchTimeUtc

      const firstCheckTime = checkInTime ? toInstant(checkInTime) : null
      const lastCheckTime = checkOutTime ? toInstant(checkOutTime) : null

      if (firstCheckTime && lastCheckTime && firstCheckTime.isValid && lastCheckTime.isValid) {
        const durationInMinutes = lastCheckTime.diff(firstCheckTime, 'minutes').as('minutes')
        let hours = Math.floor(durationInMinutes / 60)
        let minutes = Math.round(durationInMinutes % 60)
        if (minutes >= 60) {
          hours += Math.floor(minutes / 60)
          minutes = minutes % 60
        }
        const timeInDecimal = hours + minutes / 60
        hoursWorked += timeInDecimal
      }

      const rowCheckInTime = calendar.assist.checkIn?.assistPunchTimeUtc && !calendar.assist.isFutureDay ? wallTime(calendar.assist.checkIn.assistPunchTimeUtc, this.siteZone).toFormat(REPORT_DATE_TIME_FORMAT) : ''
      const rowLunchTime = calendar.assist?.checkEatIn?.assistPunchTimeUtc ? wallTime(calendar.assist.checkEatIn.assistPunchTimeUtc, this.siteZone).setLocale(this.localeToUse).toFormat(REPORT_DATE_TIME_FORMAT) : ''
      const rowReturnLunchTime = calendar?.assist?.checkEatOut?.assistPunchTimeUtc ? wallTime(calendar.assist.checkEatOut.assistPunchTimeUtc, this.siteZone).setLocale(this.localeToUse).toFormat(REPORT_DATE_TIME_FORMAT) : ''
      const rowCheckOutTime = calendar.assist.checkOut?.assistPunchTimeUtc && !calendar.assist.isFutureDay ? wallTime(calendar.assist.checkOut.assistPunchTimeUtc, this.siteZone).toFormat(REPORT_DATE_TIME_FORMAT) : ''

      rows.push({
        code: employee.employeeCode.toString(),
        name: reportFullName(
          employee.person?.personFirstname,
          employee.person?.personLastname,
          employee.person?.personSecondLastname
        ),
        department: department,
        position: position,
        date: calendarDay,
        shiftAssigned: shiftName,
        shiftStartDate: shiftStartDate,
        shiftEndsDate: shiftEndsDate,
        checkInTime: rowCheckInTime,
        firstCheck: firstCheck,
        lunchTime: rowLunchTime,
        returnLunchTime: rowReturnLunchTime,
        checkOutTime: rowCheckOutTime,
        lastCheck: lastCheck,
        hoursWorked: hoursWorked,
        incidents: status ? this.t(status.toString().toLowerCase()).toUpperCase() : status,
        notes: '',
        sundayPremium: '',
        checkOutStatus: calendar.assist.checkOutStatus,
        exceptions: exceptions,
      })
    }
    return rows
  }

  async addExceptions(
    rowData: AssistExcelRowInterface,
    worksheet: ExcelJS.Worksheet,
    rowCount: number
  ) {
    const richText = []
    for await (const exception of rowData.exceptions) {
      const type = exception.exceptionType ? exception.exceptionType.exceptionTypeTypeName : ''
      const description = exception.shiftExceptionsDescription
        ? exception.shiftExceptionsDescription
        : ''
      richText.push(
        { text: type, font: { bold: true, size: 12, color: { argb: REPORT_NEUTRAL_ARGB.text } } },
        { text: `\n${description}\n`, font: { italic: true, size: 10, color: { argb: REPORT_NEUTRAL_ARGB.text } } }
      )
    }
    const cell = worksheet.getCell('Q' + rowCount)
    cell.value = {
      richText: richText,
    }
    cell.alignment = { wrapText: true }
  }

  async addRowToWorkSheet(
    rows: AssistExcelRowInterface[],
    worksheet: ExcelJS.Worksheet,
    status: string = 'Active'
  ) {
    let rowCount = 5
    let faultsTotal = 0
    for await (const rowData of rows) {
      if (rowData.incidents.toString().toUpperCase() === this.t('fault').toUpperCase()) {
        faultsTotal += 1
      }
      let incidents =
        !rowData.name && rowData.code !== '0'
          ? `${faultsTotal.toString().padStart(2, '0')} ${this.t('total_faults').toUpperCase()}`
          : rowData.incidents
      worksheet.addRow([
        rowData.code !== '0' ? rowData.code : '',
        rowData.name,
        rowData.department,
        rowData.position,
        rowData.date,
        '',
        rowData.shiftAssigned,
        rowData.shiftStartDate,
        rowData.shiftEndsDate,
        '',
        rowData.firstCheck,
        rowData.lunchTime,
        rowData.returnLunchTime,
        rowData.lastCheck,
        this.decimalToTimeString(rowData.hoursWorked),
        incidents,
        rowData.notes,
      ])
      if (rowData.name) {
        this.paintIncidents(worksheet, rowCount, rowData.incidents)
        this.paintCheckOutStatus(worksheet, rowCount, rowData.checkOutStatus)
        if (status === 'Terminated') {
          await this.paintEmployeeTerminated(worksheet, 'B', rowCount)
        }
      }
      if (rowData.exceptions.length > 0) {
        await this.addExceptions(rowData, worksheet, rowCount)
      }
      if (!rowData.name && rowData.code !== '0') {
        const color = REPORT_NEUTRAL_ARGB.subheaderFill
        for (let col = 1; col <= 17; col++) {
          const cell = worksheet.getCell(rowCount, col)
          const row = worksheet.getRow(rowCount)
          row.height = 21
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: color },
          }
        }
        faultsTotal = 0
      }
      rowCount += 1
    }
  }

  addHeadRowIncident(worksheet: ExcelJS.Worksheet) {
    const headerRow = worksheet.addRow([
      this.t('department'),
      this.t('report_employee_id'),
      this.t('report_employee_name'),
      this.t('days_worked'),
      this.t('on_time'),
      this.t('tolerances'),
      this.t('delays'),
      this.t('early_outs'),
      this.t('rests'),
      this.t('sunday_bonus'),
      this.t('vacations'),
      this.t('exceptions'),
      this.t('holidays_worked'),
      this.t('rest_worked'),
      this.t('faults'),
      this.t('delays_faults'),
      this.t('early_outs_faults'),
      this.t('total_faults'),
      this.t('total_hours_worked')
    ])
    for (let col = 1; col <= 19; col++) {
      const cell = worksheet.getCell(3, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    const columnA = worksheet.getColumn(1)
    columnA.width = 23
    columnA.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnB = worksheet.getColumn(2)
    columnB.width = 16
    columnB.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnC = worksheet.getColumn(3)
    columnC.width = 32
    columnC.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnD = worksheet.getColumn(4)
    columnD.width = 16
    columnD.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnE = worksheet.getColumn(5)
    columnE.width = 16
    columnE.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnF = worksheet.getColumn(6)
    columnF.width = 16
    columnF.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnG = worksheet.getColumn(7)
    columnG.width = 16
    columnG.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnH = worksheet.getColumn(8)
    columnH.width = 16
    columnH.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnI = worksheet.getColumn(9)
    columnI.width = 16
    columnI.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnJ = worksheet.getColumn(10)
    columnJ.width = 16
    columnJ.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnK = worksheet.getColumn(11)
    columnK.width = 16
    columnK.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnL = worksheet.getColumn(12)
    columnL.width = 16
    columnL.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnM = worksheet.getColumn(13)
    columnM.width = 16
    columnM.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnN = worksheet.getColumn(14)
    columnN.width = 16
    columnN.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnO = worksheet.getColumn(15)
    columnO.width = 16
    columnO.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnP = worksheet.getColumn(16)
    columnP.width = 16
    columnP.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnQ = worksheet.getColumn(17)
    columnQ.width = 16
    columnQ.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnR = worksheet.getColumn(18)
    columnR.width = 16
    columnR.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnS = worksheet.getColumn(19)
    columnS.width = 16
    columnS.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  async addRowIncidentCalendar(
    filters: AssistIncidentSummaryCalendarExcelFilterInterface
  ) {
    const rows = [] as AssistIncidentExcelRowInterface[]
    const department = resolveOrgAliasDisplay(
      filters.employee.department?.departmentAlias,
      filters.employee.department?.departmentName,
      Boolean(filters.employee.department?.deletedAt)
    )
    let daysWorked = 0
    let daysOnTime = 0
    let tolerances = 0
    let delays = 0
    let earlyOuts = 0
    let rests = 0
    let sundayBonus = 0
    let vacations = 0
    let holidaysWorked = 0
    let restWorked = 0
    let faults = 0
    let delayFaults = 0
    let earlyOutsFaults = 0
    let hoursWorked = 0
    const exceptions = [] as ShiftExceptionInterface[]
    for await (const calendar of filters.employeeCalendar) {
      if (!calendar.assist.isFutureDay) {
        let faultProcessed = false
        let holidayWorked = false
        if (calendar.assist.isHoliday && calendar.assist.checkIn) {
          holidaysWorked += 1
          holidayWorked = true
        }
        if (calendar.assist.exceptions.length > 0) {
          for await (const exception of calendar.assist.exceptions) {
            if (exception.exceptionType) {
              const exceptionTypeSlug = exception.exceptionType.exceptionTypeSlug
              if (exceptionTypeSlug !== 'rest-day' && exceptionTypeSlug !== 'vacation') {
                exceptions.push(exception)
              }
              if (exceptionTypeSlug === 'descanso-laborado' && !holidayWorked) {
                if (
                  exception.shiftExceptionEnjoymentOfSalary &&
                  exception.shiftExceptionEnjoymentOfSalary === 1 &&
                  calendar.assist.checkIn
                ) {
                  restWorked += 1
                }
              }
              if (
                exceptionTypeSlug === 'absence-from-work' &&
                exception.shiftExceptionEnjoymentOfSalary !== 1
              ) {
                faultProcessed = true
                if (
                  calendar.assist.dateShift &&
                  calendar.assist.dateShift.shiftAccumulatedFault > 0
                ) {
                  faults += calendar.assist.dateShift.shiftAccumulatedFault
                } else {
                  faults += 1
                }
              }
            }
          }
        }
        const firstCheck = this.chekInTime(calendar)
        if (calendar.assist.dateShift) {
          daysWorked += 1
          if (calendar.assist.checkInStatus !== 'fault') {
            if (calendar.assist.checkInStatus === 'ontime') {
              daysOnTime += 1
            } else if (calendar.assist.checkInStatus === 'tolerance') {
              tolerances += 1
            } else if (calendar.assist.checkInStatus === 'delay') {
              delays += 1
            }
          }
          if (calendar.assist.checkOutStatus !== 'fault') {
            if (calendar.assist.checkOutStatus === 'delay') {
              earlyOuts += 1
            }
          }
          if (
            calendar.assist.isSundayBonus &&
            (calendar.assist.checkIn ||
              calendar.assist.checkOut ||
              (calendar.assist.assitFlatList && calendar.assist.assitFlatList.length > 0))
          ) {
            sundayBonus += 1
          }
          if (calendar.assist.isRestDay && !firstCheck) {
            rests += 1
          }
          if (calendar.assist.isVacationDate) {
            vacations += 1
          }
          if (
            calendar.assist.checkInStatus === 'fault' &&
            !calendar.assist.isRestDay &&
            !faultProcessed
          ) {
            if (calendar.assist.dateShift && calendar.assist.dateShift.shiftAccumulatedFault > 0) {
              faults += calendar.assist.dateShift.shiftAccumulatedFault
            } else {
              faults += 1
            }
          }
        }
        const checkInTime = calendar.assist.checkIn?.assistPunchTimeUtc
        const checkOutTime = calendar.assist.checkOut?.assistPunchTimeUtc

        const firstCheckTime = checkInTime ? toInstant(checkInTime) : null
        const lastCheckTime = checkOutTime ? toInstant(checkOutTime) : null

        if (firstCheckTime && lastCheckTime && firstCheckTime.isValid && lastCheckTime.isValid) {
          const duration = lastCheckTime.diff(firstCheckTime, 'minutes')
          const hours = Math.floor(duration.as('minutes') / 60)
          const minutes = duration.as('minutes') % 60
          hoursWorked += hours + minutes / 60
        }
      }
    }

    const delayTolerances = this.getFaultsFromDelays(tolerances, filters.toleranceCountPerAbsences)
    delays += delayTolerances

    delayFaults = this.getFaultsFromDelays(delays, filters.tardies)
    earlyOutsFaults = this.getFaultsFromDelays(earlyOuts, filters.tardies)
    rows.push({
      employeeId: filters.employee.employeeCode.toString(),
      employeeName: reportFullName(
        filters.employee.person?.personFirstname,
        filters.employee.person?.personLastname,
        filters.employee.person?.personSecondLastname
      ),
      department: department,
      daysWorked: daysWorked,
      daysOnTime: daysOnTime,
      tolerances: tolerances,
      delays: delays,
      earlyOuts: earlyOuts,
      rests: rests,
      sundayBonus: sundayBonus,
      vacations: vacations,
      exeptions: exceptions.length,
      holidaysWorked: holidaysWorked,
      restWorked: restWorked,
      faults: faults,
      delayFaults: delayFaults,
      earlyOutsFaults: earlyOutsFaults,
      totalFaults: faults + delayFaults + earlyOutsFaults,
      hoursWorked: hoursWorked,
    })
    return rows
  }

  private addRowIncidentExcelEmpty(rows: AssistIncidentExcelRowInterface[]) {
    rows.push({
      employeeId: '',
      employeeName: '',
      department: '',
      daysWorked: 0,
      daysOnTime: 0,
      tolerances: 0,
      delays: 0,
      earlyOuts: 0,
      rests: 0,
      sundayBonus: 0,
      vacations: 0,
      exeptions: 0,
      holidaysWorked: 0,
      restWorked: 0,
      faults: 0,
      delayFaults: 0,
      earlyOutsFaults: 0,
      totalFaults: 0,
      hoursWorked: 0,
    })
  }

  private addRowIncidentExcelEmptyWithCode(rows: AssistIncidentExcelRowInterface[]) {
    rows.push({
      employeeId: '0',
      employeeName: '',
      department: '',
      daysWorked: 0,
      daysOnTime: 0,
      tolerances: 0,
      delays: 0,
      earlyOuts: 0,
      rests: 0,
      sundayBonus: 0,
      vacations: 0,
      exeptions: 0,
      holidaysWorked: 0,
      restWorked: 0,
      faults: 0,
      delayFaults: 0,
      earlyOutsFaults: 0,
      totalFaults: 0,
      hoursWorked: 0,
    })
  }

  async addRowIncidentToWorkSheet(
    rows: AssistIncidentExcelRowInterface[],
    worksheet: ExcelJS.Worksheet
  ) {
    let rowCount = 5
    let currentDepartment = ''
    let currentDepartmentRow = 5
    for await (const rowData of rows) {
      if (rowData.employeeName !== 'null') {
        if (currentDepartment !== rowData.department && rowData.department) {
          if (currentDepartment !== '') {
            worksheet.mergeCells(`A${currentDepartmentRow}:A${rowCount - 3}`)
            for (let rowCurrent = currentDepartmentRow; rowCurrent < rowCount - 2; rowCurrent++) {
              const cell = worksheet.getCell(rowCurrent, 1)
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: REPORT_NEUTRAL_ARGB.subheaderFill },
              }
              cell.font = { color: { argb: REPORT_NEUTRAL_ARGB.text } }
            }
          }
          currentDepartment = rowData.department
          currentDepartmentRow = rowCount - 1
        }
        worksheet.addRow([
          rowData.department,
          rowData.employeeId,
          rowData.employeeName,
          rowData.daysWorked,
          rowData.daysOnTime,
          rowData.tolerances,
          rowData.delays,
          rowData.earlyOuts,
          rowData.rests,
          rowData.sundayBonus,
          rowData.vacations,
          rowData.exeptions,
          rowData.holidaysWorked,
          rowData.restWorked,
          rowData.faults,
          rowData.delayFaults,
          rowData.earlyOutsFaults,
          rowData.totalFaults,
          this.decimalToTimeString(rowData.hoursWorked),
        ])
        if (!rowData.employeeName && rowData.employeeId === '') {
          for (let col = 1; col <= 19; col++) {
            const cell = worksheet.getCell(rowCount - 1, col)
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: REPORT_NEUTRAL_ARGB.subheaderFill },
            }
            cell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
          }
        }
        if (rowData.department === this.t('totals').toUpperCase()) {
          for (let col = 1; col <= 19; col++) {
            const cell = worksheet.getCell(rowCount - 1, col)
            const row = worksheet.getRow(rowCount - 1)
            row.height = 30
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: REPORT_NEUTRAL_ARGB.totalFill },
            }
            cell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
          }
        }
        rowCount += 1
      }
    }
  }

  addTitleIncidentToWorkSheet(worksheet: ExcelJS.Worksheet, title: string) {
    // Sin logo: la fila 1 solo lleva el título, con altura acorde a la fuente
    worksheet.getRow(1).height = 30
    worksheet.getCell('B1').value = title
    worksheet.getCell('B1').font = { bold: true, size: 18, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    worksheet.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells('B1:R1')
    worksheet.views = frozenHeaderViews(3)
    worksheet.addRow([])
  }

  addTotalByDepartment(
    totalRowIncident: AssistIncidentExcelRowInterface,
    row: AssistIncidentExcelRowInterface
  ) {
    totalRowIncident.employeeId = ''
    totalRowIncident.employeeName = ''
    totalRowIncident.daysOnTime += row.daysOnTime
    totalRowIncident.tolerances += row.tolerances
    totalRowIncident.delays += row.delays
    totalRowIncident.earlyOuts += row.earlyOuts
    totalRowIncident.rests += row.rests
    totalRowIncident.sundayBonus += row.sundayBonus
    totalRowIncident.vacations += row.vacations
    totalRowIncident.exeptions += row.exeptions
    totalRowIncident.holidaysWorked += row.holidaysWorked
    totalRowIncident.restWorked += row.restWorked
    totalRowIncident.faults += row.faults
    totalRowIncident.delayFaults += row.delayFaults
    totalRowIncident.earlyOutsFaults += row.earlyOutsFaults
    totalRowIncident.totalFaults += row.totalFaults
    totalRowIncident.hoursWorked += row.hoursWorked
  }

  addTotalRow(
    totalRowIncident: AssistIncidentExcelRowInterface,
    rowByDepartment: AssistIncidentExcelRowInterface
  ) {
    totalRowIncident.employeeId = ''
    totalRowIncident.employeeName = ''
    totalRowIncident.department = this.t('totals').toUpperCase()
    totalRowIncident.daysOnTime += rowByDepartment.daysOnTime
    totalRowIncident.tolerances += rowByDepartment.tolerances
    totalRowIncident.delays += rowByDepartment.delays
    totalRowIncident.earlyOuts += rowByDepartment.earlyOuts
    totalRowIncident.rests += rowByDepartment.rests
    totalRowIncident.sundayBonus += rowByDepartment.sundayBonus
    totalRowIncident.vacations += rowByDepartment.vacations
    totalRowIncident.exeptions += rowByDepartment.exeptions
    totalRowIncident.holidaysWorked += rowByDepartment.holidaysWorked
    totalRowIncident.restWorked += rowByDepartment.restWorked
    totalRowIncident.faults += rowByDepartment.faults
    totalRowIncident.delayFaults += rowByDepartment.delayFaults
    totalRowIncident.earlyOutsFaults += rowByDepartment.earlyOutsFaults
    totalRowIncident.totalFaults += rowByDepartment.totalFaults
    totalRowIncident.hoursWorked += rowByDepartment.hoursWorked
  }

  cleanTotalByDepartment(totalRowIncident: AssistIncidentExcelRowInterface) {
    totalRowIncident.employeeId = ''
    totalRowIncident.employeeName = 'null'
    totalRowIncident.daysOnTime = 0
    totalRowIncident.tolerances = 0
    totalRowIncident.delays = 0
    totalRowIncident.earlyOuts = 0
    totalRowIncident.rests = 0
    totalRowIncident.sundayBonus = 0
    totalRowIncident.vacations = 0
    totalRowIncident.exeptions = 0
    totalRowIncident.holidaysWorked = 0
    totalRowIncident.restWorked = 0
    totalRowIncident.faults = 0
    totalRowIncident.delayFaults = 0
    totalRowIncident.earlyOutsFaults = 0
    totalRowIncident.totalFaults = 0
    totalRowIncident.hoursWorked = 0
  }

  getFaultsFromDelays(delays: number, tardies: number) {
    const faults = Math.floor(delays / tardies) // Cada 3 retardos es 1 falta
    return faults
  }

  /**
   * `store()` se retiró en USRH1788135907801: el alta de checadas pasa por
   * `#modules/assist-ingestion`, único camino de escritura del producto. La versión
   * anterior resolvía al empleado del recálculo de calendario sólo por
   * `employee_code`, sin empresa, y podía recalcular el calendario de la persona
   * equivocada cuando dos empresas comparten código.
   */

  /**
   * Registra una asistencia simplificada mediante WebSocket.
   * Busca el empleado por employee_sync_id y guarda solo los campos esenciales.
   *
   * @param employeeSyncId - ID de sincronización del empleado
   * @param punchTime - Fecha y hora de la asistencia en formato Date
   * @returns Objeto con el UUID generado y la asistencia creada, o null si el empleado no existe
   */
  async storeFromWebSocket(employeeSyncId: string, punchTime: string, deviceSN: string = '', deviceAlias: string = '') {
    const { randomUUID } = await import('node:crypto')
    const assistUuid = randomUUID()

    // Buscar empleado por employee_sync_id
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_sync_id', employeeSyncId)
      .first()

    if (!employee) {
      return null
    }

    // Crear nueva asistencia con solo los campos necesarios
    const newAssist = new Assist()
    newAssist.assistUuid = assistUuid
    newAssist.assistEmpCode = employee.employeeCode ? String(employee.employeeCode) : ''
    newAssist.assistEmpId = employee.employeeId
    newAssist.assistPunchTime = DateTime.fromISO(punchTime)
    newAssist.assistPunchTimeUtc = DateTime.fromISO(punchTime)
    newAssist.assistPunchTimeOrigin = DateTime.fromISO(punchTime)
    newAssist.assistUploadTime = DateTime.fromISO(punchTime)
    newAssist.assistTerminalSn = deviceSN
    newAssist.assistTerminalAlias = deviceAlias
    newAssist.assistAreaAlias = ''
    newAssist.assistSyncId = 0
    newAssist.businessUnitId = employee.businessUnitId

    await newAssist.save()

    // Actualizar calendario de sincronización
    const employeeForSync = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_code', newAssist.assistEmpCode)
      .first()

    if (employeeForSync) {
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const filter: SyncAssistsServiceIndexInterface = {
        date: newAssist.assistPunchTime.toString(),
        dateEnd: newAssist.assistPunchTime.toString(),
        employeeID: employeeForSync.employeeId,
      }
      await syncAssistsService.setDateCalendar(filter)
    }

    return {
      uuid: assistUuid,
      assist: newAssist,
    }
  }

  async verifyInfo(assist: Assist) {
    const action = 'created'
    const punchTime = DateTime.fromJSDate(new Date(assist.assistPunchTimeUtc.toString()))
    const sqlPunchTime = punchTime.isValid ? punchTime.toSQL() : null
    if (!sqlPunchTime) {
      const entity = this.t('assist')
      const param = this.t('assist_register')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_is_not_valid', { entity: param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_not_valid', { entity: param })}`,
        data: { ...assist },
      }
    }
    // La deduplicación por (assist_emp_id, assist_punch_time) se retiró en
    // USRH1788135907801: el único criterio de "ya existe" en el producto es la llave
    // natural, que el motor de ingesta arbitra con el índice único y contesta como
    // éxito idempotente. Esta rama devolvía 400 por una checada que sí había quedado
    // registrada. La validación del instante parseable de arriba se conserva.
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...assist },
    }
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logAssist = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogAssist
    return logAssist
  }

  async saveActionOnLog(logAssist: LogAssist) {
    try {
      const employeeId = logAssist.record_current?.assistEmpId
      if (employeeId) {
        const employeeShiftId = await this.getEmployeeShiftId(employeeId)
        logAssist.employeeShiftId = employeeShiftId
      }
      await LogStore.set('log_assist', logAssist)
    } catch (err) {}
  }

  async getEmployeeShiftId(employeeId: number): Promise<number | null> {
    try {
      const today = new Date().toISOString().split('T')[0]
      const employeeShift = await EmployeeShift.query()
        .whereNull('employe_shifts_deleted_at')
        .where('employee_id', employeeId)
        .whereRaw('DATE(employe_shifts_apply_since) <= ?', [today])
        .orderBy('employe_shifts_apply_since', 'desc')
        .first()
      return employeeShift?.shiftId || null
    } catch (error) {
      return null
    }
  }

  getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }

  async getFormatPayRoll(date: string, allowedBusinessUnitIds: number[] = []) {
    try {
      // Fecha de pago = día de calendario: se lee en UTC, no en la zona del
      // servidor (con otra zona el periodo y el año se corrían un día).
      const payDay = utcCalendarDay(date)
      const startOfWeek = payDay.startOf('week')
      const thursday = startOfWeek.plus({ days: 3 })
      const start = thursday.minus({ days: 24 })
      const firstDayPeriod = start.minus({ days: 1 }).startOf('day')
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const period = this.calculatePayPeriod(date)
      const year = payDay.year
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Inc SA2 p01')
      const businessUnitsList = allowedBusinessUnitIds
      worksheet.columns = [
        { key: 'inc' },
        { key: 'sa2' },
        { key: 'ordinary' },
        { key: 'employee' },
        { key: 'year' },
        { key: 'period' },
        { key: 'code' },
        { key: 'date' },
        { key: 'faults' },
      ]
      const employees = await Employee.query()
        .whereIn('businessUnitId', businessUnitsList)
        .whereNull('employee_deleted_at')
        .orderBy('employee_id')
      const firstDate = firstDayPeriod.toFormat('yyyy-MM-dd')
      const lastDate = firstDayPeriod.plus({ days: 13 }).startOf('day')
      let faultsTotal = 0
      for await (const employee of employees) {
        const result = await syncAssistsService.index(
          {
            date: firstDate,
            dateEnd: lastDate.toFormat('yyyy-MM-dd'),
            employeeID: employee.employeeId,
          },
          { page: 1, limit: 100 }
        )
        const data: any = result.data
        this.adoptCalendarZone(data)
        if (data) {
          const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
          const faults = await this.getFaultsFromEmployeeCalendar(employeeCalendar, tardies, toleranceCountPerAbsences)
          faultsTotal += faults
          if (faults > 0) {
            worksheet.addRow({
              inc: 'INC',
              sa2: 'SA2',
              ordinary: 'ORDINARI',
              employee: employee.employeeCode,
              year: year,
              period: period,
              code: 'faults',
              date: firstDate,
              faults: faults,
            })
          }
        }
      }
      blankMissingTexts(workbook)
      const buffer = await workbook.csv.writeBuffer()

      return {
        status: 201,
        type: 'success',
        title: this.t('resource'),
        message: this.t('resource_was_created_successfully'),
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: this.t('server_error'),
        message: this.t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  async getFaultsFromEmployeeCalendar(employeeCalendar: AssistDayInterface[], tardies: number, toleranceCountPerAbsences: number) {
    let daysWorked = 0
    let daysOnTime = 0
    let tolerances = 0
    let delays = 0
    let earlyOuts = 0
    let rests = 0
    let sundayBonus = 0
    let vacations = 0
    let holidaysWorked = 0
    let restWorked = 0
    let faults = 0
    let delayFaults = 0
    let earlyOutsFaults = 0
    const exceptions = [] as ShiftExceptionInterface[]
    for await (const calendar of employeeCalendar) {
      if (!calendar.assist.isFutureDay) {
        let laborRestCounted = false
        if (calendar.assist.exceptions.length > 0) {
          for await (const exception of calendar.assist.exceptions) {
            if (exception.exceptionType) {
              const exceptionTypeSlug = exception.exceptionType.exceptionTypeSlug
              if (exceptionTypeSlug !== 'rest-day' && exceptionTypeSlug !== 'vacation') {
                exceptions.push(exception)
              }
              if (exceptionTypeSlug === 'descanso-laborado') {
                if (
                  exception.shiftExceptionEnjoymentOfSalary &&
                  exception.shiftExceptionEnjoymentOfSalary === 1 &&
                  calendar.assist.checkIn
                ) {
                  restWorked += 1
                  laborRestCounted = true
                }
              }
            }
          }
        }
        const firstCheck = this.chekInTime(calendar)
        if (calendar.assist.dateShift) {
          daysWorked += 1
          if (calendar.assist.checkInStatus !== 'fault') {
            if (calendar.assist.checkInStatus === 'ontime') {
              daysOnTime += 1
            } else if (calendar.assist.checkInStatus === 'tolerance') {
              tolerances += 1
            } else if (calendar.assist.checkInStatus === 'delay') {
              delays += 1
            }
          }
          if (calendar.assist.checkOutStatus !== 'fault') {
            if (calendar.assist.checkOutStatus === 'delay') {
              earlyOuts += 1
            }
          }
          if (
            calendar.assist.isSundayBonus &&
            (calendar.assist.checkIn ||
              calendar.assist.checkOut ||
              (calendar.assist.assitFlatList && calendar.assist.assitFlatList.length > 0))
          ) {
            sundayBonus += 1
          }
          if (calendar.assist.isRestDay && !firstCheck) {
            rests += 1
          }
          if (calendar.assist.isVacationDate) {
            vacations += 1
          }
          if (calendar.assist.checkInStatus === 'fault' && !calendar.assist.isRestDay) {
            faults += 1
          }
        }
        if (calendar.assist.isHoliday && calendar.assist.checkIn) {
          holidaysWorked += 1
          if (!laborRestCounted) {
            restWorked += 1
          }
        }
      }
    }

    const delayTolerances = this.getFaultsFromDelays(tolerances, toleranceCountPerAbsences)
    delays += delayTolerances

    delayFaults = this.getFaultsFromDelays(delays, tardies)
    earlyOutsFaults = this.getFaultsFromDelays(earlyOuts, tardies)
    faults = faults + delayFaults + earlyOutsFaults
    return faults
  }

  isPayThursday(dateToCheck: string, referencePayDate: string): boolean {
    // Días de calendario en UTC: con la zona del servidor el jueves caía en miércoles.
    const referenceDate = utcCalendarDay(referencePayDate)
    const targetDate = utcCalendarDay(dateToCheck)
    if (!referenceDate.isValid) {
      return false
    }
    if (!targetDate.isValid) {
      return false
    }
    const isThursday = targetDate.weekday === 4
    if (!isThursday) {
      return false
    }
    const differenceInDays = Math.abs(targetDate.diff(referenceDate, 'days').days)

    return differenceInDays % 14 === 0
  }

  calculatePayPeriod(datePay: string) {
    const date = DateTime.fromISO(datePay)
    if (!date.isValid) {
      return 0
    }
    const dayOfYear = date.ordinal
    const payPeriodNumber = Math.ceil(dayOfYear / 14)

    return payPeriodNumber
  }

  /** Retardos que suman una falta, según la empresa activa. */
  async getToleranceCountPerAbsence() {
    const systemSetting = await new SystemSettingService().resolveForActiveTenant()

    return systemSetting?.systemSettingToleranceCountPerAbsence || DEFAULT_TOLERANCE_COUNT_PER_ABSENCE
  }

  /**
   * Indica si el empleado puede incluirse en reportes de nómina del monitor,
   * replicando `computeDepartmentStatistics` del front
   * (`employeeAssistDiscriminator === 0`).
   */
  private isPayrollAssistEligibleEmployee(employee: Employee): boolean {
    return employee.employeeAssistDiscriminator === 0
  }

  /**
   * Indica si el empleado tiene días evaluables en el periodo, replicando
   * `computeDepartmentStatistics` del front (`totalAvailable > 0`).
   */
  private hasPayrollEvaluableAttendance(employeeCalendar: AssistDayInterface[]): boolean {
    const evaluableDays = employeeCalendar.filter(
      (day) =>
        !day.assist.isFutureDay &&
        !day.assist.isRestDay &&
        !day.assist.isVacationDate &&
        !day.assist.isHoliday &&
        !day.assist.isWorkDisabilityDate &&
        !day.assist.hasExceptions
    )
    const assists = evaluableDays.filter((day) => day.assist.checkInStatus === 'ontime').length
    const tolerances = evaluableDays.filter((day) => day.assist.checkInStatus === 'tolerance').length
    const delays = evaluableDays.filter((day) => day.assist.checkInStatus === 'delay').length
    const faults = evaluableDays.filter((day) => day.assist.checkInStatus === 'fault').length
    return assists + tolerances + delays + faults > 0
  }

  /**
   * Parámetros para armar filas de nómina de un departamento con el mismo
   * orden que el front (`fetchEmployees` → `orderBy: name`, `ascend`).
   */
  private async appendIncidentPayrollRowsForDepartmentEmployees(params: {
    departmentId: number
    filterDate: string
    filterDateEnd: string
    filterDatePay: string
    userResponsibleId?: number
    businessUnitId?: number
    payrollBusinessUnitId?: number
    branchNameIds?: number[]
    businessUnitFilterIds: number[]
    employeeService: EmployeeService
    syncAssistsService: SyncAssistsService
    tardies: number
    toleranceCountPerAbsences: number
    rowsIncidentPayroll: AssistIncidentPayrollExcelRowInterface[]
    page: number
    limit: number
    /**
     * Gancho opcional de progreso (job asíncrono): se invoca una vez por
     * cada empleado considerado del departamento, se incluya o no en el
     * reporte (elegibilidad/asistencia evaluable). No altera el cálculo;
     * los llamadores que no lo necesitan simplemente no lo pasan.
     */
    onEmployeeIterated?: () => Promise<void>
  }): Promise<void> {
    const resultEmployes = await this.fetchEmployeesForExcelReport(
      params.employeeService,
      {
        search: '',
        departmentId: params.departmentId,
        positionId: 0,
        employeeWorkSchedule: '',
        page: params.page,
        limit: params.limit,
        orderBy: 'name',
        orderDirection: 'ascend',
        ignoreDiscriminated: 1,
        ignoreExternal: 1,
        onlyPayroll: false,
        userResponsibleId: params.userResponsibleId,
        payrollBusinessUnitId: params.payrollBusinessUnitId,
        branchNameIds: params.branchNameIds,
      },
      [params.departmentId],
      params.businessUnitId,
      params.businessUnitFilterIds
    )
    if (!resultEmployes) {
      return
    }

    for (const employee of resultEmployes.all()) {
      if (!this.isPayrollAssistEligibleEmployee(employee)) {
        await params.onEmployeeIterated?.()
        continue
      }

      const result = await params.syncAssistsService.index(
        {
          date: params.filterDate,
          dateEnd: params.filterDateEnd,
          employeeID: employee.employeeId,
          withOutExternal: true,
        },
        { page: params.page, limit: params.limit }
      )
      const data: any = result.data
      this.adoptCalendarZone(data)
      if (!data?.employeeCalendar) {
        await params.onEmployeeIterated?.()
        continue
      }

      const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
      if (!this.hasPayrollEvaluableAttendance(employeeCalendar)) {
        await params.onEmployeeIterated?.()
        continue
      }

      const incidentPayrollFilters: AssistIncidentPayrollCalendarExcelFilterInterface = {
        employee: employee,
        employeeCalendar: employeeCalendar,
        tardies: params.tardies,
        datePay: params.filterDatePay,
        toleranceCountPerAbsences: params.toleranceCountPerAbsences,
      }
      const newRows = await this.addRowIncidentPayrollCalendar(incidentPayrollFilters)
      for (const row of newRows) {
        params.rowsIncidentPayroll.push(row)
      }
      await params.onEmployeeIterated?.()
    }
  }

  /**
   * Título de la prenómina en formato neutral. Conserva la retícula de filas
   * 1-4 (la cabecera vive en la fila 5 y el resto del reporte usa filas fijas);
   * los bloques A2:E4 y O2 quedan vacíos donde antes iban los logotipos.
   */
  addTitleIncidentPayrollToWorkSheet(worksheet: ExcelJS.Worksheet, title: string) {
    worksheet.addRow([])
    worksheet.addRow([])
    worksheet.addRow([])
    worksheet.addRow([])

    worksheet.getRow(1).height = 26
    worksheet.getRow(2).height = 52
    worksheet.getRow(3).height = 10
    worksheet.getRow(4).height = 10

    worksheet.mergeCells(`A1:${getIncidentPayrollExcelLastColumnLetter()}1`)
    worksheet.mergeCells('A2:E4')
    worksheet.mergeCells('F2:N2')
    worksheet.mergeCells(`O2:${getIncidentPayrollExcelLastColumnLetter()}4`)
    worksheet.mergeCells('F3:N4')

    const reportLabelCell = worksheet.getCell('A1')
    reportLabelCell.value = this.t('incident_summary_payroll')
    reportLabelCell.font = { bold: true, size: 13, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    reportLabelCell.alignment = { horizontal: 'center', vertical: 'middle' }

    const bannerCell = worksheet.getCell('F2')
    bannerCell.value = title
    bannerCell.font = { bold: true, size: 16, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    bannerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

    worksheet.views = frozenHeaderViews(5)
  }

  addHeadRowIncidentPayroll(worksheet: ExcelJS.Worksheet) {
    const headerCells = [
      this.t('work_business_unit'),
      this.t('payroll_business_unit'),
      this.t('report_employee_name'),
      this.t('report_employee_id'),
      this.t('department'),
      this.t('company'),
      this.t('fault'),
      this.t('delay'),
      this.t('leaves'),
    ]

    if (isPayrollOvertimeIncludeUnauthorizedEnabled()) {
      headerCells.push(
        this.t('extended_double_overtime_hours'),
        this.t('double_overtime_hours'),
        this.t('extended_triple_overtime_hours'),
        this.t('triple_overtime_hours')
      )
    } else {
      headerCells.push(this.t('double_overtime_hours'), this.t('triple_overtime_hours'))
    }

    headerCells.push(
      this.t('sunday_bonus_abb'),
      this.t('rest_day_worked'),
      this.t('vacation_bonus'),
      this.t('leveling'),
      this.t('bonus'),
      this.t('others')
    )

    const headerRow = worksheet.addRow(headerCells)
    const totalColumns = getIncidentPayrollExcelColumnCount()
    // Encabezado neutral: un solo gris para todos los grupos de columnas
    for (let col = 1; col <= totalColumns; col++) {
      const cell = worksheet.getCell(5, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.height = 40
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    worksheet.getColumn(1).width = 25
    worksheet.getColumn(2).width = 25
    worksheet.getColumn(3).width = 42
    worksheet.getColumn(4).width = 10
    worksheet.getColumn(5).width = 28.57
    worksheet.getColumn(6).width = 11.43
    for (let index = 1; index <= 6; index++) {
      const cell = worksheet.getCell(5, index)
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    }
    for (let col = 7; col <= totalColumns; col++) {
      const cell = worksheet.getCell(5, col)
      if (col >= 7) {
        worksheet.getColumn(col).width = col <= 9 ? 10 : col === totalColumns ? 40 : 10
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
    }
  }

  private getIncidentPayrollColumnLayout() {
    if (isPayrollOvertimeIncludeUnauthorizedEnabled()) {
      return {
        faults: 7,
        delays: 8,
        inc: 9,
        overtimeExtendedDouble: 10,
        overtimeDouble: 11,
        overtimeExtendedTriple: 12,
        overtimeTriple: 13,
        sundayBonus: 14,
        laborRest: 15,
        vacationBonus: 16,
        others: 19,
      }
    }

    return {
      faults: 7,
      delays: 8,
      inc: 9,
      overtimeDouble: 10,
      overtimeTriple: 11,
      sundayBonus: 12,
      laborRest: 13,
      vacationBonus: 14,
      others: 17,
    }
  }

  private buildIncidentPayrollExcelRowValues(rowData: AssistIncidentPayrollExcelRowInterface) {
    const values: Array<string | number> = [
      rowData.workBusinessUnit,
      rowData.payrollBusinessUnit,
      rowData.employeeName,
      rowData.employeeId,
      rowData.department,
      rowData.company,
      rowData.faults ? rowData.faults : '',
      rowData.delays ? rowData.delays : '',
      rowData.inc ? rowData.inc : '',
    ]

    if (isPayrollOvertimeIncludeUnauthorizedEnabled()) {
      values.push(
        rowData.overtimeExtendedDouble ? rowData.overtimeExtendedDouble : '',
        rowData.overtimeDouble ? rowData.overtimeDouble : '',
        rowData.overtimeExtendedTriple ? rowData.overtimeExtendedTriple : '',
        rowData.overtimeTriple ? rowData.overtimeTriple : ''
      )
    } else {
      values.push(
        rowData.overtimeDouble ? rowData.overtimeDouble : '',
        rowData.overtimeTriple ? rowData.overtimeTriple : ''
      )
    }

    values.push(
      rowData.sundayBonus ? rowData.sundayBonus : '',
      rowData.laborRest ? rowData.laborRest : '',
      rowData.vacationBonus ? rowData.vacationBonus : '',
      rowData.leveling,
      rowData.bonus,
      rowData.others
    )

    return values
  }

  async addRowIncidentPayrollCalendar(
   filters: AssistIncidentPayrollCalendarExcelFilterInterface
  ) {
    const rows = [] as AssistIncidentPayrollExcelRowInterface[]
    // TODO(USRH1788466831291): misma regla que #utils/org_alias_display.
    // Converger al helper cuando se toque este reporte.
    let department = filters.employee.department?.departmentAlias ? filters.employee.department.departmentAlias : ''
    department =
      department === '' && filters.employee.department?.departmentName
        ? filters.employee.department.departmentName
        : department
    let daysWorked = 0
    let daysOnTime = 0
    let tolerances = 0
    let delays = 0
    let earlyOuts = 0
    let rests = 0
    let sundayBonus = 0
    let laborRest = 0
    let vacations = 0
    let holidaysWorked = 0
    let faults = 0
    let delayFaults = 0
    let earlyOutsFaults = 0
    let vacationBonus = 0
    let daysWorkDisability = 0
    const exceptions = [] as ShiftExceptionInterface[]
    for await (const calendar of filters.employeeCalendar) {
      if (!calendar.assist.isFutureDay) {
        let faultProcessed = false
        let laborRestCounted = false
        if (calendar.assist.exceptions.length > 0) {
          for await (const exception of calendar.assist.exceptions) {
            if (exception.exceptionType) {
              const exceptionTypeSlug = exception.exceptionType.exceptionTypeSlug
              if (exceptionTypeSlug !== 'rest-day' && exceptionTypeSlug !== 'vacation') {
                exceptions.push(exception)
              }
              if (exceptionTypeSlug === 'descanso-laborado') {
                if (
                  exception.shiftExceptionEnjoymentOfSalary &&
                  exception.shiftExceptionEnjoymentOfSalary === 1 &&
                  calendar.assist.checkIn
                ) {
                  laborRest += 1
                  laborRestCounted = true
                }
              } else if (
                (exceptionTypeSlug === 'falta-por-incapacidad' ||
                  exceptionTypeSlug === 'incapacidad-por-maternidad') &&
                exception.shiftExceptionEnjoymentOfSalary !== 0
              ) {
                daysWorkDisability += 1
              }
              if (
                exceptionTypeSlug === 'absence-from-work' &&
                exception.shiftExceptionEnjoymentOfSalary !== 1
              ) {
                faultProcessed = true
                if (
                  calendar.assist.dateShift &&
                  calendar.assist.dateShift.shiftAccumulatedFault > 0
                ) {
                  faults += calendar.assist.dateShift.shiftAccumulatedFault
                } else {
                  faults += 1
                }
              }
            }
          }
        }
        const firstCheck = this.chekInTime(calendar)
        if (calendar.assist.dateShift) {
          daysWorked += 1
          if (calendar.assist.checkInStatus !== 'fault') {
            if (calendar.assist.checkInStatus === 'ontime') {
              daysOnTime += 1
            } else if (calendar.assist.checkInStatus === 'tolerance') {
              tolerances += 1
            } else if (calendar.assist.checkInStatus === 'delay') {
              delays += 1
            }
          }
          if (calendar.assist.checkOutStatus !== 'fault') {
            if (calendar.assist.checkOutStatus === 'delay') {
              earlyOuts += 1
            }
          }
          if (
            calendar.assist.isSundayBonus &&
            (calendar.assist.checkIn ||
              calendar.assist.checkOut ||
              (calendar.assist.assitFlatList && calendar.assist.assitFlatList.length > 0))
          ) {
            if (!calendar.assist.isRestDay) {
              sundayBonus += 1
            } else if (calendar.assist.exceptions.find(a => a.exceptionType?.exceptionTypeSlug === 'descanso-laborado')) {
              sundayBonus += 1
            }
          }
          if (calendar.assist.isRestDay && !firstCheck) {
            rests += 1
          }
          if (calendar.assist.isVacationDate) {
            vacations += 1
          }
          if (
            calendar.assist.checkInStatus === 'fault' &&
            !calendar.assist.isRestDay && !calendar.assist.isFutureDay &&
            !faultProcessed
          ) {
            if (calendar.assist.dateShift && calendar.assist.dateShift.shiftAccumulatedFault > 0) {
              faults += calendar.assist.dateShift.shiftAccumulatedFault
            } else {
              faults += 1
            }
          }
        }
        if (calendar.assist.isHoliday && calendar.assist.checkIn) {
          holidaysWorked += 1
          if (!laborRestCounted) {
            laborRest += 1
          }
        }
      }
    }

    const delayTolerances = this.getFaultsFromDelays(tolerances, filters.toleranceCountPerAbsences)
    delays += delayTolerances

    delayFaults = this.getFaultsFromDelays(delays, filters.tardies)
    earlyOutsFaults = this.getFaultsFromDelays(earlyOuts, filters.tardies)

    vacationBonus = this.getVacationBonus(filters.employee, filters.datePay)

    const overtimeMeasurementService = new PayrollOvertimeMeasurementService()
    const overtimeMeasurement = await overtimeMeasurementService.measureEmployeeOvertime(
      filters.employee,
      filters.employeeCalendar
    )

    const overtimeAllocationService = new PayrollOvertimeAllocationService()
    const overtimeAllocation = overtimeAllocationService.allocateFromMeasurement(
      filters.employee,
      overtimeMeasurement
    )

    let extendedAllocation = null
    let extendedMeasurement = null
    let overtimeExtendedDouble: number | undefined
    let overtimeExtendedTriple: number | undefined

    if (isPayrollOvertimeIncludeUnauthorizedEnabled()) {
      const unauthorizedService = new PayrollOvertimeUnauthorizedService()
      extendedMeasurement = unauthorizedService.buildExtendedMeasurement(
        overtimeMeasurement,
        filters.employeeCalendar
      )
      extendedAllocation = overtimeAllocationService.allocateFromMeasurement(
        filters.employee,
        extendedMeasurement
      )
      overtimeExtendedDouble = overtimeAllocationService.minutesToDisplayHours(
        extendedAllocation.totalDoubleMinutes
      )
      overtimeExtendedTriple = overtimeAllocationService.minutesToDisplayHours(
        extendedAllocation.totalTripleMinutes
      )
    }

    const overtimeWeeklyDetailService = new PayrollOvertimeWeeklyDetailService()
    await overtimeWeeklyDetailService.persistEmployeeAllocation(
      overtimeAllocation,
      extendedAllocation
    )

    const overtimeDouble = overtimeAllocationService.minutesToDisplayHours(
      overtimeAllocation.totalDoubleMinutes
    )
    const overtimeTriple = overtimeAllocationService.minutesToDisplayHours(
      overtimeAllocation.totalTripleMinutes
    )
    const workingTimeRuleUnresolved = overtimeMeasurement.workingTimeRuleUnresolved

    let company = ''
    if (filters.employee.payrollBusinessUnitId) {
      const payrollBusinessUnit = this.businessUnits.find(
        (item) => item.businessUnitId === filters.employee.payrollBusinessUnitId
      )
      if (payrollBusinessUnit) {
        company = payrollBusinessUnit.businessUnitName
      }
    }
    let workBusinessUnit = ''
    if (filters.employee.businessUnitId) {
      const workBu = this.businessUnits.find(
        (item) => item.businessUnitId === filters.employee.businessUnitId
      )
      if (workBu) {
        workBusinessUnit = workBu.businessUnitName
      }
    }
    rows.push({
      workBusinessUnit: workBusinessUnit,
      payrollBusinessUnit: company,
      employeeName: reportFullName(
        filters.employee.person?.personFirstname,
        filters.employee.person?.personLastname,
        filters.employee.person?.personSecondLastname
      ),
      employeeId: filters.employee.employeePayrollCode?.toString() || '',
      department: department,
      company: company,
      faults: faults,
      delays: delayFaults + earlyOutsFaults,
      inc: daysWorkDisability,
      overtimeDouble: overtimeDouble,
      overtimeTriple: overtimeTriple,
      overtimeExtendedDouble: overtimeExtendedDouble,
      overtimeExtendedTriple: overtimeExtendedTriple,
      workingTimeRuleUnresolved: workingTimeRuleUnresolved,
      sundayBonus: sundayBonus,
      laborRest: laborRest,
      vacationBonus: vacationBonus,
      leveling: '',
      bonus: '',
      others: workingTimeRuleUnresolved ? this.t('working_time_rule_unresolved_mark') : '',
      overtimeMeasurement: overtimeMeasurement,
      overtimeAllocation: overtimeAllocation,
    })
    return rows
  }

  async addRowIncidentPayrollToWorkSheet(
    rows: AssistIncidentPayrollExcelRowInterface[],
    worksheet: ExcelJS.Worksheet
  ) {
    const columns = this.getIncidentPayrollColumnLayout()
    let rowCount = 5
    for await (const rowData of rows) {
      if (rowData.employeeName !== 'null') {
        const fgColor = REPORT_NEUTRAL_ARGB.text
        worksheet.addRow(this.buildIncidentPayrollExcelRowValues(rowData)).font = {
          color: { argb: fgColor },
        }
        let cell = worksheet.getCell(rowCount + 1, 6)
        cell.font = { bold: true }
        if (rowData.faults > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.faults)
          cell.font = { color: { argb: 'FF9C0006' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' },
          }
        }
        if (rowData.delays > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.delays)
          cell.font = { color: { argb: 'FF9C0006' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' },
          }
        }
        if (rowData.inc > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.inc)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (rowData.overtimeDouble > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeDouble)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (rowData.overtimeTriple > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeTriple)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (
          isPayrollOvertimeIncludeUnauthorizedEnabled() &&
          rowData.overtimeExtendedDouble &&
          rowData.overtimeExtendedDouble > 0 &&
          'overtimeExtendedDouble' in columns
        ) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeExtendedDouble!)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (
          isPayrollOvertimeIncludeUnauthorizedEnabled() &&
          rowData.overtimeExtendedTriple &&
          rowData.overtimeExtendedTriple > 0 &&
          'overtimeExtendedTriple' in columns
        ) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeExtendedTriple!)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (rowData.workingTimeRuleUnresolved) {
          cell = worksheet.getCell(rowCount + 1, columns.others)
          cell.font = { color: { argb: 'FF9C6500' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' },
          }
        }
        if (rowData.sundayBonus > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.sundayBonus)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (rowData.vacationBonus > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.vacationBonus)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        if (rowData.laborRest > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.laborRest)
          cell.font = { color: { argb: 'FF006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          }
        }
        rowCount += 1
      }
    }
  }

  /**
   * Carga en memoria las unidades de negocio para resolver nombres en el Excel payroll.
   */
  async getBusinessUnits(): Promise<void> {
    this.businessUnits = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_id')
  }

  /** Nombre comercial de la empresa activa, para encabezar sus reportes. */
  async getTradeName() {
    const systemSetting = await new SystemSettingService().resolveForActiveTenant()

    return systemSetting?.systemSettingTradeName || PLATFORM_FALLBACK_TRADE_NAME
  }

  paintBorderAll(worksheet: ExcelJS.Worksheet, rowCount: number) {
    const totalColumns = getIncidentPayrollExcelColumnCount()
    for (let rowIndex = 6; rowIndex <= rowCount + 5; rowIndex++) {
      const row = worksheet.getRow(rowIndex)
      for (let colNumber = 1; colNumber <= totalColumns; colNumber++) {
        const cell = row.getCell(colNumber)
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        }
      }
    }
  }

  decimalToTimeString(decimal: number): string {
    return formatDecimalHours(decimal)
  }

  /** Margen de impuntualidad de la empresa activa. */
  async getTardiesTolerance() {
    return this.resolveTenantToleranceMinutes(
      'TardinessTolerance',
      DEFAULT_TARDINESS_TOLERANCE_MINUTES
    )
  }

  /**
   * Minutos de una tolerancia DE LA EMPRESA ACTIVA, con su default si la empresa
   * no la tiene configurada o si no hay empresa en contexto.
   *
   * Los tres métodos que la consultan resolvían antes por la configuración de
   * PLATAFORMA: la tolerancia de un cliente salía de una fila global que
   * ninguno de ellos podía ver ni ajustar, y la que sí ajustaban desde su
   * backoffice no la miraba nadie.
   */
  private async resolveTenantToleranceMinutes(
    toleranceName: string,
    defaultMinutes: number
  ): Promise<number> {
    const systemSetting = await new SystemSettingService().resolveForActiveTenant()

    if (!systemSetting) {
      return defaultMinutes
    }

    const tolerance = systemSetting.systemSettingTolerances.find(
      (item) => item.toleranceName === toleranceName
    )

    return tolerance?.toleranceMinutes ?? defaultMinutes
  }

  getVacationBonus(employee: Employee, datePay: string) {
    if (!employee.employeeHireDate) {
      return 0
    }
    if (!datePay) {
      return 0
    }

    if (!this.isFirstPayMonth(datePay)) {
      return 0
    }

    if (this.isAnniversaryInPayMonth(employee.employeeHireDate.toString(), datePay)) {
      return 1
    }

    return 0
  }

  isFirstPayMonth(dateString: string) {
    const dayOfMonth = utcCalendarDay(dateString).day

    return dayOfMonth >= 1 && dayOfMonth <= 15
  }

  isAnniversaryInPayMonth(hireDate: string, datePay: string) {
    const hire = utcCalendarDay(hireDate)
    const pay = utcCalendarDay(datePay)

    return hire.isValid && pay.isValid && hire.month === pay.month
  }

  async getDaysWorkDisability(employee: Employee, datePay: string) {
    if (!employee.employeeHireDate) {
      return 0
    }
    if (!datePay) {
      return 0
    }
    let pay = new Date(datePay)
    pay.setDate(pay.getDate() - 13)
    let newDateStart = DateTime.fromJSDate(pay).toFormat('yyyy-LL-dd')
    const startDate = `${newDateStart} 00:00:00`
    const endDate = `${datePay} 23:59:59`

    await employee.load('shift_exceptions', (query) => {
      query.where('shiftExceptionsDate', '>=', startDate)
      query.where('shiftExceptionsDate', '<=', endDate)
      query.whereNotNull('work_disability_period_id')
    })

    return employee.shift_exceptions.length
  }

  async getDaysWorkDisabilityAll(filters: EmployeeWorkDaysDisabilityFilterInterface) {
    const pay = new Date(filters.datePay)
    pay.setDate(pay.getDate() - 13)
    const newDateStart = DateTime.fromJSDate(pay).toFormat('yyyy-LL-dd')
    const startDate = `${newDateStart} 00:00:00`
    const endDate = `${filters.datePay} 23:59:59`
    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('employee_hire_date')
      .if(filters.departmentId && filters.departmentId > 0, (query) => {
        query.where('department_id', filters.departmentId)
      })
      .if(filters.employeeId && filters.employeeId, (query) => {
        query.where('employee_id', filters.employeeId)
      })
      .preload('shift_exceptions', (query) => {
        query
          .where('shiftExceptionsDate', '>=', startDate)
          .where('shiftExceptionsDate', '<=', endDate)
          .whereNotNull('work_disability_period_id')
      })
      .orderBy('employee_id')

    return employees.filter(a => a.shift_exceptions.length > 0)
  }

  async getAssistFlatList (filters: AssistFlatFilterInterface) {
    let employee: Employee | null = null

    if (filters.employeeId) {
      employee = await Employee.query()
        .where('employee_id', filters.employeeId || 0)
        .withTrashed()
        .first()

      if (!employee) {
        return []
      }
    }

    // Zona del sitio del empleado (o del sistema sin empleado): acota el
    // rango como instantes y agrupa las checadas por su día civil ahí.
    const resolvedZone = employee
      ? await new SiteTimeZoneService().forEmployee(employee.employeeId)
      : resolveSiteTimeZone([])
    const zone = resolvedZone.zone
    const filterInitialDate = DateTime.fromISO(`${filters.dateStart}T00:00:00`, { zone })
      .toUTC()
      .toFormat('yyyy-LL-dd HH:mm:ss')
    const filterEndDate = DateTime.fromISO(`${filters.dateEnd}T23:59:59`, { zone })
      .plus({ days: 1 })
      .toUTC()
      .toFormat('yyyy-LL-dd HH:mm:ss')
    const query = Assist.query()
      .where('assist_active', 1)

    if (filters.dateEnd && filters.dateStart) {
      query.where('assist_punch_time_utc', '>=', filterInitialDate)
      query.where('assist_punch_time_utc', '<=', filterEndDate)
    }

    if (employee) {
      query.where('assist_emp_code', employee.employeeCode)
    }

    query.orderBy('assist_punch_time_utc', 'desc')

    const assistList = await query.paginate(1, 500)
    const assistListFlat = assistList.toJSON().data as AssistInterface[]
    const assistDayCollection: AssistDayInterface[] = []



    for await (const item of assistListFlat) {
      const assist = item as AssistInterface
      const assistDayStr = dayKeyOf(assist.assistPunchTimeUtc, zone)

      const existDay = assistDayCollection.find((itemAssistDay) => itemAssistDay.day === assistDayStr)

      if (!existDay) {
        let dayAssist: AssistInterface[] = []

        for await (const dayItem of assistListFlat) {
          const currentDay = dayKeyOf(dayItem.assistPunchTimeUtc, zone)

          if (currentDay === assistDayStr) {
            dayAssist.push(dayItem)
          }
        }

        dayAssist = dayAssist.sort((a: any, b: any) => a.assistPunchTimeUtc - b.assistPunchTimeUtc)

        return dayAssist
      }
    }

    return []
  }

  async updateAssistCalendar(employeeId: number, date: Date) {
    const dateStart = new Date(date)
    dateStart.setDate(dateStart.getDate() - 1)

    const dateEnd = new Date(date)
    dateEnd.setDate(dateEnd.getDate() + 1)

    const filter: SyncAssistsServiceIndexInterface = {
      date: this.formatDate(dateStart),
      dateEnd: this.formatDate(dateEnd),
      employeeID: employeeId
    }
    const syncAssistsService = new SyncAssistsService(this.i18n)
    await syncAssistsService.setDateCalendar(filter)
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }

  async getExcelPermissionsByDates(filters: PermissionsDatesExcelFilterInterface, departmentsList: Array<number>, allowedBusinessUnitIds: number[] = []) {
    try {
      const filterDate = filters.filterDate
      const filterDateEnd = filters.filterDateEnd
      const userResponsibleId = filters.userResponsibleId

      const employeeService = new EmployeeService(this.i18n)
      const employees = await this.fetchEmployeesForExcelReport(
        employeeService,
        {
          search: '',
          departmentId: departmentsList,
          positionId: 0,
          page: 1,
          limit: 999999,
          employeeWorkSchedule: '',
          ignoreDiscriminated: 0,
          ignoreExternal: 1,
          userResponsibleId: userResponsibleId || undefined,
          payrollBusinessUnitId: filters.payrollBusinessUnitId,
        },
        departmentsList,
        filters.businessUnitId,
        allowedBusinessUnitIds
      )
      if (!employees) {
        return this.buildExcelBusinessUnitScopeError()
      }

      // Crear workbook
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Permisos por Fechas')

      // Formato neutral: sin logotipo ni franjas de marca. La fila 1 se conserva
      // vacía con altura normal para no mover las filas del reporte.
      worksheet.mergeCells('A1:J1')
      const titleRow = worksheet.addRow(['Reporte de Permisos por Fechas'])
      titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:K2')

      // Período
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:K3')

      // Headers
      const headerRow = worksheet.addRow([
        'Unidad de negocio de trabajo',
        'Unidad de nómina',
        'ID Empleado',
        'Empleado',
        'Departamento',
        'Posición',
        'Fecha',
        'Tipo de Permiso',
        'Descripción',
        'Hora Entrada',
        'Hora Salida'
      ])

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
        }
        cell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      headerRow.height = 25

      // Obtener datos de permisos para cada empleado
      const startDate = DateTime.fromISO(filterDate).toSQLDate()
      const endDate = DateTime.fromISO(filterDateEnd).toSQLDate()

      if (!startDate || !endDate) {
        return {
          status: 400,
          type: 'error',
          title: 'Error de fechas',
          message: 'Las fechas proporcionadas no son válidas',
          error: 'Invalid date format',
        }
      }

      for (const employee of employees) {
        // Obtener excepciones de turno (vacaciones, permisos, etc.)
        const shiftExceptions = await ShiftException.query()
          .where('employee_id', employee.employeeId)
          .whereBetween('shift_exceptions_date', [startDate!, endDate!])
          .whereNull('shift_exceptions_deleted_at')
          .preload('exceptionType')
          .preload('employee', (employeeQuery) => {
            employeeQuery.preload('person')
            employeeQuery.preload('department')
            employeeQuery.preload('position')
            employeeQuery.preload('businessUnit')
            employeeQuery.preload('payrollBusinessUnit')
          })
          .orderBy('shift_exceptions_date', 'asc')

        // Obtener incapacidades laborales
        const workDisabilities = await WorkDisability.query()
          .where('employee_id', employee.employeeId)
          .whereNull('work_disability_deleted_at')
          .preload('workDisabilityPeriods', (periodQuery) => {
            periodQuery.whereBetween('work_disability_period_start_date', [startDate!, endDate!])
            periodQuery.orWhereBetween('work_disability_period_end_date', [startDate!, endDate!])
            periodQuery.orWhere((query) => {
              query.where('work_disability_period_start_date', '<=', startDate!)
                   .andWhere('work_disability_period_end_date', '>=', endDate!)
            })
            periodQuery.whereNull('work_disability_period_deleted_at')
            periodQuery.preload('workDisabilityType')
          })
          .preload('employee', (employeeQuery) => {
            employeeQuery.preload('person')
            employeeQuery.preload('department')
            employeeQuery.preload('position')
            employeeQuery.preload('businessUnit')
            employeeQuery.preload('payrollBusinessUnit')
          })

        // Agregar excepciones de turno al reporte
        for (const exception of shiftExceptions) {
          const employeeName = reportFullName(
            exception.employee.person?.personFirstname,
            exception.employee.person?.personLastname
          )
          const departmentName = exception.employee.department?.departmentName || ''
          const positionName = exception.employee.position?.positionName || ''
          const exceptionDate = formatReportCalendarDate(exception.shiftExceptionsDate)
          const exceptionType = exception.exceptionType?.exceptionTypeTypeName || ''
          const description = exception.shiftExceptionsDescription || ''
          const checkInTime = exception.shiftExceptionCheckInTime || ''
          const checkOutTime = exception.shiftExceptionCheckOutTime || ''
          const payrollBuName = exception.employee.payrollBusinessUnit?.businessUnitName || ''
          const workBuName = exception.employee.businessUnit?.businessUnitName || ''

          worksheet.addRow([
            workBuName,
            payrollBuName,
            employee.employeePayrollCode,
            employeeName,
            departmentName,
            positionName,
            exceptionDate,
            exceptionType,
            description,
            checkInTime,
            checkOutTime
          ])
        }

        // Agregar incapacidades laborales al reporte
        for (const disability of workDisabilities) {
          for (const period of disability.workDisabilityPeriods) {
            const employeeName = reportFullName(
              disability.employee.person?.personFirstname,
              disability.employee.person?.personLastname
            )
            const departmentName = disability.employee.department?.departmentName || ''
            const positionName = disability.employee.position?.positionName || ''
            const payrollBuName = disability.employee.payrollBusinessUnit?.businessUnitName || ''
            const workBuName = disability.employee.businessUnit?.businessUnitName || ''

            // Generar fechas para cada día del período de incapacidad
            // Todo en días de calendario UTC: el periodo es columna DATE y el
            // rango del reporte es `yyyy-MM-dd`; mezclar zona del servidor y
            // medianoche UTC recortaba o añadía un día.
            const periodStart = utcCalendarDay(period.workDisabilityPeriodStartDate)
            const periodEnd = utcCalendarDay(period.workDisabilityPeriodEndDate)
            const reportStart = utcCalendarDay(filterDate)
            const reportEnd = utcCalendarDay(filterDateEnd)
            if (!periodStart.isValid || !periodEnd.isValid) {
              continue
            }

            // Calcular el rango de fechas que se superpone con el período del reporte
            const startRange = periodStart > reportStart ? periodStart : reportStart
            const endRange = periodEnd < reportEnd ? periodEnd : reportEnd

            let currentDate = startRange
            while (currentDate <= endRange) {
              const disabilityType = period.workDisabilityType?.workDisabilityTypeName || 'Incapacidad'
              const description = `Período: ${formatReportCalendarDate(period.workDisabilityPeriodStartDate)} a ${formatReportCalendarDate(period.workDisabilityPeriodEndDate)}`

              worksheet.addRow([
                workBuName,
                payrollBuName,
                employee.employeePayrollCode,
                employeeName,
                departmentName,
                positionName,
                currentDate.toFormat(REPORT_DATE_FORMAT),
                disabilityType,
                description,
                '',
                ''
              ])

              currentDate = currentDate.plus({ days: 1 })
            }
          }
        }
      }

      // Ajustar ancho de columnas
      worksheet.columns = [
        { width: 35 }, // UN Trabajo
        { width: 25 }, // UN Nómina
        { width: 25 }, // ID de Empleado
        { width: 25 }, // Empleado
        { width: 20 }, // Departamento
        { width: 20 }, // Posición
        { width: 12 }, // Fecha
        { width: 20 }, // Tipo de Permiso
        { width: 30 }, // Descripción
        { width: 12 }, // Hora Entrada
        { width: 12 }  // Hora Salida
      ]

      // Generar buffer
      blankMissingTexts(workbook)
      const buffer = await workbook.xlsx.writeBuffer()

      return {
        status: 201,
        type: 'success',
        title: 'Excel',
        message: 'Reporte de permisos generado exitosamente',
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server Error',
        message: 'Ha ocurrido un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  capitalizeFirstLetter(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Crea las asistencias demo de 2 meses atras a partir de hoy hacia atras
   *
   * Distribución de porcentajes:
   * - 90% on time (a tiempo)
   * - 5% tolerancia (dentro del rango de tolerancia)
   * - 3% retardos (dentro del rango de delay)
   * - 2% faltas (no se crea la asistencia)
   *
   * @returns Objeto con el resultado de la operación y las asistencias creadas
   */
  async createAssistDemo() {
    try {
      const createdAssists: { [key: string]: Assist } = {}

      const delayToleranceMinutes = await this.getDelayToleranceMinutes()
      const faultToleranceMinutes = await this.getTardinessToleranceMinutes()

      const employees = await Employee.query()
        .preload('employeeShifts', (employeeShiftQuery) => {
          employeeShiftQuery.preload('shift')
        })
        .whereNull('employee_deleted_at')

      if (!employees || employees.length === 0) {
        return {
          status: 400,
          type: 'error',
          title: 'Employees not found',
          message: 'The employees were not found',
          data: null,
        }
      }
      const activeUnits = await BusinessUnit.query().where('business_unit_active', 1).select('business_unit_slug')
      const businessList = activeUnits.map((u) => u.businessUnitSlug).filter(Boolean)

      const holidays = await Holiday.query()
        .whereNull('holiday_deleted_at')
        .whereBetween('holiday_date', [DateTime.now().minus({ months: 2 }).toFormat('yyyy-MM-dd'), DateTime.now().toFormat('yyyy-MM-dd')])
        .andWhere((query) => {
          query.andWhere((subQuery) => {
            businessList.forEach((business) => {
              subQuery.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [business])
            })
          })
        })


      const siteTimeZoneService = new SiteTimeZoneService()
      for await(const employee of employees) {
        // Las checadas de demostración se escriben en UTC real desde la hora
        // de pared del sitio del empleado.
        const resolvedDemoZone = await siteTimeZoneService.forEmployee(employee.employeeId)
        const demoZone = resolvedDemoZone.zone
        const hourStart = employee.employeeShifts[0].shift.shiftTimeStart
        const activeHours = employee.employeeShifts[0].shift.shiftActiveHours
        const restDays = employee.employeeShifts[0].shift.shiftRestDays.split(',').map(Number)

        const today = new Date()
        const startDate = new Date(today)
        startDate.setMonth(startDate.getMonth() - 1)
        startDate.setDate(1)
        today.setHours(0, 0, 0, 0)
        today.setDate(today.getDate() + 1)

        // Recopilar todos los días laborables
        const workDays: Date[] = []
        let currentDate = new Date(startDate)

        while (currentDate <= today) {
          const jsDay = currentDate.getDay()
          const dayOfWeek = jsDay === 0 ? 7 : jsDay

          if (restDays.includes(dayOfWeek)) {
            currentDate.setDate(currentDate.getDate() + 1)
            continue
          }

          const currentDateString = DateTime.fromJSDate(currentDate).toFormat('yyyy-MM-dd')
          const isHoliday = holidays.some((holiday) => {
            let holidayDateString: string
            const holidayDate = holiday.holidayDate as any
            if (holidayDate instanceof Date) {
              holidayDateString = DateTime.fromJSDate(holidayDate).toFormat('yyyy-MM-dd')
            } else if (typeof holidayDate === 'string') {
              holidayDateString = holidayDate.split('T')[0]
            } else {
              holidayDateString = DateTime.fromISO(String(holidayDate)).toFormat('yyyy-MM-dd')
            }
            return holidayDateString === currentDateString
          })

          if (!isHoliday) {
            workDays.push(new Date(currentDate))
          }

          currentDate.setDate(currentDate.getDate() + 1)
        }

        // Distribuir días según porcentajes: 90% on time, 5% tolerancia, 3% retardos, 2% faltas
        const totalDays = workDays.length

        // Calcular primero las faltas (2%) para asegurar que siempre haya días sin asistencia
        const faultCount = Math.max(1, Math.round(totalDays * 0.02))
        const remainingDays = totalDays - faultCount

        // Calcular los porcentajes basados en el total original
        let onTimeCount = Math.round(totalDays * 0.90)
        let toleranceCount = Math.round(totalDays * 0.05)
        let delayCount = Math.round(totalDays * 0.03)

        // Verificar si la suma excede los días disponibles (sin contar faltas)
        let totalAssigned = onTimeCount + toleranceCount + delayCount

        // Si excede, ajustar proporcionalmente manteniendo los porcentajes relativos
        if (totalAssigned > remainingDays) {
          const excess = totalAssigned - remainingDays
          // Calcular factores de ajuste proporcional
          const onTimeFactor = onTimeCount / totalAssigned
          const toleranceFactor = toleranceCount / totalAssigned
          const delayFactor = delayCount / totalAssigned

          // Reducir proporcionalmente
          onTimeCount = Math.max(0, Math.round(onTimeCount - (excess * onTimeFactor)))
          toleranceCount = Math.max(0, Math.round(toleranceCount - (excess * toleranceFactor)))
          delayCount = Math.max(0, Math.round(delayCount - (excess * delayFactor)))

          // Ajuste final si todavía excede por redondeos
          totalAssigned = onTimeCount + toleranceCount + delayCount
          if (totalAssigned > remainingDays) {
            const finalExcess = totalAssigned - remainingDays
            onTimeCount = Math.max(0, onTimeCount - finalExcess)
          }
        } else if (totalAssigned < remainingDays) {
          // Si sobran días, agregarlos a onTimeCount para completar
          onTimeCount += remainingDays - totalAssigned
        }

        // Mezclar aleatoriamente los días
        const shuffledDays = [...workDays].sort(() => Math.random() - 0.5)
        const onTimeDays = shuffledDays.slice(0, onTimeCount)
        const toleranceDays = shuffledDays.slice(onTimeCount, onTimeCount + toleranceCount)
        const delayDays = shuffledDays.slice(onTimeCount + toleranceCount, onTimeCount + toleranceCount + delayCount)
        // Los días restantes (faultDays) no se procesan (se omiten)

        // Procesar días on time (90%)
        for await (const workDate of onTimeDays) {
          const dateString = DateTime.fromJSDate(workDate).toFormat('yyyy-MM-dd')
          const [hour, minute] = hourStart.split(':')

          // Permitir variación de -5 a 0 minutos (a tiempo o un poco antes)
          const minutesVariation = Math.floor(Math.random() * 6) - 5 // -5 a 0

          // Crear DateTime base con la hora de inicio
          const baseTimeString = `${dateString} ${hour}:${minute}:00`
          const baseTime = DateTime.fromFormat(baseTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: demoZone })

          // Aplicar variación de minutos (puede ser negativa)
          const punchTime = baseTime.plus({ minutes: minutesVariation }).toUTC()

          const createAssist = new Assist()
          createAssist.assistEmpId = employee.employeeId
          createAssist.assistEmpCode = employee.employeeCode.toString()
          createAssist.assistPunchTime = punchTime
          createAssist.assistPunchTimeUtc = punchTime
          createAssist.assistPunchTimeOrigin = punchTime
          createAssist.assistUploadTime = punchTime
          createAssist.assistSyncId = 0
          await createAssist.save()

          const checkOutTime = punchTime.plus({ hours: activeHours })
          const createAssistOut = new Assist()
          createAssistOut.assistEmpId = employee.employeeId
          createAssistOut.assistEmpCode = employee.employeeCode.toString()
          createAssistOut.assistPunchTime = checkOutTime
          createAssistOut.assistPunchTimeUtc = checkOutTime
          createAssistOut.assistPunchTimeOrigin = checkOutTime
          createAssistOut.assistUploadTime = checkOutTime
          createAssistOut.assistSyncId = 0
          await createAssistOut.save()
        }

        // Procesar días con tolerancia (5%)
        for await (const workDate of toleranceDays) {
          const dateString = DateTime.fromJSDate(workDate).toFormat('yyyy-MM-dd')
          const [hour, minute] = hourStart.split(':')

          // Variación de 1 a delayToleranceMinutes minutos (dentro de la tolerancia)
          const minutesVariation = Math.floor(Math.random() * delayToleranceMinutes) + 1
          const totalMinutes = Number(minute) + minutesVariation
          const finalHour = Number(hour) + Math.floor(totalMinutes / 60)
          const finalMinute = totalMinutes % 60
          const finalSecond = 0

          // Formatear la fecha/hora en formato yyyy-MM-dd HH:mm:ss
          const punchTimeString = `${dateString} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:${String(finalSecond).padStart(2, '0')}`
          const punchTime = DateTime.fromFormat(punchTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: demoZone }).toUTC()

          const createAssist = new Assist()
          createAssist.assistEmpId = employee.employeeId
          createAssist.assistEmpCode = employee.employeeCode.toString()
          createAssist.assistPunchTime = punchTime
          createAssist.assistPunchTimeUtc = punchTime
          createAssist.assistPunchTimeOrigin = punchTime
          createAssist.assistUploadTime = punchTime
          createAssist.assistSyncId = 0
          await createAssist.save()

          const checkOutTime = punchTime.plus({ hours: activeHours })

          const createAssistOut = new Assist()
          createAssistOut.assistEmpId = employee.employeeId
          createAssistOut.assistEmpCode = employee.employeeCode.toString()
          createAssistOut.assistPunchTime = checkOutTime
          createAssistOut.assistPunchTimeUtc = checkOutTime
          createAssistOut.assistPunchTimeOrigin = checkOutTime
          createAssistOut.assistUploadTime = checkOutTime
          createAssistOut.assistSyncId = 0
          await createAssistOut.save()
        }


        // Procesar días con retardo (3%)
        for await (const workDate of delayDays) {
          const dateString = DateTime.fromJSDate(workDate).toFormat('yyyy-MM-dd')
          const [hour, minute] = hourStart.split(':')

          // Variación de delayToleranceMinutes + 1 a faultToleranceMinutes minutos (dentro del rango de delay)
          const minutesVariation = Math.floor(Math.random() * (faultToleranceMinutes - delayToleranceMinutes)) + delayToleranceMinutes + 15
          const totalMinutes = Number(minute) + minutesVariation
          const finalHour = Number(hour) + Math.floor(totalMinutes / 60)
          const finalMinute = totalMinutes % 60
          const finalSecond = 0

          // Formatear la fecha/hora en formato yyyy-MM-dd HH:mm:ss
          const punchTimeString = `${dateString} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:${String(finalSecond).padStart(2, '0')}`
          const punchTime = DateTime.fromFormat(punchTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: demoZone }).toUTC()

          const createAssist = new Assist()
          createAssist.assistEmpId = employee.employeeId
          createAssist.assistEmpCode = employee.employeeCode.toString()
          createAssist.assistPunchTime = punchTime
          createAssist.assistPunchTimeUtc = punchTime
          createAssist.assistPunchTimeOrigin = punchTime
          createAssist.assistUploadTime = punchTime
          createAssist.assistSyncId = 0
          await createAssist.save()

          const checkOutTime = punchTime.plus({ hours: activeHours })
          const createAssistOut = new Assist()
          createAssistOut.assistEmpId = employee.employeeId
          createAssistOut.assistEmpCode = employee.employeeCode.toString()
          createAssistOut.assistPunchTime = checkOutTime
          createAssistOut.assistPunchTimeUtc = checkOutTime
          createAssistOut.assistPunchTimeOrigin = checkOutTime
          createAssistOut.assistUploadTime = checkOutTime
          createAssistOut.assistSyncId = 0
          await createAssistOut.save()
        }

        // Los días con falta (2%) no se crean (se omiten)
        // imprimir fechas de faltas no creadas

        if (onTimeDays.length > 0) {
          createdAssists[employee.employeeId] = await Assist.query()
            .where('assist_emp_id', employee.employeeId)
            .orderBy('assist_punch_time', 'desc')
            .first() as Assist
        }
      }

      const summary = Object.keys(createdAssists).map((key) => ({
        name: key,
        id: createdAssists[key].assistId,
        code: createdAssists[key].assistEmpCode,
      }))

      return {
        status: 201,
        type: 'success',
        title: 'Assists created successfully',
        message: 'The assists were created successfully',
        data: {
          created: summary,
          total: Object.keys(createdAssists).length,
        },
      }
    } catch (error: any) {
      console.error('Error to create assists:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to create assists',
        message: 'An error occurred while trying to create the assists',
        error: error.message,
        data: null,
      }
    }
  }

  /**
   * Obtiene la tolerancia de retardo del sistema
   *
   * @returns {Promise<number>} La tolerancia de retardo en minutos
   */
  async getDelayToleranceMinutes(): Promise<number> {
    return this.resolveTenantToleranceMinutes('Delay', DEFAULT_DELAY_TOLERANCE_MINUTES)
  }

  async getTardinessToleranceMinutes(): Promise<number> {
    return this.resolveTenantToleranceMinutes(
      'TardinessTolerance',
      DEFAULT_DELAY_TOLERANCE_MINUTES
    )
  }

  async getFaultsAndDelaysFromEmployeeCalendar(employeeCalendar: AssistDayInterface[], tardies: number, toleranceCountPerAbsences: number) {
    let tolerances = 0
    let delays = 0
    let earlyOuts = 0
    let faults = 0
    let delayFaults = 0
    let earlyOutsFaults = 0
    for await (const calendar of employeeCalendar) {
      if (!calendar.assist.isFutureDay) {
        if (calendar.assist.dateShift) {
          if (calendar.assist.checkInStatus !== 'fault') {
            if (calendar.assist.checkInStatus === 'tolerance') {
              tolerances += 1
            } else if (calendar.assist.checkInStatus === 'delay') {
              delays += 1
            }
          }
          if (calendar.assist.checkOutStatus !== 'fault') {
            if (calendar.assist.checkOutStatus === 'delay') {
              earlyOuts += 1
            }
          }
          if (calendar.assist.checkInStatus === 'fault' && !calendar.assist.isRestDay) {
            faults += 1
          }
        }
      }
    }

    const delayTolerances = this.getFaultsFromDelays(tolerances, toleranceCountPerAbsences)
    delays += delayTolerances

    delayFaults = this.getFaultsFromDelays(delays, tardies)
    earlyOutsFaults = this.getFaultsFromDelays(earlyOuts, tardies)
    faults = faults + delayFaults + earlyOutsFaults
    return { faults, delays }
  }

  async verifyAttendanceLock(userId: number, type: string) {
    try {
      // El bloqueo por faltas se decide con la configuración de LA EMPRESA
      // ACTIVA. Antes leía la de plataforma, así que todos los clientes
      // compartían el mismo umbral sin poder ajustarlo.
      const systemSettingActive = await new SystemSettingService().resolveForActiveTenant()
      if (!systemSettingActive) {
        return {
          status: 404,
          type: 'warning',
          title: 'System setting not found',
          message: 'The system setting was not found',
        }
      }
      const maxAbsences = systemSettingActive.systemSettingMaxAbsencesBeforeAttendanceLock
      const maxTardiness = systemSettingActive.systemSettingMaxLateArrivalsBeforeAttendanceLock

      const user = await User.query()
        .where('user_id', userId)
        .preload('person')
        .first()
      if (!user) {
        return {
          status: 404,
          type: 'warning',
          title: 'User not found',
          message: 'The user was not found',
        }
      }

      const employee = await Employee.query()
        .where('person_id', user.person.personId)
        .whereNull('employee_deleted_at')
        .first()

      if (!employee) {
        return {
          status: 404,
          type: 'warning',
          title: 'Employee not found',
          message: 'The employee was not found',
        }
      }

      const page = 1
      const limit = 999999999999999
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const resultAssists = await syncAssistsService.index(
        {
          date: DateTime.now().startOf('month').toFormat('yyyy-MM-dd'),
          dateEnd: DateTime.now().endOf('month').toFormat('yyyy-MM-dd'),
          employeeID: employee.employeeId,
        },
        { page, limit }
      )
      const data: any = resultAssists.data
      this.adoptCalendarZone(data)
      let faults = 0
      let delays = 0

      if (data) {
        const tardies = await this.getTardiesTolerance()
        const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
        const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
        const result = await this.getFaultsAndDelaysFromEmployeeCalendar(employeeCalendar, tardies, toleranceCountPerAbsences)
        faults = result.faults
        delays = result.delays
      }

      let tradeName = 'BO'
      const userEmail = resolveMailSender()
      let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
      if (systemSettingActive) {
        if ( systemSettingActive.systemSettingLogo) {
          backgroundImageLogo = systemSettingActive.systemSettingLogo
        }
        if ( systemSettingActive.systemSettingTradeName) {
          tradeName = systemSettingActive.systemSettingTradeName
        }
      }
      if (type === 'absences') {
        if (maxAbsences) {
          if (faults >= maxAbsences) {
            if (userEmail) {
              const emailData = {
                user: user,
                backgroundImageLogo,
                message: 'Has excedido el maximo de faltas al registrar la asistencia.',
              }
              await mail.send((message) => {
                message
                .to(user.userEmail)
                  .from(userEmail, tradeName)
                  .subject('Registro de asistencia bloqueado')
                  .htmlView('emails/attendance_lock', emailData)
              })
              await this.sendEmailAttendanceLock(systemSettingActive, 'Ha excedido el maximo de faltas permitidas.', user)
            }
            return {
              status: 200,
              type: 'warning',
              title: 'Registro de asistencia bloqueado',
              message: 'Has excedido el maximo de faltas al registrar la asistencia.',
              data: {
                locked: true,
                type: 'absences',
              }
            }
          }
        }
      } else if (type === 'tardiness') {
        if (maxTardiness) {
          if (delays >= maxTardiness) {
            if (userEmail) {
              const emailData = {
                user: user,
                backgroundImageLogo,
                message: 'Has excedido el maximo de retardos al registrar la asistencia.',
              }
              await mail.send((message) => {
                message
                  .to(user.userEmail)
                  .from(userEmail, tradeName)
                  .subject('Registro de asistencia bloqueado')
                  .htmlView('emails/attendance_lock', emailData)
              })

              await this.sendEmailAttendanceLock(systemSettingActive, 'Ha excedido el maximo de retardos permitidos.', user)
            }

            return {
              status: 200,
              type: 'warning',
              title: 'Registro de asistencia bloqueado',
              message: 'Has excedido el maximo de retardos al registrar la asistencia',
              data: {
                locked: true,
                type: 'tardiness',
              }
            }
          }
        }
      }


      return {
        status: 200,
        type: 'success',
        title: 'Registro de asistencia',
        message: 'El empleado no excedio el maximo de faltas o retardos antes de ser bloqueado.',
        data: {
          locked: false,
        }
      }
    } catch (error) {
      console.error('Error to verify attendance lock:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error al verificar el registro de asistencia',
        message: 'Ocurrio un error al verificar el registro de asistencia',
        error: error.message,
      }
    }
  }

  async sendEmailAttendanceLock(systemSettingActive: SystemSetting, newMessage: string, user: User) {
    let tradeName = 'BO'
    const userEmail = resolveMailSender()
    let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
    if (systemSettingActive) {
      if ( systemSettingActive.systemSettingLogo) {
        backgroundImageLogo = systemSettingActive.systemSettingLogo
      }
      if ( systemSettingActive.systemSettingTradeName) {
        tradeName = systemSettingActive.systemSettingTradeName
      }
      const emailData = {
        user: user,
        backgroundImageLogo,
        message: newMessage,
      }
      const allowedIds = await new BusinessAccessScopeService().getAccessibleIds(user)
      const departments = await Department.query()
        .whereIn('businessUnitId', allowedIds)
        .whereRaw('UPPER(department_name) LIKE ?', ['%CAPITAL HUMANO%'])
        .orderBy('department_name', 'asc')

        for await (const department of departments) {
          const employees = await Employee.query()
            .where('department_id', department.departmentId)
            .whereNull('employee_deleted_at')
            .preload('person', (query) => {
              query.preload('user')
            })
            .orderBy('employee_id', 'asc')

          for await (const employee of employees) {
            const email = employee.person.user.userEmail
            if (email) {
               await mail.send((message) => {
               message
               .to(email)
               .from(userEmail, tradeName)
               .subject('Registro de asistencia bloqueado - Falta administrativa')
               .htmlView('emails/attendance_lock_rh', emailData )
              })
            }
          }
        }
    }
  }
}
