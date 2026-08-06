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
import axios from 'axios'
import { AssistIncidentExcelRowInterface } from '../interfaces/assist_incident_excel_row_interface.js'
import Assist from '#models/assist'
import Tolerance from '#models/tolerance'
import { LogStore } from '#models/MongoDB/log_store'
import { LogAssist } from '../interfaces/MongoDB/log_assist.js'
import BusinessUnit from '#models/business_unit'
import env from '#start/env'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import { AssistIncidentPayrollExcelRowInterface } from '../interfaces/assist_incident_payroll_excel_row_interface.js'
import sharp from 'sharp'
import { AssistExcelImageInterface } from '../interfaces/assist_excel_image_interface.js'
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
import ToleranceService from './tolerance_service.js'
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

export default class AssistsService {
  private t: (key: string,params?: { [key: string]: string | number }) => string
  private i18n: I18n
  private localeToUse: string
  private businessUnits: BusinessUnit[] = []

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
    this.localeToUse = i18n.locale
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
    const assistExcelImageInterface = {
      workbook,
      worksheet,
      col: 0.28,
      row: 0.7,
    } as AssistExcelImageInterface
    await this.addImageLogo(assistExcelImageInterface)
    worksheet.getRow(1).height = 60
    worksheet.mergeCells('A1:Q1')
    const titleRow = worksheet.addRow([this.t('assistance_report')])
    let color = '244062'
    const fgColor = 'FFFFFFF'
    worksheet.getCell('A' + 2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
    titleRow.height = 42
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells('A2:Q2')
    color = '366092'
    const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
    periodRow.font = { size: 15, color: { argb: fgColor } }
    worksheet.getCell('A' + 3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
    periodRow.height = 30
    worksheet.mergeCells('A3:Q3')
    worksheet.views = [
      { state: 'frozen', ySplit: 1 },
      { state: 'frozen', ySplit: 2 },
      { state: 'frozen', ySplit: 3 },
      { state: 'frozen', ySplit: 4 },
    ]
    this.addHeadRow(worksheet)
    const status = employee.deletedAt ? 'Terminated' : 'Active'
    await this.addRowToWorkSheet(rows, worksheet, status)
    await onProgress(1, 1)

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
      await this.addTitleIncidentToWorkSheet(workbook, worksheet, title)
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
      const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll'))
      const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
      await this.addTitleIncidentPayrollToWorkSheet(workbook, worksheet, titlePayroll)
      await this.addHeadRowIncidentPayroll(worksheet)

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
      const assistExcelImageInterface = {
        workbook: workbook,
        worksheet: worksheet,
        col: 0.28,
        row: 0.7,
      } as AssistExcelImageInterface
      await this.addImageLogo(assistExcelImageInterface)
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:P1')
      const titleRow = worksheet.addRow([this.t('assistance_report')])
      let color = '244062'
      let fgColor = 'FFFFFFF'
      worksheet.getCell('A' + 2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:P2')
      color = '366092'
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: fgColor } }

      worksheet.getCell('A' + 3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:P3')
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }, // Fija la primera fila
        { state: 'frozen', ySplit: 2 }, // Fija la segunda fila
        { state: 'frozen', ySplit: 3 }, // Fija la tercer fila
        { state: 'frozen', ySplit: 4 }, // Fija la cuarta fila
      ]
      // Añadir columnas de datos (encabezados)
      this.addHeadRow(worksheet)
      await this.addRowToWorkSheet(rows, worksheet)
      // hasta aquí era lo de asistencia
      const rowsIncident = [] as AssistIncidentExcelRowInterface[]
      worksheet = workbook.addWorksheet(this.t('incident_summary'))
      const title = `${this.t('summary_report')} ${this.getRange(filterDate, filterDateEnd)}`
      await this.addTitleIncidentToWorkSheet(workbook, worksheet, title)
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
      const assistExcelImageInterface = {
        workbook: workbook,
        worksheet: worksheet,
        col: 0.28,
        row: 0.7,
      } as AssistExcelImageInterface
      await this.addImageLogo(assistExcelImageInterface)
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:P1')
      const titleRow = worksheet.addRow([this.t('assistance_report')])
      let color = '244062'
      let fgColor = 'FFFFFFF'
      worksheet.getCell('A' + 2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:P2')
      color = '366092'
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: fgColor } }

      worksheet.getCell('A' + 3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:P3')
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }, // Fija la primera fila
        { state: 'frozen', ySplit: 2 }, // Fija la segunda fila
        { state: 'frozen', ySplit: 3 }, // Fija la tercer fila
        { state: 'frozen', ySplit: 4 }, // Fija la cuarta fila
      ]
      // Añadir columnas de datos (encabezados)
      this.addHeadRow(worksheet)
      await this.addRowToWorkSheet(rows, worksheet)
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
      await this.addTitleIncidentToWorkSheet(workbook, worksheet, title)
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
      const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll'))
      const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
      await this.addTitleIncidentPayrollToWorkSheet(workbook, worksheet, titlePayroll)
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
      const assistExcelImageInterface = {
        workbook: workbook,
        worksheet: worksheet,
        col: 0.28,
        row: 0.7,
      } as AssistExcelImageInterface
      await this.addImageLogo(assistExcelImageInterface)
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:Q1')
      const titleRow = worksheet.addRow([this.t('assistance_report')])
      let color = '244062'
      let fgColor = 'FFFFFFF'
      worksheet.getCell('A' + 2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:Q2')
      color = '366092'
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: fgColor } }

      worksheet.getCell('A' + 3).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:Q3')
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }, // Fija la primera fila
        { state: 'frozen', ySplit: 2 }, // Fija la segunda fila
        { state: 'frozen', ySplit: 3 }, // Fija la tercer fila
        { state: 'frozen', ySplit: 4 }, // Fija la cuarta fila
      ]
      // Añadir columnas de datos (encabezados)
      this.addHeadRow(worksheet)
      await this.addRowToWorkSheet(rows, worksheet)
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
    const assistExcelImageInterface = {
      workbook,
      worksheet,
      col: 0.28,
      row: 0.7,
    } as AssistExcelImageInterface
    await this.addImageLogo(assistExcelImageInterface)
    worksheet.getRow(1).height = 60
    worksheet.mergeCells('A1:Q1')
    const titleRow = worksheet.addRow([this.t('assistance_report')])
    let color = '244062'
    let fgColor = 'FFFFFFF'
    worksheet.getCell('A' + 2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
    titleRow.height = 42
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells('A2:Q2')
    color = '366092'
    const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
    periodRow.font = { size: 15, color: { argb: fgColor } }
    worksheet.getCell('A' + 3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
    periodRow.height = 30
    worksheet.mergeCells('A3:Q3')
    worksheet.views = [
      { state: 'frozen', ySplit: 1 },
      { state: 'frozen', ySplit: 2 },
      { state: 'frozen', ySplit: 3 },
      { state: 'frozen', ySplit: 4 },
    ]
    this.addHeadRow(worksheet)
    await this.addRowToWorkSheet(rows, worksheet)
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
      await this.addTitleIncidentToWorkSheet(workbook, worksheet, title)
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
      const worksheet = workbook.addWorksheet(this.t('incident_summary_payroll'))
      const titlePayroll = `${this.t('incidents')} ${tradeName} ${this.getRange(filterDate, filterDateEnd)}`
      await this.addTitleIncidentPayrollToWorkSheet(workbook, worksheet, titlePayroll)
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

  private paintIncidents(worksheet: ExcelJS.Worksheet, row: number, value: string) {
    let color = 'FFFFFFF'
    let fgColor = 'FFFFFFF'
    if (value === this.t('fault').toUpperCase()) {
      color = 'FFD45633'
      fgColor = 'FFFFFFF'
    } else if (value === this.t('ontime').toUpperCase()) {
      color = 'FF33D4AD'
      fgColor = 'FFFFFFF'
    } else if (value === this.t('next').toUpperCase()) {
      color = 'E4E4E4'
      fgColor = '000000'
    } else if (value === this.t('rest').toUpperCase()) {
      color = 'E4E4E4'
      fgColor = '000000'
    } else if (value === this.t('vacations').toUpperCase()) {
      color = 'FFFFFFF'
      fgColor = '000000'
    } else if (value === this.t('holiday').toUpperCase()) {
      color = 'FFFFFFF'
      fgColor = '000000'
    } else if (value === this.t('delay').toUpperCase()) {
      color = 'FF993A'
    } else if (value === this.t('tolerance').toUpperCase()) {
      color = '3CB4E5'
    } else if (value === this.t('exception').toUpperCase()) {
      fgColor = '000000'
    }
    worksheet.getCell('P' + row).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color }, // Color de fondo rojo
    }
    worksheet.getCell('P' + row).font = {
      color: { argb: fgColor }, // Color de fondo rojo
    }
  }

  private paintEmployeeTerminated(worksheet: ExcelJS.Worksheet, columnName: string, row: number) {
    const color = 'FFD45633'
    const fgColor = 'FFFFFFF'
    worksheet.getCell(columnName + row).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color }, // Color de fondo rojo
    }
    worksheet.getCell(columnName + row).font = {
      color: { argb: fgColor }, // Color de fondo rojo
    }
  }

  private paintCheckOutStatus(worksheet: ExcelJS.Worksheet, row: number, value: string) {
    if (value.toString().toUpperCase() === 'DELAY') {
      const fgColor = 'FF993A'
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

  private calendarDayMonth(dateYear: number, dateMonth: number, dateDay: number) {
    const date = DateTime.local(dateYear, dateMonth, dateDay, 0).setLocale(this.localeToUse)
    const day = date.toFormat('dd/MMMM')
    return day
  }

  private chekInTime(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.checkIn?.assistPunchTimeUtc) {
      return ''
    }
    const timeCheckIn = DateTime.fromISO(
      checkAssist.assist.checkIn.assistPunchTimeUtc.toString(),
      { setZone: true }
    ).setZone('UTC-6').setLocale(this.localeToUse)
    return timeCheckIn.toFormat('MMM d, yyyy, h:mm:ss a')
  }

  private chekOutTime(checkAssist: AssistDayInterface) {
    if (!checkAssist?.assist?.checkOut?.assistPunchTimeUtc) {
      return ''
    }

    const now = DateTime.now().toFormat('yyyy-LL-dd')
    const timeCheckOut = DateTime.fromISO(
      checkAssist.assist.checkOut.assistPunchTimeUtc.toString(),
      { setZone: true }
    ).setZone('UTC-6').setLocale(this.localeToUse)
    if (timeCheckOut.toFormat('yyyy-LL-dd') === now) {
      checkAssist.assist.checkOutStatus = ''
      return ''
    }
    return timeCheckOut.toFormat('MMM d, yyyy, h:mm:ss a')
  }

  addHeadRow(worksheet: ExcelJS.Worksheet) {
    const headerRow = worksheet.addRow([
      `${this.t('employee')} ID`,
      `${this.t('employee')} ${this.t('name')}`,
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
    let fgColor = 'FFFFFFF'
    let color = '538DD5'
    for (let col = 1; col <= 6; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    color = '16365C'
    for (let col = 7; col <= 9; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    color = '538DD5'
    for (let col = 10; col <= 17; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: fgColor } }
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
      const day = this.dateDay(calendar.day)
      const month = this.dateMonth(calendar.day)
      const year = this.dateYear(calendar.day)
      const calendarDay = this.calendarDayMonth(year, month, day)
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
      let department = employee.department.departmentAlias
        ? employee.department.departmentAlias
        : ''
      department =
        department === '' && employee.department?.departmentName
          ? employee.department.departmentName
          : ''
      let position = employee.position.positionAlias ? employee.position.positionAlias : ''
      position =
        position === '' && employee.position?.positionName ? employee.position.positionName : ''
      let shiftName = ''
      let shiftStartDate = ''
      let shiftEndsDate = ''
      let hoursWorked = 0
      if (calendar && calendar.assist && calendar.assist.dateShift) {
        shiftName = calendar.assist.dateShift.shiftName
        shiftStartDate = calendar.assist.dateShift.shiftTimeStart
        const hoursToAddParsed = calendar.assist.dateShift.shiftActiveHours
        const time = DateTime.fromFormat(shiftStartDate, 'HH:mm:ss')
        const newTime = time.plus({ hours: hoursToAddParsed })
        shiftEndsDate = newTime.toFormat('HH:mm:ss')
      }

      const checkInTime = calendar.assist.checkIn?.assistPunchTimeUtc
      const checkOutTime = calendar.assist.checkOut?.assistPunchTimeUtc

      const firstCheckTime = checkInTime ? DateTime.fromISO(checkInTime.toString(), { zone: 'UTC-6' }) : null
      const lastCheckTime = checkOutTime ? DateTime.fromISO(checkOutTime.toString(), { zone: 'UTC-6' }) : null

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

      const rowCheckInTime = calendar.assist.checkIn?.assistPunchTimeUtc && !calendar.assist.isFutureDay ? DateTime.fromISO(calendar.assist.checkIn.assistPunchTimeUtc.toString(), { setZone: true }).setZone('UTC-6').toFormat('ff') : ''
      const rowLunchTime = calendar.assist?.checkEatIn?.assistPunchTimeUtc ? DateTime.fromISO(calendar.assist.checkEatIn.assistPunchTimeUtc.toString(), { setZone: true }).setZone('UTC-6').setLocale(this.localeToUse).toFormat('MMM d, yyyy, h:mm:ss a') : ''
      const rowReturnLunchTime = calendar?.assist?.checkEatOut?.assistPunchTimeUtc ? DateTime.fromISO(calendar.assist.checkEatOut.assistPunchTimeUtc.toString(), { setZone: true }).setZone('UTC-6').setLocale(this.localeToUse).toFormat('MMM d, yyyy, h:mm:ss a') : ''
      const rowCheckOutTime = calendar.assist.checkOut?.assistPunchTimeUtc && !calendar.assist.isFutureDay ? DateTime.fromISO(calendar.assist.checkOut?.assistPunchTimeUtc.toString(), { setZone: true }).setZone('UTC-6').toFormat('ff') : ''

      rows.push({
        code: employee.employeeCode.toString(),
        name: `${employee.person?.personFirstname} ${employee.person?.personLastname} ${employee.person?.personSecondLastname}`,
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
        { text: type, font: { bold: true, size: 12, color: { argb: '000000' } } },
        { text: `\n${description}\n`, font: { italic: true, size: 10, color: { argb: '000000' } } }
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
          ? faultsTotal.toString().padStart(2, '0') + ' TOTAL FAULTS'
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
        const color = 'FDE9D9'
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
      `${this.t('employee')} ID`,
      `${this.t('employee')} ${this.t('name')}`,
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
    let fgColor = 'FFFFFFF'
    let color = '30869C'
    for (let col = 1; col <= 19; col++) {
      const cell = worksheet.getCell(3, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: fgColor } }
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
    let department = filters.employee.department.departmentAlias ? filters.employee.department.departmentAlias : ''
    department =
      department === '' && filters.employee.department?.departmentName
        ? filters.employee.department.departmentName
        : ''
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

        const firstCheckTime = checkInTime ? DateTime.fromISO(checkInTime.toString(), { zone: 'UTC-6' }) : null
        const lastCheckTime = checkOutTime ? DateTime.fromISO(checkOutTime.toString(), { zone: 'UTC-6' }) : null

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
      employeeName: `${filters.employee.person?.personFirstname} ${filters.employee.person?.personLastname} ${filters.employee.person?.personSecondLastname}`,
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
              const color = '93CDDC'
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: color },
              }
              cell.font = { color: { argb: 'FFFFFF' } }
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
          const color = '93CDDC'
          for (let col = 1; col <= 19; col++) {
            const cell = worksheet.getCell(rowCount - 1, col)
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: color },
            }
            cell.font = { color: { argb: 'FFFFFF' } }
          }
        }
        if (rowData.department === this.t('totals').toUpperCase()) {
          const color = '30869C'
          for (let col = 1; col <= 19; col++) {
            const cell = worksheet.getCell(rowCount - 1, col)
            const row = worksheet.getRow(rowCount - 1)
            row.height = 30
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: color },
            }
            cell.font = { color: { argb: 'FFFFFF' } }
          }
        }
        rowCount += 1
      }
    }
  }

  async addTitleIncidentToWorkSheet(
    workbook: ExcelJS.Workbook,
    worksheet: ExcelJS.Worksheet,
    title: string
  ) {
    const assistExcelImageInterface = {
      workbook: workbook,
      worksheet: worksheet,
      col: 0.28,
      row: 0.7,
    } as AssistExcelImageInterface
    await this.addImageLogo(assistExcelImageInterface)
    worksheet.getRow(1).height = 60
    const fgColor = '000000'
    worksheet.getCell('B1').value = title
    worksheet.getCell('B1').font = { bold: true, size: 18, color: { argb: fgColor } }
    worksheet.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.mergeCells('B1:R1')
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }, // Fija la primera fila
      { state: 'frozen', ySplit: 2 }, // Fija la segunda fila
      { state: 'frozen', ySplit: 3 }, // Fija la tercer fila
    ]
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

  async store(assist: Assist) {
    const newAssist = new Assist()
    newAssist.assistEmpCode = assist.assistEmpCode
    newAssist.assistTerminalSn = assist.assistTerminalSn
    newAssist.assistTerminalAlias = assist.assistTerminalAlias
    newAssist.assistAreaAlias = assist.assistAreaAlias
    newAssist.assistLongitude = assist.assistLongitude
    newAssist.assistLatitude = assist.assistLatitude
    newAssist.assistPrecision = assist.assistPrecision
    newAssist.assistUploadTime = assist.assistUploadTime
    newAssist.assistEmpId = assist.assistEmpId
    newAssist.assistTerminalId = assist.assistTerminalId
    newAssist.assistSyncId = assist.assistSyncId
    newAssist.assistType = assist.assistType
    newAssist.assistPunchTime = assist.assistPunchTime
    newAssist.assistPunchTimeUtc = assist.assistPunchTimeUtc
    newAssist.assistPunchTimeOrigin = assist.assistPunchTimeOrigin
    await newAssist.save()
    const employee = await  Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_code',assist.assistEmpCode )
      .first()
    if (employee) {
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const filter: SyncAssistsServiceIndexInterface = {
        date: newAssist.assistPunchTimeUtc.setZone('UTC-6').plus({ day: -1 }).toFormat('yyyy-MM-dd'),
        dateEnd: newAssist.assistPunchTimeUtc.setZone('UTC-6').plus({ day: 1 }).toFormat('yyyy-MM-dd'),
        employeeID: employee.employeeId
      }
      await syncAssistsService.setDateCalendar(filter)
    }

    return newAssist
  }

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
    if (punchTime) {
      const existDate = await Assist.query()
        .where('assist_emp_id', assist.assistEmpId)
        .whereNull('assist_deleted_at')
        .where('assist_punch_time', sqlPunchTime)
        .first()

      if (existDate) {
        const entity = this.t('assist')
        const param = this.t('assist_register')
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
          message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
          data: { ...assist },
        }
      }
    }
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
      const monthPeriod = Number.parseInt(DateTime.fromJSDate(new Date(date)).toFormat('LL'))
      const yearPeriod = Number.parseInt(DateTime.fromJSDate(new Date(date)).toFormat('yyyy'))
      const dayPeriod = Number.parseInt(DateTime.fromJSDate(new Date(date)).toFormat('dd'))
      const dateLocal = DateTime.local(yearPeriod, monthPeriod, dayPeriod)
      const startOfWeek = dateLocal.startOf('week')
      const thursday = startOfWeek.plus({ days: 3 })
      const start = thursday.minus({ days: 24 })
      const firstDayPeriod = start.minus({ days: 1 }).startOf('day').setZone('utc')
      const tardies = await this.getTardiesTolerance()
      const toleranceCountPerAbsences = await this.getToleranceCountPerAbsence()
      const syncAssistsService = new SyncAssistsService(this.i18n)
      const period = this.calculatePayPeriod(date)
      const dateNew = new Date(date)
      const year = dateNew.getFullYear()
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
      const lastDate = firstDayPeriod.plus({ days: 13 }).startOf('day').setZone('utc')
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
    const referenceDate = new Date(referencePayDate)
    const targetDate = new Date(dateToCheck)
    if (Number.isNaN(referenceDate.getTime())) {
      return false
    }
    if (Number.isNaN(targetDate.getTime())) {
      return false
    }
    const isThursday = targetDate.getDay() === 4
    if (!isThursday) {
      return false
    }
    const differenceInMilliseconds = targetDate.getTime() - referenceDate.getTime()
    const differenceInDays = Math.abs(differenceInMilliseconds / (1000 * 60 * 60 * 24))

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

  async getLogo() {
    let imageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      if (systemSettingActive.systemSettingLogo) {
        imageLogo = systemSettingActive.systemSettingLogo
      }
    }
    return imageLogo
  }

  async getToleranceCountPerAbsence() {
    let tolerancePerAbsence = 0
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      if (systemSettingActive.systemSettingToleranceCountPerAbsence) {
        tolerancePerAbsence = systemSettingActive.systemSettingToleranceCountPerAbsence
      }
    }
    if (tolerancePerAbsence === 0) {
      tolerancePerAbsence = 3
    }
    return tolerancePerAbsence
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
      if (!data?.employeeCalendar) {
        continue
      }

      const employeeCalendar = data.employeeCalendar as AssistDayInterface[]
      if (!this.hasPayrollEvaluableAttendance(employeeCalendar)) {
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
    }
  }

  async addTitleIncidentPayrollToWorkSheet(
    workbook: ExcelJS.Workbook,
    worksheet: ExcelJS.Worksheet,
    title: string
  ) {
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
    reportLabelCell.font = { bold: true, size: 13, color: { argb: '203864' } }
    reportLabelCell.alignment = { horizontal: 'center', vertical: 'middle' }

    await this.addImageLogo({
      workbook: workbook,
      worksheet: worksheet,
      col: 0.27,
      row: 1.2,
    } as AssistExcelImageInterface)
    await this.addImageLogo({
      workbook: workbook,
      worksheet: worksheet,
      col: 14.2,
      row: 1.2,
    } as AssistExcelImageInterface)

    const bannerCell = worksheet.getCell('F2')
    bannerCell.value = title
    bannerCell.font = { bold: true, size: 16, color: { argb: 'FFFFFF' } }
    bannerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '203864' },
    }
    bannerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

    const whiteFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFFFFF' },
    }
    worksheet.getCell('A2').fill = whiteFill
    worksheet.getCell('O2').fill = whiteFill
    worksheet.getCell('F3').fill = whiteFill

    worksheet.views = [
      { state: 'frozen', ySplit: 1 },
      { state: 'frozen', ySplit: 2 },
      { state: 'frozen', ySplit: 3 },
      { state: 'frozen', ySplit: 5 },
    ]
  }

  addHeadRowIncidentPayroll(worksheet: ExcelJS.Worksheet) {
    const headerCells = [
      this.t('work_business_unit'),
      this.t('payroll_business_unit'),
      `${this.t('employee')} ${this.t('name')}`,
      `${this.t('employee')} ID`,
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
    const greenEndColumn = isPayrollOvertimeIncludeUnauthorizedEnabled() ? 18 : 16
    let fgColor = '000000'
    let color = 'C9C9C9'
    for (let col = 1; col <= 6; col++) {
      const cell = worksheet.getCell(5, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    color = '305496'
    for (let col = 7; col <= 9; col++) {
      const cell = worksheet.getCell(5, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    color = 'A9D08E'
    for (let col = 10; col <= greenEndColumn; col++) {
      const cell = worksheet.getCell(5, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    color = '305496'
    worksheet.getCell(5, totalColumns).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    headerRow.height = 40
    fgColor = '000000'
    headerRow.font = { bold: true, color: { argb: fgColor } }
    fgColor = 'FFFFFF'
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
      if (col >= 7 && col <= 9) {
        cell.font = { color: { argb: fgColor } }
      }
      if (col === totalColumns) {
        cell.font = { color: { argb: fgColor } }
      }
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
      employeeName: `${filters.employee.person?.personFirstname} ${filters.employee.person?.personLastname} ${filters.employee.person?.personSecondLastname}`,
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
        const fgColor = '000000'
        worksheet.addRow(this.buildIncidentPayrollExcelRowValues(rowData)).font = {
          color: { argb: fgColor },
        }
        let cell = worksheet.getCell(rowCount + 1, 6)
        cell.font = { bold: true }
        if (rowData.faults > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.faults)
          cell.font = { color: { argb: '9C0006' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC7CE' },
          }
        }
        if (rowData.delays > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.delays)
          cell.font = { color: { argb: '9C0006' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC7CE' },
          }
        }
        if (rowData.inc > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.inc)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (rowData.overtimeDouble > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeDouble)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (rowData.overtimeTriple > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeTriple)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (
          isPayrollOvertimeIncludeUnauthorizedEnabled() &&
          rowData.overtimeExtendedDouble &&
          rowData.overtimeExtendedDouble > 0 &&
          'overtimeExtendedDouble' in columns
        ) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeExtendedDouble!)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (
          isPayrollOvertimeIncludeUnauthorizedEnabled() &&
          rowData.overtimeExtendedTriple &&
          rowData.overtimeExtendedTriple > 0 &&
          'overtimeExtendedTriple' in columns
        ) {
          cell = worksheet.getCell(rowCount + 1, columns.overtimeExtendedTriple!)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (rowData.workingTimeRuleUnresolved) {
          cell = worksheet.getCell(rowCount + 1, columns.others)
          cell.font = { color: { argb: '9C6500' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEB9C' },
          }
        }
        if (rowData.sundayBonus > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.sundayBonus)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (rowData.vacationBonus > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.vacationBonus)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
          }
        }
        if (rowData.laborRest > 0) {
          cell = worksheet.getCell(rowCount + 1, columns.laborRest)
          cell.font = { color: { argb: '006100' } }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' },
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

  async getTradeName() {
    let tradeName = 'BO'
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      if (systemSettingActive.systemSettingTradeName) {
        tradeName = systemSettingActive.systemSettingTradeName
      }
    }
    return tradeName
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

  async addImageLogo(assistExcelImageInterface: AssistExcelImageInterface) {
    const imageLogo = await this.getLogo()
    if (!imageLogo) {
      return
    }

    try {
      const imageResponse = await axios.get(imageLogo, {
        responseType: 'arraybuffer',
        timeout: 10_000,
      })
      const imageBuffer = imageResponse.data

      const metadata = await sharp(imageBuffer).metadata()
      const imageWidth = metadata.width ? metadata.width : 0
      const imageHeight = metadata.height ? metadata.height : 0

      const targetWidth = 139
      const targetHeight = 49

      const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight)

      let adjustedWidth = imageWidth * scale
      let adjustedHeight = imageHeight * scale

      if (assistExcelImageInterface.col === 14.2) {
        const increaseFactor = 1.3
        adjustedWidth *= increaseFactor
        adjustedHeight *= increaseFactor
      } else if (assistExcelImageInterface.col < 1) {
        const increaseFactor = 1.05
        adjustedWidth *= increaseFactor
        adjustedHeight *= increaseFactor
      }

      const imageId = assistExcelImageInterface.workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      })

      assistExcelImageInterface.worksheet.addImage(imageId, {
        tl: { col: assistExcelImageInterface.col, row: assistExcelImageInterface.row },
        ext: { width: adjustedWidth, height: adjustedHeight },
      })
    } catch (err: unknown) {
      // En desarrollo sin DNS a DigitalOcean Spaces el logo no se puede descargar.
      // El reporte debe generarse igual (sin logo) en lugar de fallar todo el job.
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`AssistsService.addImageLogo: no se pudo cargar el logo (${imageLogo}): ${message}`)
    }
  }

  decimalToTimeString(decimal: number): string {
    const hours = Math.floor(decimal)
    const minutes = Math.round((decimal - hours) * 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  async getTardiesTolerance() {
    let tardies = 0
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      const tolerance = await Tolerance.query()
        .whereNull('tolerance_deleted_at')
        .where('tolerance_name', 'TardinessTolerance')
        .where('systemSettingId', systemSettingActive.systemSettingId)
        .first()

      if (tolerance) {
        tardies = tolerance.toleranceMinutes
      }
    }

    if (tardies === 0) {
      tardies = 3
    }
    return tardies
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
    const date = new Date(dateString)
    const dayOfMonth = date.getDate()

    return dayOfMonth >= 1 && dayOfMonth <= 15
  }

  isAnniversaryInPayMonth(hireDate: string, datePay: string) {
    const hire = new Date(hireDate)
    const pay = new Date(datePay)

    return hire.getMonth() === pay.getMonth()
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
    const stringDate = `${filters.dateStart}T00:00:00.000-06:00`
    const time = DateTime.fromISO(stringDate, { setZone: true })
    const timeCST = time.setZone('UTC-6')
    const filterInitialDate = timeCST.toFormat('yyyy-LL-dd HH:mm:ss')
    const stringEndDate = `${filters.dateEnd}T23:59:59.000-06:00`
    const timeEnd = DateTime.fromISO(stringEndDate, { setZone: true })
    const timeEndCST = timeEnd.setZone('UTC-6').plus({ days: 1 })
    const filterEndDate = timeEndCST.toFormat('yyyy-LL-dd HH:mm:ss')
    const query = Assist.query()
      .where('assist_active', 1)
    let employee = null


    if (filters.dateEnd && filters.dateStart) {
      query.where('assist_punch_time_origin', '>=', filterInitialDate)
      query.where('assist_punch_time_origin', '<=', filterEndDate)
    }

    if (filters.employeeId) {
      employee = await Employee.query()
        .where('employee_id', filters.employeeId || 0)
        .withTrashed()
        .first()

      if (!employee) {
        return []
      }

      query.where('assist_emp_code', employee.employeeCode)
    }

    query.orderBy('assist_punch_time_origin', 'desc')

    const assistList = await query.paginate(1, 500)
    const assistListFlat = assistList.toJSON().data as AssistInterface[]
    const assistDayCollection: AssistDayInterface[] = []



    for await (const item of assistListFlat) {
      const assist = item as AssistInterface
      const assistDate = DateTime
        .fromISO(`${assist.assistPunchTimeUtc}`, { setZone: true })
        .setZone('UTC-6')
      const assistDayStr = assistDate.toFormat('yyyy-LL-dd')

      const existDay = assistDayCollection.find((itemAssistDay) => itemAssistDay.day === assistDayStr)

      if (!existDay) {
        let dayAssist: AssistInterface[] = []

        for await (const dayItem of assistListFlat) {
          const currentDay = DateTime
            .fromISO(`${dayItem.assistPunchTimeUtc}`, { setZone: true })
            .setZone('UTC-6')
            .toFormat('yyyy-LL-dd')

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
          departmentId: 0,
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

      // Agregar logo
      const assistExcelImageInterface = {
        workbook: workbook,
        worksheet: worksheet,
        col: 0.28,
        row: 0.7,
      } as AssistExcelImageInterface
      await this.addImageLogo(assistExcelImageInterface)

      // Configurar título
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:J1')
      const titleRow = worksheet.addRow(['Reporte de Permisos por Fechas'])
      let color = '244062'
      let fgColor = 'FFFFFFF'

      worksheet.getCell('A2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:K2')

      // Período
      color = '366092'
      const periodRow = worksheet.addRow([this.getRange(filterDate, filterDateEnd)])
      periodRow.font = { size: 15, color: { argb: fgColor } }
      worksheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
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

      color = '366092'
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        }
        cell.font = { bold: true, color: { argb: fgColor } }
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
          const employeeName = `${exception.employee.person.personFirstname} ${exception.employee.person.personLastname}`
          const departmentName = exception.employee.department?.departmentName || 'N/A'
          const positionName = exception.employee.position?.positionName || 'N/A'
          const exceptionDate = DateTime.fromJSDate(new Date(exception.shiftExceptionsDate)).toFormat('yyyy-MM-dd')
          const exceptionType = exception.exceptionType?.exceptionTypeTypeName || 'N/A'
          const description = exception.shiftExceptionsDescription || ''
          const checkInTime = exception.shiftExceptionCheckInTime || ''
          const checkOutTime = exception.shiftExceptionCheckOutTime || ''
          const payrollBuName = exception.employee.payrollBusinessUnit?.businessUnitName || 'N/A'
          const workBuName = exception.employee.businessUnit?.businessUnitName || 'N/A'

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
            const employeeName = `${disability.employee.person.personFirstname} ${disability.employee.person.personLastname}`
            const departmentName = disability.employee.department?.departmentName || 'N/A'
            const positionName = disability.employee.position?.positionName || 'N/A'
            const payrollBuName = disability.employee.payrollBusinessUnit?.businessUnitName || 'N/A'
            const workBuName = disability.employee.businessUnit?.businessUnitName || 'N/A'

            // Generar fechas para cada día del período de incapacidad
            const periodStart = DateTime.fromJSDate(new Date(period.workDisabilityPeriodStartDate))
            const periodEnd = DateTime.fromJSDate(new Date(period.workDisabilityPeriodEndDate))
            const reportStart = DateTime.fromISO(filterDate)
            const reportEnd = DateTime.fromISO(filterDateEnd)

            // Calcular el rango de fechas que se superpone con el período del reporte
            const startRange = periodStart > reportStart ? periodStart : reportStart
            const endRange = periodEnd < reportEnd ? periodEnd : reportEnd

            let currentDate = startRange
            while (currentDate <= endRange) {
              const disabilityType = period.workDisabilityType?.workDisabilityTypeName || 'Incapacidad'
              const description = `Período: ${periodStart.toFormat('yyyy-MM-dd')} a ${periodEnd.toFormat('yyyy-MM-dd')}`

              worksheet.addRow([
                workBuName,
                payrollBuName,
                employee.employeePayrollCode,
                employeeName,
                departmentName,
                positionName,
                currentDate.toFormat('yyyy-MM-dd'),
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
   * Elimina todas las asistencias existentes
   *
   * Esta función:
   * 1. Elimina todas las asistencias
   *
   * @returns Objeto con el resultado de la operación
   */
  async deleteAllAssists() {
    try {
      // Contar registros antes de eliminar
      const totalAssists = await Assist.query()
        .count('* as total')

      const counts = {
        assists: Number(totalAssists[0].$extras.total),
      }

      // 1. Eliminar todas las asistencias
      await Assist.query()
        .delete()

      return {
        status: 200,
        type: 'success',
        title: 'Assists deleted successfully',
        message: 'All assists have been deleted successfully',
        data: {
          deleted: {
            assists: counts.assists,
          },
        },
      }
    } catch (error: any) {
      console.error('Error al eliminar todas las asistencias:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to delete assists',
        message: 'An error occurred while trying to delete all assists',
        error: error.message,
        data: null,
      }
    }
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


      for await(const employee of employees) {
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
          const baseTime = DateTime.fromFormat(baseTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC-6' })

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
          const punchTime = DateTime.fromFormat(punchTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC-6' }).toUTC()

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
          const punchTime = DateTime.fromFormat(punchTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC-6' }).toUTC()

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
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    let delayToleranceMinutes = 10 // Default
    if (systemSettingActive) {
      const toleranceService = new ToleranceService()
      const tolerances = await toleranceService.index(systemSettingActive.systemSettingId)
      const delayTolerance = tolerances.find((t) => t.toleranceName === 'Delay')
      if (delayTolerance) delayToleranceMinutes = delayTolerance.toleranceMinutes
    }
    return delayToleranceMinutes
  }

  async getTardinessToleranceMinutes(): Promise<number> {
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    let tardinessToleranceMinutes = 10 // Default
    if (systemSettingActive) {
      const toleranceService = new ToleranceService()
      const tolerances = await toleranceService.index(systemSettingActive.systemSettingId)
      const tardinessTolerance = tolerances.find((t) => t.toleranceName === 'TardinessTolerance')
      if (tardinessTolerance) tardinessToleranceMinutes = tardinessTolerance.toleranceMinutes
    }
    return tardinessToleranceMinutes
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
      const systemSettingService = new SystemSettingService()
      const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
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
      const userEmail = env.get('SMTP_USERNAME')
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
    const userEmail = env.get('SMTP_USERNAME')
    if (!userEmail) {
      console.error('Error to send email attendance lock: SMTP_USERNAME not found')
      return
    }
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
