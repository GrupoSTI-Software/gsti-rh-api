import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import logger from '@adonisjs/core/services/logger'
import Employee from '#models/employee'
import { EMPLOYEE_IMPORT_ERROR_CODES } from '#constants/employee_import_error_codes'
import { resolveEmployeeImportApiError } from '#helpers/employee_import_api_error'
import { EmployeeVacationExcelFilterInterface } from '../interfaces/employee_vacation_excel_filter_interface.js'
import EmployeeService from './employee_service.js'
import { EmployeeVacationExcelRowInterface } from '../interfaces/employee_vacation_excel_row_interface.js'
import BusinessUnit from '#models/business_unit'
import { EmployeeVacationUsedDaysExcelRowInterface } from '../interfaces/employee_vacation_used_days_excel_row_interface.js'
import ShiftException from '#models/shift_exception'
import { REPORT_NEUTRAL_ARGB } from '#constants/report_neutral_theme'
import { EmployeeVacationExcelRowSummaryInterface } from '../interfaces/employee_vacation_excel_row_summary_interface.js'
import { EmployeeVacationExcelRowSummaryYearInterface } from '../interfaces/employee_vacation_excel_row_summary_year_interface.js'
import { I18n } from '@adonisjs/i18n'
import {
  formatReportCalendarDate,
  REPORT_DATE_FORMAT,
  REPORT_LOCALE,
  reportI18n,
} from '#helpers/report_locale'
import ExceptionType from '#models/exception_type'
import ShiftExceptionService from './shift_exception_service.js'
import VacationSetting from '#models/vacation_setting'
import VacationDeduction from '#models/vacation_deduction'

/**
 * Tope de filas de datos por archivo (sin contar cabecera), igual que
 * `EMPLOYEE_IMPORT_UPLOAD.maxDataRows` en `employee_import_error_codes.ts`.
 * Por encima de este número, el procesamiento secuencial (una query
 * `Employee.query()` por fila) arriesga superar el timeout del
 * proxy/gateway dentro de una sola petición HTTP síncrona — y una tabla de
 * miles de `rowErrors` en el frontend degrada la UI. Se corta ANTES de
 * procesar ninguna fila (`EmployeeVacationService#importVacationExcel`).
 */
const MAX_VACATION_IMPORT_DATA_ROWS = 500


export default class EmployeeVacationService {

  private i18n: I18n
  /**
   * Traductor de los Excel de vacaciones: fijo en el idioma de los reportes
   * (`REPORT_LOCALE`), sin importar el idioma de la petición. `this.i18n`
   * sigue siendo el de la petición para los servicios y errores que se
   * devuelven como JSON.
   */
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.i18n = i18n
    const reportTranslator = reportI18n()
    this.t = reportTranslator.formatMessage.bind(reportTranslator)
  }

  /**
   * Formatea el rango de fechas del título del resumen en el idioma de los reportes.
   */
  private formatSummaryReportTitle(start: DateTime, end: DateTime): string {
    const startLabel = start.setLocale(REPORT_LOCALE).toFormat('DDD')
    const endLabel = end.setLocale(REPORT_LOCALE).toFormat('DDD')
    return this.t('vacation_summary_report_title', { start: startLabel, end: endLabel })
  }
  async getExcelAll(filters: EmployeeVacationExcelFilterInterface) {
    try {
      const employees = await Employee.query()
        .if(filters.search, (query) => {
          query.where((subQuery) => {
            subQuery
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
              // PUNTO DE REINTRODUCCIÓN 08-10-04-01: búsqueda por rfc/curp/nss cifrados
          })
        })
        .if(filters.departmentId > 0, (query) => {
          query.where('department_id', filters.departmentId)
        })
        .if(filters.positionId > 0, (query) => {
          query.where('position_id', filters.positionId)
        })
        .if(filters.employeeId > 0, (query) => {
          query.where('employee_id', filters.employeeId)
        })
        .if(
          filters.onlyInactive &&
            (filters.onlyInactive === 'true' || filters.onlyInactive === true),
          (query) => {
            query.whereNotNull('employee_deleted_at')
            query.withTrashed()
          }
        )
        .where('business_unit_id', filters.businessUnitId)
        .if(filters.userResponsibleId &&
          typeof filters.userResponsibleId && filters.userResponsibleId > 0,
          (query) => {
            query.where((subQuery) => {
              subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
                userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
              })
              subQuery.orWhereHas('person', (personQuery) => {
                personQuery.whereHas('user', (userQuery) => {
                  userQuery.where('userId', filters.userResponsibleId!)
                })
              })
            })
          }
        )
        .preload('businessUnit')
        .preload('department')
        .preload('position')
        .preload('person')
        .orderBy('employee_code')

      const firstVacation = await ShiftException.query()
        .whereNull('shift_exceptions_deleted_at')
        .whereNotNull('vacation_setting_id')
        .orderBy('shift_exceptions_date', 'asc')
        .first()

      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      const years = []
      const start = DateTime.fromISO(filters.filterStartDate, { setZone: true }).setZone('UTC')
      const end = DateTime.fromISO(filters.filterEndDate, { setZone: true }).setZone('UTC')
      let startYear = start.year
      if (firstVacation && !filters.onlyOneYear) {
        startYear = new Date(firstVacation.shiftExceptionsDate.toString()).getUTCFullYear()
      }
      for (let year = startYear; year <= end.year; year++) {
        years.push(year)
      }
      for await (const year of years) {
        const sheet = workbook.addWorksheet(`${year}`)
        await this.addHeadRow(sheet)
        const rows = await this.addEmployees(employees, year)
        await this.addRowToWorkSheet(rows, sheet)
        this.paintBorderAll(sheet, rows.length)
      }
      // Crear un buffer del archivo Excel
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: 'Excel',
        message: 'Excel was created successfully',
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  paintBorderAll(worksheet: ExcelJS.Worksheet, rowCount: number) {
    for (let rowIndex = 1; rowIndex <= rowCount + 1; rowIndex++) {
      const row = worksheet.getRow(rowIndex)
      for (let colNumber = 1; colNumber <= 25; colNumber++) {
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

  addHeadRow(worksheet: ExcelJS.Worksheet) {
    const headers = [
      this.t('vacation_summary_report_id'),
      this.t('employee'),
      this.t('department'),
      this.t('position'),
      this.t('vacation_summary_report_hire_date'),
      this.t('vacation_excel_report_employer_company'),
      this.t('vacation_excel_report_years'),
      this.t('vacation_excel_report_vac'),
      this.t('vacation_excel_report_used'),
      this.t('vacation_excel_report_rest'),
    ]
    for (let i = 1; i <= 15; i++) {
      headers.push(`${this.t('date')} ${i}`)
    }
    // Agregar los encabezados al worksheet
    const headerRow = worksheet.addRow(headers)
    // Formato neutral: encabezado gris con texto negro, sin colores de marca
    for (let col = 1; col <= 25; col++) {
      const cell = worksheet.getCell(1, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.height = 24
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    const columnA = worksheet.getColumn(1)
    columnA.width = 15
    columnA.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnB = worksheet.getColumn(2)
    columnB.width = 40
    columnB.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnC = worksheet.getColumn(3)
    columnC.width = 64
    columnC.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnD = worksheet.getColumn(4)
    columnD.width = 64
    columnD.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnE = worksheet.getColumn(5)
    columnE.width = 16
    columnE.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnF = worksheet.getColumn(6)
    columnF.width = 55
    columnF.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnG = worksheet.getColumn(7)
    columnG.width = 15
    columnG.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnH = worksheet.getColumn(8)
    columnH.width = 15
    columnH.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnI = worksheet.getColumn(9)
    columnI.width = 15
    columnI.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnJ = worksheet.getColumn(10)
    columnJ.width = 15
    columnJ.alignment = { vertical: 'middle', horizontal: 'center' }
    for (let index = 11; index <= 25; index++) {
      const columnDate = worksheet.getColumn(index)
      columnDate.width = 25
      columnDate.alignment = { vertical: 'middle', horizontal: 'center' }
    }
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }, // Fija la primera fila
    ]
    const row = worksheet.getRow(1)
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  }

  async addEmployees(employees: Employee[], year: number) {
    const employeeService = new EmployeeService(this.i18n)
    const rows = [] as EmployeeVacationExcelRowInterface[]
    for await (const employee of employees) {
      const yearsWorked = await employeeService.getYearWorked(employee, year)
      let yearsPassed = 0
      let daysVacations = 0
      let daysUsed = 0
      const vacationsUsed = [] as Array<string>
      if (yearsWorked.status === 200) {
        if (yearsWorked.data.vacationUsedList) {
          for await (const shiftException of yearsWorked.data.vacationUsedList) {
            vacationsUsed.push(this.getDateFromHttp(shiftException.shiftExceptionsDate.toString()))
          }
        }
        yearsPassed = yearsWorked.data.yearsPassed ? yearsWorked.data.yearsPassed : 0
        daysVacations = yearsWorked.data.vacationSetting?.vacationSettingVacationDays
          ? yearsWorked.data.vacationSetting?.vacationSettingVacationDays
          : 0
        daysUsed = yearsWorked.data.vacationUsedList ? yearsWorked.data.vacationUsedList.length : 0
      }
      const newRow = {
        employeeCode: employee.employeePayrollCode?.toString() || '',
        employeeName: `${employee.person?.personFirstname} ${employee.person?.personLastname} ${employee.person?.personSecondLastname}`,
        department: employee.department ? employee.department.departmentName : '',
        position: employee.position ? employee.position.positionName : '',
        employeeHireDate: employee.employeeHireDate
          ? this.getDate(employee.employeeHireDate.toString())
          : '',
        employerCompany: employee.businessUnit ? employee.businessUnit.businessUnitLegalName : '',
        years: yearsPassed,
        daysVacations: daysVacations,
        daysUsed: daysUsed,
        daysRest: daysVacations - daysUsed,
        vacationsUsed: vacationsUsed,
      } as EmployeeVacationExcelRowInterface
      rows.push(newRow)
    }
    return rows
  }

  async addRowToWorkSheet(rows: EmployeeVacationExcelRowInterface[], worksheet: ExcelJS.Worksheet) {
    for await (const rowData of rows) {
      const row = [
        rowData.employeeCode,
        rowData.employeeName,
        rowData.department,
        rowData.position,
        rowData.employeeHireDate,
        rowData.employerCompany,
        rowData.years,
        rowData.daysVacations,
        rowData.daysUsed,
        rowData.daysRest,
      ]
      if (rowData.vacationsUsed.length > 0) {
        for await (const vacation of rowData.vacationsUsed) {
          row.push(vacation)
        }
      }
      worksheet.addRow(row)
    }
  }

  /**
   * Fecha de calendario (`dd/MM/yyyy`) de una columna DATE serializada. La
   * conexión está en UTC, así que se lee en UTC para no correrla un día.
   */
  getDate(date: string) {
    return formatReportCalendarDate(date)
  }

  /**
   * Fecha de calendario (`dd/MM/yyyy`) de `shift_exceptions_date`: se guarda
   * como medianoche UTC del día de la vacación, por eso se lee en UTC.
   */
  getDateFromHttp(date: string) {
    return formatReportCalendarDate(new Date(date))
  }

  /** Lee de vuelta una fecha escrita con `getDate`/`getDateFromHttp`. */
  private parseReportDate(date: string): DateTime {
    return DateTime.fromFormat(date, REPORT_DATE_FORMAT, { zone: 'utc' })
  }

  async getVacationUsedExcel(filters: EmployeeVacationExcelFilterInterface) {
    try {
      const employees = await Employee.query()
        .if(filters.search, (query) => {
          query.where((subQuery) => {
            subQuery
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
              // PUNTO DE REINTRODUCCIÓN 08-10-04-01: búsqueda por rfc/curp/nss cifrados
          })
        })
        .if(filters.departmentId > 0, (query) => {
          query.where('department_id', filters.departmentId)
        })
        .if(filters.positionId > 0, (query) => {
          query.where('position_id', filters.positionId)
        })
        .if(filters.employeeId > 0, (query) => {
          query.where('employee_id', filters.employeeId)
        })
        .if(
          filters.onlyInactive &&
            (filters.onlyInactive === 'true' || filters.onlyInactive === true),
          (query) => {
            query.whereNotNull('employee_deleted_at')
            query.withTrashed()
          }
        )
        .where('business_unit_id', filters.businessUnitId)
        .if(filters.userResponsibleId &&
          typeof filters.userResponsibleId && filters.userResponsibleId > 0,
          (query) => {
            query.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
              userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
            })
          }
        )
        .preload('businessUnit')
        .preload('department')
        .preload('position')
        .preload('person')
        .orderBy('employee_code')
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      const years = []
      const start = DateTime.fromISO(filters.filterStartDate, { setZone: true }).setZone('UTC')
      const end = DateTime.fromISO(filters.filterEndDate, { setZone: true }).setZone('UTC')
      for (let year = start.year; year <= end.year; year++) {
        years.push(year)
      }
      for await (const year of years) {
        const sheet = workbook.addWorksheet(this.t('vacation_used_report_sheet_name', { year: String(year) }))
        this.addVacationUsedHeadRow(sheet)
        const rows = await this.addEmployeesVacationUsed(employees, year)
        await this.addRowVacationUsedToWorkSheet(rows, sheet)
        this.paintVacationUsedBorderAll(sheet, rows.length)
      }
      // Crear un buffer del archivo Excel
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: 'Excel',
        message: 'Excel was created successfully',
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  async addEmployeesVacationUsed(employees: Employee[], year: number) {
    const rows = [] as EmployeeVacationUsedDaysExcelRowInterface[]
    for await (const employee of employees) {
      let vacationsUsedList = [] as Array<ShiftException>

        vacationsUsedList = await ShiftException.query()
          .whereNull('shift_exceptions_deleted_at')
          .where('employee_id', employee.employeeId)
          .whereRaw('YEAR(shift_exceptions_date) = ?', [year ? year : 0])
          .whereNotNull('vacation_setting_id')
          .orderBy('shift_exceptions_date', 'asc')

      const vacationsUsed = [] as Array<string>


        if (vacationsUsedList.length > 0) {
          for await (const shiftException of vacationsUsedList) {
            vacationsUsed.push(this.getDateFromHttp(shiftException.shiftExceptionsDate.toString()))
            const newRow = {
              date: this.getDateFromHttp(shiftException.shiftExceptionsDate.toString()),
              employeeCode: employee.employeePayrollCode?.toString() || '',
              employeeName: `${employee.person?.personFirstname} ${employee.person?.personLastname} ${employee.person?.personSecondLastname}`,
              department: employee.department ? employee.department.departmentName : '',
              position: employee.position ? employee.position.positionName : '',
            } as EmployeeVacationUsedDaysExcelRowInterface
            rows.push(newRow)
          }
        }
    }
    return rows
  }

  async addRowVacationUsedToWorkSheet(rows: EmployeeVacationUsedDaysExcelRowInterface[], worksheet: ExcelJS.Worksheet) {
    rows.sort((a, b) => {
      const dateA = this.parseReportDate(a.date)
      const dateB = this.parseReportDate(b.date)

      if (dateA < dateB) return -1
      if (dateA > dateB) return 1

      if (a.employeeCode < b.employeeCode) return -1
      if (a.employeeCode > b.employeeCode) return 1

      return 0
    })
    // Bandas alternas por fecha en grises neutrales (sin colores de marca)
    const fillColors = [REPORT_NEUTRAL_ARGB.subheaderFill, REPORT_NEUTRAL_ARGB.background]

    let lastDate = null
    let colorIndex = 0
    for await (const rowData of rows) {
      const row = [
        rowData.date,
        rowData.employeeCode,
        rowData.employeeName,
        rowData.department,
        rowData.position,
      ]
      const newRow = worksheet.addRow(row)


      if (rowData.date !== lastDate) {
        lastDate = rowData.date;
        colorIndex = (colorIndex + 1) % fillColors.length;
      }

      for (let i = 1; i <= 5; i++) {
        newRow.getCell(i).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillColors[colorIndex] },
        }
      }
    }
  }

  /**
   * Encabezado del reporte de vacaciones usadas. Formato neutral: sin la fila
   * del logo, los encabezados de columna quedan en la fila 1.
   */
  addVacationUsedHeadRow(worksheet: ExcelJS.Worksheet) {
    const headers = [
      this.t('date'),
      this.t('vacation_summary_report_id'),
      this.t('employee'),
      this.t('department'),
      this.t('position'),
    ]

    // Agregar los encabezados al worksheet
    const headerRow = worksheet.addRow(headers)
    for (let col = 1; col <= 5; col++) {
      const cell = headerRow.getCell(col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.height = 24
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    const columnA = worksheet.getColumn(1)
    columnA.width = 15
    columnA.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnB = worksheet.getColumn(2)
    columnB.width = 15
    columnB.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnC = worksheet.getColumn(3)
    columnC.width = 64
    columnC.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnD = worksheet.getColumn(4)
    columnD.width = 64
    columnD.alignment = { vertical: 'middle', horizontal: 'left' }
    const columnE = worksheet.getColumn(5)
    columnE.width = 64

    worksheet.views = [
      { state: 'frozen', ySplit: 1 }, // Fija la fila de encabezados
    ]
    const row = worksheet.getRow(1)
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  }

  paintVacationUsedBorderAll(worksheet: ExcelJS.Worksheet, rowCount: number) {
    // Fila 1 = encabezados; los datos empiezan en la fila 2
    for (let rowIndex = 1; rowIndex <= rowCount + 1; rowIndex++) {
      const row = worksheet.getRow(rowIndex)
      for (let colNumber = 1; colNumber <= 5; colNumber++) {
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

  async getVacationsSummaryExcel(filters: EmployeeVacationExcelFilterInterface) {
    try {
      const employees = await Employee.query()
        .if(filters.search, (query) => {
          query.where((subQuery) => {
            subQuery
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
              // PUNTO DE REINTRODUCCIÓN 08-10-04-01: búsqueda por rfc/curp/nss cifrados
          })
        })
        .if(filters.departmentId > 0, (query) => {
          query.where('department_id', filters.departmentId)
        })
        .if(filters.positionId > 0, (query) => {
          query.where('position_id', filters.positionId)
        })
        .if(filters.employeeId > 0, (query) => {
          query.where('employee_id', filters.employeeId)
        })
        .if(
          filters.onlyInactive &&
            (filters.onlyInactive === 'true' || filters.onlyInactive === true),
          (query) => {
            query.whereNotNull('employee_deleted_at')
            query.withTrashed()
          }
        )
        .where('business_unit_id', filters.businessUnitId)
        .if(filters.userResponsibleId &&
          typeof filters.userResponsibleId && filters.userResponsibleId > 0,
          (query) => {
            query.where((subQuery) => {
              subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
                userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
              })
              subQuery.orWhereHas('person', (personQuery) => {
                personQuery.whereHas('user', (userQuery) => {
                  userQuery.where('userId', filters.userResponsibleId!)
                })
              })
            })
          }
        )
        .preload('businessUnit')
        .preload('department')
        .preload('position')
        .orderBy('employee_code')

      const firstVacation = await ShiftException.query()
        .whereNull('shift_exceptions_deleted_at')
        .whereNotNull('vacation_setting_id')
        .orderBy('shift_exceptions_date', 'asc')
        .first()

      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      const years = []
      const start = DateTime.fromISO(filters.filterStartDate, { setZone: true }).setZone('UTC')
      const end = DateTime.fromISO(filters.filterEndDate, { setZone: true }).setZone('UTC')
      let startYear = start.year
      if (firstVacation && !filters.onlyOneYear) {
        startYear = new Date(firstVacation.shiftExceptionsDate.toString()).getUTCFullYear()
      }
      for (let year = startYear; year <= end.year; year++) {
        years.push(year)
      }
      const title = this.formatSummaryReportTitle(start, end)
      const sheetName = this.t('vacation_summary_report_sheet_name')
      const sheet = workbook.addWorksheet(sheetName)
      this.addHeadRowSummary(sheet, title, years)
      const rows = await this.addEmployeesSummary(employees, years)
      await this.addRowToWorkSheetSummary(rows, sheet)
      this.paintBorderAllSummary(sheet, rows.length, years)

      // Crear un buffer del archivo Excel
      const buffer = await workbook.xlsx.writeBuffer()
      return {
        status: 201,
        type: 'success',
        title: 'Excel',
        message: 'Excel was created successfully',
        buffer: buffer,
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * Encabezado del resumen. Formato neutral: sin logo; la fila 1 conserva solo
   * el título para no mover las filas fijas que usa `paintBorderAllSummary`
   * (fila 3 = años, fila 4 = encabezados, datos desde la fila 5).
   */
  addHeadRowSummary(worksheet: ExcelJS.Worksheet, title: string, years: number[]) {
    worksheet.getRow(1).height = 28
    worksheet.addRow([])
    worksheet.getCell('A1').value = title
    worksheet.mergeCells('A1:E1')
    worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
    worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.addRow([])
    let cell = null
    const headers = [
      this.t('vacation_summary_report_id'),
      this.t('employee'),
      this.t('department'),
      this.t('position'),
      this.t('vacation_summary_report_hire_date'),
    ]

    // Agregar los encabezados al worksheet
    const headerRow = worksheet.addRow(headers)
    for (let col = 1; col <= 5; col++) {
      cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
      }
    }
    headerRow.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }

    const labels = [
      this.t('vacation_summary_report_years'),
      this.t('vacation_summary_report_vac'),
      this.t('vacation_summary_report_used'),
      this.t('vacation_summary_report_rest'),
      this.t('vacation_summary_report_acc_disp'),
    ]
    let startColIndex = 7
    const rowNumber = 3

    for (const year of years) {
      const startColLetter = worksheet.getColumn(startColIndex).letter
      const endColLetter = worksheet.getColumn(startColIndex + 4).letter
      const cellRange = `${startColLetter}${rowNumber}:${endColLetter}${rowNumber}`

      for (let i = 0; i < 5; i++) {
        worksheet.getColumn(startColIndex + i).width = 8.43
      }

      worksheet.mergeCells(cellRange)
      cell = worksheet.getCell(`${startColLetter}${rowNumber}`)
      cell.value = year
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }

      for (let col = startColIndex; col <= startColIndex + 4; col++) {
        cell = worksheet.getCell(3, col)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
        }
        cell = worksheet.getCell(4, col)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
        }
      }
      const labelsRow = 4
      for (const [i, label] of labels.entries()) {
        const colLetter = worksheet.getColumn(startColIndex + i).letter
        const labelCell = worksheet.getCell(`${colLetter}${labelsRow}`)
        labelCell.value = label
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' }
        labelCell.font = { bold: true, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      }
      startColIndex += 6
    }


    const columnA = worksheet.getColumn(1)
    columnA.width = 15

    columnA.alignment = { vertical: 'middle', horizontal: 'center' }
    const columnB = worksheet.getColumn(2)
    columnB.width = 40
    columnB.alignment = { vertical: 'middle' }
    const columnC = worksheet.getColumn(3)
    columnC.width = 34
    columnC.alignment = { vertical: 'middle' }
    const columnD = worksheet.getColumn(4)
    columnD.width = 46
    columnD.alignment = { vertical: 'middle' }
    const columnE = worksheet.getColumn(5)
    columnE.width = 16
    columnE.alignment = { vertical: 'middle', horizontal: 'center' }

    worksheet.views = [
      { state: 'frozen', ySplit: 1 },
      { state: 'frozen', ySplit: 2 },
      { state: 'frozen', ySplit: 3 },
      { state: 'frozen', ySplit: 4 },
    ]
    const row = worksheet.getRow(1)
    row.eachCell({ includeEmpty: true }, (currentCell) => {
      currentCell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  }

  async addRowToWorkSheetSummary(rows: EmployeeVacationExcelRowSummaryInterface[], worksheet: ExcelJS.Worksheet) {
    for await (const rowData of rows) {
      const row: (string | number)[] = [
        rowData.employeeCode,
        rowData.employeeName,
        rowData.department,
        rowData.position,
        rowData.employeeHireDate,
      ]
      for await (const year of rowData.years) {
        row.push('')
        row.push(year.years)
        row.push(year.daysVacations)
        row.push(year.daysUsed)
        row.push(year.daysRest)
        row.push(year.daysAccumulateAvailable)
      }
      worksheet.addRow(row)
    }
  }

  async addEmployeesSummary(employees: Employee[], years: number[]) {
    const employeeService = new EmployeeService(this.i18n)
    const rows = [] as EmployeeVacationExcelRowSummaryInterface[]
    for await (const employee of employees) {
      const yearsInfo = [] as EmployeeVacationExcelRowSummaryYearInterface[]
      for (const year of years) {
        const vacationsUsed = [] as Array<string>
        const yearsWorked = await employeeService.getYearWorked(employee, year)
        let yearsPassed = 0
        let daysVacations = 0
        let daysUsed = 0
        if (yearsWorked.status === 200) {
          if (yearsWorked.data.vacationUsedList) {
            for await (const shiftException of yearsWorked.data.vacationUsedList) {
              vacationsUsed.push(this.getDateFromHttp(shiftException.shiftExceptionsDate.toString()))
            }
          }
          yearsPassed = yearsWorked.data.yearsPassed ? yearsWorked.data.yearsPassed : 0
          daysVacations = yearsWorked.data.vacationSetting?.vacationSettingVacationDays
            ? yearsWorked.data.vacationSetting?.vacationSettingVacationDays
            : 0
          daysUsed = yearsWorked.data.vacationUsedList ? yearsWorked.data.vacationUsedList.length : 0
        }
        const yearinfo = { year: year, years: yearsPassed, daysVacations: daysVacations, daysUsed: daysUsed, daysRest: daysVacations - daysUsed ,daysAccumulateAvailable: 0 } as EmployeeVacationExcelRowSummaryYearInterface
        yearsInfo.push(yearinfo)
      }

      const newRow = {
        employeePayrollCode:
          employee.employeePayrollCode?.toString() || employee.employeePayrollNum?.toString() || '',
        employeeCode:
          employee.employeePayrollCode?.toString() || employee.employeePayrollNum?.toString() || '',
        employeeName: `${employee.employeeFirstName} ${employee.employeeLastName}`,
        department: employee.department ? employee.department.departmentName : '',
        position: employee.position ? employee.position.positionName : '',
        employeeHireDate: employee.employeeHireDate
          ? this.getDate(employee.employeeHireDate.toString())
          : '',
          years: yearsInfo
      } as EmployeeVacationExcelRowSummaryInterface
      rows.push(newRow)
    }
    return rows
  }

  paintBorderAllSummary(worksheet: ExcelJS.Worksheet, rowCount: number, years: number[]) {
    const today = DateTime.now()
    const rowTempYear = worksheet.getRow(3)
    for (let rowIndex = 1; rowIndex <= rowCount + 4; rowIndex++) {
      const row = worksheet.getRow(rowIndex)
      const cellDate = row.getCell(5)
      for (let colNumber = 1; colNumber <= 5; colNumber++) {
        let cell = row.getCell(colNumber)
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        }
        let startColIndex = 7
        const cellValue = cellDate.value
        const hireDate = typeof cellValue === 'string'
          ? this.parseReportDate(cellValue)
          : DateTime.fromJSDate(cellValue as Date)
        for (let i = 0; i < years.length; i++) {
          let cellYear = rowTempYear.getCell(startColIndex)
          const currentYear = cellYear.value
          const cellYearQuantity = row.getCell(startColIndex)
          const currentYearQuantity = cellYearQuantity.value
          let canUseDays = true
          if (today.year === currentYear && currentYearQuantity === 1) {
            if (cellValue) {
              if (hireDate.isValid) {
                if (hireDate.startOf('day') <= today.startOf('day')) {
                  canUseDays = false
                }
              }
            }
          }

          for (let j = 0; j < 5; j++) {
            cellYear = row.getCell(startColIndex + j)
            cellYear.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } },
            }
            cellYear.alignment = {
              vertical: 'middle',
              horizontal: 'center',
            }

            // Colores de estatus (sin saldo / disponible / aún no utilizable):
            // semánticos, no de marca; se conservan en formato neutral.
            if ((j === 3 || j === 4) && rowIndex > 4) {
              let bgColor = 'FFF2F2F2'
              let color = 'FF969696'
              if (typeof cellYear.value === 'number' && cellYear.value > 0) {
                bgColor = 'FFECF1E0'
                color = 'FF50AE5D'
                if (j === 3 ) {
                  if (!canUseDays) {
                    bgColor = 'FFFAEADB'
                    color = 'FFD3722D'
                  }
                }
              }
              cellYear.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: bgColor },
              }
              cellYear.font = { color: { argb: color } }
            }
          }
          startColIndex += 6
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLANTILLA DE IMPORTACIÓN DE VACACIONES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Genera el archivo Excel de plantilla para importación masiva de vacaciones.
   * Diseño:
   *  - Formato neutral (report_neutral_theme): sin logo ni colores de la
   *    empresa; encabezados en gris con texto negro
   *  - Columnas fijas (1–9): identificador nómina, nombre, departamento, puesto,
   *    unidad de negocio, unidad de nómina, sucursal, días a omitir, razón
   *  - Columnas de días (10+): tantas como el máximo de días posibles según
   *    el VacationSetting más alto de todos los empleados
   *  - Por empleado: las celdas de días se colorean según sus días disponibles
   *    actuales (total − usados − deducciones previas); todas son editables
   */
  async generateVacationImportTemplate(
    filters: EmployeeVacationExcelFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ): Promise<{
    status: number
    buffer?: Buffer
    type?: string
    title?: string
    message?: string
    detail?: string
    key?: string
    code?: string
  }> {
    try {
      // ── Obtener empleados según filtros ──
      const businessUnitIds = allowedBusinessUnitIds

      const employees = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereIn('business_unit_id', businessUnitIds)
        .if(!!filters.search, (q) => {
          q.where((sub) => {
            sub
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_payroll_code) = ?', [`${filters.search.toUpperCase()}`])
          })
        })
        .if(filters.departmentId > 0, (q) => q.where('department_id', filters.departmentId))
        .if(filters.positionId > 0, (q) => q.where('position_id', filters.positionId))
        .if(filters.employeeId > 0, (q) => q.where('employee_id', filters.employeeId))
        .if(!!filters.userResponsibleId && filters.userResponsibleId > 0, (q) => {
          q.where((sub) => {
            sub
              .whereHas('userResponsibleEmployee', (r) => r.where('userId', filters.userResponsibleId!))
              .orWhereHas('person', (p) =>
                p.whereHas('user', (u) => u.where('userId', filters.userResponsibleId!))
              )
          })
        })
        .if(
          !!filters.businessUnitId && filters.businessUnitId > 0,
          (q) => q.where('business_unit_id', filters.businessUnitId!)
        )
        .if(
          !!filters.payrollBusinessUnitId && filters.payrollBusinessUnitId > 0,
          (q) => q.where('payroll_business_unit_id', filters.payrollBusinessUnitId!)
        )
        .preload('department')
        .preload('position')
        .preload('businessUnit')
        .orderBy('employee_code')

      // ── Calcular días disponibles por empleado y MAX global ──
      interface EmpInfo {
        payrollId: string
        fullName: string
        department: string
        position: string
        businessUnit: string
        payrollUnit: string
        sucursal: string
        availableDays: number // días que puede ingresar (disponibles netos)
        totalDays: number     // días totales del periodo vigente (para encabezado)
      }

      const empInfoList: EmpInfo[] = []
      let maxVacationCols = 0

      for (const emp of employees) {
        const periods = await this.getVacationPeriodsOrdered(emp)
        const availableDays = periods.reduce((acc, p) => acc + p.available, 0)
        const totalDays = periods.reduce((acc, p) => acc + p.totalDays, 0)

        if (totalDays > maxVacationCols) maxVacationCols = totalDays

        let payrollUnitName = ''
        if (emp.payrollBusinessUnitId) {
          const pu = await BusinessUnit.find(emp.payrollBusinessUnitId)
          payrollUnitName = pu?.businessUnitName ?? ''
        }

        empInfoList.push({
          payrollId: emp.employeePayrollNum || emp.employeePayrollCode || '',
          fullName: [emp.employeeFirstName, emp.employeeLastName, emp.employeeSecondLastName]
            .filter(Boolean)
            .join(' ')
            .toUpperCase(),
          department: emp.department?.departmentName ?? '',
          position: emp.position?.positionName ?? '',
          businessUnit: emp.businessUnit?.businessUnitName ?? '',
          payrollUnit: payrollUnitName,
          sucursal: emp.businessUnit?.businessUnitName ?? '',
          availableDays,
          totalDays,
        })
      }

      // Asegurar mínimo razonable aunque no haya empleados
      if (maxVacationCols === 0) maxVacationCols = 30

      // ── Crear workbook ──
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Plantilla de Vacaciones')

      // ── Fila 1: vacía. Antes alojaba el logo; se conserva porque el
      // importador lee los datos a partir de la fila 5 (plantillas ya
      // descargadas siguen siendo válidas) ──

      // ── Fila 2: título ──
      const totalColCount = 9 + maxVacationCols
      const lastColLetter = this.colIndexToLetter(totalColCount)
      ws.mergeCells(`A2:${lastColLetter}2`)
      const titleRow = ws.getRow(2)
      titleRow.height = 28
      const titleCell = ws.getCell('A2')
      titleCell.value = 'PLANTILLA DE IMPORTACIÓN DE VACACIONES'
      titleCell.font = { bold: true, size: 14, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' }

      // ── Fila 3: encabezados fijos + encabezados de días ──
      const FIXED_HEADERS = [
        'Identificador de nómina',
        'Nombre del empleado',
        'Departamento',
        'Puesto',
        'Unidad de negocio',
        'Unidad de nómina',
        'Sucursal',
        'Días a omitir manualmente',
        'Razón de días omitidos',
      ]
      const dayHeaders = Array.from({ length: maxVacationCols }, (_, i) => `Día ${i + 1}`)

      const headerRow = ws.getRow(3)
      headerRow.height = 35
      ;[...FIXED_HEADERS, ...dayHeaders].forEach((val, idx) => {
        const cell = headerRow.getCell(idx + 1)
        cell.value = val
        cell.font = { bold: true, size: 9, color: { argb: REPORT_NEUTRAL_ARGB.text } }
        // Columnas fijas en gris medio; columnas de días en gris claro
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: idx < 9 ? REPORT_NEUTRAL_ARGB.headerFill : REPORT_NEUTRAL_ARGB.subheaderFill,
          },
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        }
      })

      // ── Fila 4: sub-encabezado de días (referencia numérica + instrucción) ──
      const subHeaderRow = ws.getRow(4)
      subHeaderRow.height = 22
      ;[...Array(9).fill(''), ...dayHeaders.map(() => 'dd/MM/yyyy')].forEach((val, idx) => {
        const cell = subHeaderRow.getCell(idx + 1)
        cell.value = val
        if (idx >= 9) {
          cell.font = { italic: true, size: 8, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NEUTRAL_ARGB.subheaderFill } }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill } }
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        }
      })

      // ── Anchos de columnas ──
      const FIXED_WIDTHS = [20, 35, 25, 25, 22, 22, 22, 22, 35]
      FIXED_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })
      for (let c = 10; c <= totalColCount; c++) { ws.getColumn(c).width = 14 }

      // ── Fills de datos (escala de grises; la distinción entre zonas se
      // conserva por intensidad de gris y grosor de borde) ──
      const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
      const FILL_EVEN = solidFill(REPORT_NEUTRAL_ARGB.subheaderFill)
      const FILL_ODD = solidFill(REPORT_NEUTRAL_ARGB.background)
      // Columnas informativas (2–7): gris muy claro
      const FILL_INFO = solidFill(REPORT_NEUTRAL_ARGB.subheaderFill)
      // Columnas editables (8–9): blanco con borde negro
      const FILL_EDITABLE = solidFill(REPORT_NEUTRAL_ARGB.background)
      // Zona 1 — días disponibles: siempre blanco
      const FILL_AVAILABLE = solidFill(REPORT_NEUTRAL_ARGB.background)
      // Zona 2 — días a futuro / dentro del periodo pero ya consumidos: gris oscuro
      const FILL_FUTURE = solidFill(REPORT_NEUTRAL_ARGB.totalFill)
      // Zona 3 — fuera del periodo actual: gris claro
      const FILL_USED = solidFill(REPORT_NEUTRAL_ARGB.headerFill)

      const BORDER_THIN = (color: string = REPORT_NEUTRAL_ARGB.border) => ({
        top: { style: 'thin' as const, color: { argb: color } },
        left: { style: 'thin' as const, color: { argb: color } },
        bottom: { style: 'thin' as const, color: { argb: color } },
        right: { style: 'thin' as const, color: { argb: color } },
      })

      // ── Filas de datos (a partir de la fila 5) ──
      empInfoList.forEach((info, ei) => {
        const rowIdx = 5 + ei
        const dataRow = ws.getRow(rowIdx)
        dataRow.height = 22
        const rowFill = ei % 2 === 0 ? FILL_EVEN : FILL_ODD

        // Columnas informativas (1–7): diferenciadas solo visualmente, la hoja no se protege.
        const fixedValues = [
          info.payrollId,
          info.fullName,
          info.department,
          info.position,
          info.businessUnit,
          info.payrollUnit,
          info.sucursal,
        ]
        fixedValues.forEach((val, colIdx) => {
          const cell = dataRow.getCell(colIdx + 1)
          cell.value = val
          cell.fill = colIdx === 0 ? rowFill : FILL_INFO
          cell.font = { size: 9, color: { argb: REPORT_NEUTRAL_ARGB.text } }
          cell.alignment = { vertical: 'middle', horizontal: colIdx === 0 ? 'center' : 'left', wrapText: true }
          cell.border = BORDER_THIN()
        })

        // Col 8: Días a omitir (editable)
        const cellSkip = dataRow.getCell(8)
        cellSkip.value = ''
        cellSkip.fill = FILL_EDITABLE
        cellSkip.font = { size: 9 }
        cellSkip.alignment = { vertical: 'middle', horizontal: 'center' }
        cellSkip.border = BORDER_THIN(REPORT_NEUTRAL_ARGB.text)

        // Col 9: Razón (editable)
        const cellReason = dataRow.getCell(9)
        cellReason.value = ''
        cellReason.fill = FILL_EDITABLE
        cellReason.font = { size: 9 }
        cellReason.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        cellReason.border = BORDER_THIN(REPORT_NEUTRAL_ARGB.text)

        // Columnas de días (10 en adelante) — tres zonas visuales:
        //   [1..availableDays]             → blanco      (días disponibles netos)
        //   [availableDays+1..totalDays]   → gris oscuro (días "a futuro", ya consumidos en el periodo)
        //   [totalDays+1..maxVacationCols] → gris claro  (fuera del periodo actual)
        for (let d = 1; d <= maxVacationCols; d++) {
          const cell = dataRow.getCell(9 + d)
          cell.value = ''
          cell.alignment = { vertical: 'middle', horizontal: 'center' }

          if (d <= info.availableDays) {
            // Zona 1: días disponibles netos — siempre blanco
            cell.fill = FILL_AVAILABLE
            cell.font = { size: 9, color: { argb: REPORT_NEUTRAL_ARGB.text } }
            cell.border = BORDER_THIN()
          } else if (d <= info.totalDays) {
            // Zona 2: días a futuro / dentro del periodo pero ya consumidos — gris oscuro
            cell.fill = FILL_FUTURE
            cell.font = { size: 9, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
            cell.border = BORDER_THIN()
          } else {
            // Zona 3: fuera del periodo actual — gris claro
            cell.fill = FILL_USED
            cell.font = { size: 9, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
            cell.border = BORDER_THIN()
          }
        }
      })

      // ── Congelar encabezados (filas 1–4) y solo col B (nombre) ──
      ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 2, topLeftCell: 'C5', activeCell: 'J5' }]

      // ── Hoja de instrucciones ──
      const wsInstr = workbook.addWorksheet('Instrucciones')
      const instrLines: [string, boolean][] = [
        ['INSTRUCCIONES DE USO - PLANTILLA DE IMPORTACIÓN DE VACACIONES', true],
        ['', false],
        ['1. Identificador de nómina: Requerido. Debe coincidir exactamente con el sistema.', false],
        ['2. Columnas 2–7 (Nombre, Departamento, Puesto, etc.) son informativas. NO las modifique.', false],
        ['3. Días a omitir (col 8): número entero ≥ 1. Si no omite días, déjelo vacío.', false],
        ['4. Razón de días omitidos (col 9): OBLIGATORIA si ingresa días a omitir.', false],
        ['5. A partir de la columna 10 ingrese las FECHAS de vacaciones en formato dd/MM/yyyy.', false],
        ['   - No es necesario llenar todas las celdas disponibles.', false],
        ['6. Al importar, el sistema valida:', false],
        ['   - Que el empleado exista por identificador de nómina.', false],
        ['   - Que las fechas tengan el formato correcto dd/MM/yyyy.', false],
        ['   - Que si hay días a omitir, la razón esté presente.', false],
        ['7. Si hay errores en alguna fila, NINGÚN dato se guarda. Se reporta fila y detalle.', false],
        ['8. Los días se registran del periodo más antiguo al más reciente.', false],
        ['   Los días a omitir también se descuentan del periodo más antiguo.', false],
        ['9. Los días a futuro (fondo gris oscuro) corresponden a días dentro del periodo', false],
        ['   del empleado que ya fueron consumidos. Si los utiliza, se asignarán al periodo', false],
        ['   vigente más próximo disponible.', false],
        ['', false],
        ['COLORES DE REFERENCIA', true],
        ['Fondo gris muy claro (columnas 2–7): información de referencia.', false],
        ['Fondo blanco con borde negro (columnas 8–9): campos editables.', false],
        ['Fondo blanco (columnas 10+): días disponibles netos para ingresar fecha.', false],
        ['Fondo gris oscuro: días a futuro (dentro del periodo, ya consumidos). Editables.', false],
        ['Fondo gris claro: días fuera del periodo actual. Editables para asignaciones futuras.', false],
      ]
      instrLines.forEach(([text, isBold]) => {
        const row = wsInstr.addRow([text])
        row.getCell(1).font = {
          bold: isBold,
          size: isBold ? 12 : 10,
          color: { argb: REPORT_NEUTRAL_ARGB.text },
        }
        row.height = isBold ? 22 : 16
      })
      wsInstr.getColumn(1).width = 95

      const buffer = await workbook.xlsx.writeBuffer()
      return { status: 201, buffer: Buffer.from(buffer) }
    } catch (error: any) {
      logger.error({ err: error }, 'Error inesperado al generar la plantilla de importación de vacaciones')
      const resolved = resolveEmployeeImportApiError(error, 500, this.i18n, {
        errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS,
        key: 'error-importacion-vacaciones',
      })
      return {
        status: 500,
        type: 'error',
        title: 'Error al generar template',
        message: 'Ocurrió un error al generar la plantilla de vacaciones',
        detail: resolved.detail,
        key: resolved.key,
        code: resolved.errorCode,
      }
    }
  }

  /** Convierte índice de columna (1-based) a letra(s) Excel (A, B, ..., Z, AA, ...) */
  private colIndexToLetter(colIndex: number): string {
    let result = ''
    let n = colIndex
    while (n > 0) {
      const rem = (n - 1) % 26
      result = String.fromCharCode(65 + rem) + result
      n = Math.floor((n - 1) / 26)
    }
    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORTACIÓN MASIVA DE VACACIONES DESDE EXCEL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Valida e importa vacaciones desde el Excel generado por generateVacationImportTemplate.
   * Aplica primero las omisiones (deducciones) comenzando por el periodo más antiguo,
   * luego registra los días de vacaciones en los periodos disponibles.
   * Si hay cualquier error de validación, no guarda nada y retorna detalle de errores.
   */
  async importVacationFromExcel(file: any, allowedBusinessUnitIds: number[] = []): Promise<{
    status: number
    type: string
    title: string
    message: string
    data?: any
    detail?: string
    key?: string
    code?: string
  }> {
    // ── 1. Leer el workbook ──
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.readFile(file.tmpPath)
    } catch {
      return {
        status: 400,
        type: 'error',
        title: 'Archivo inválido',
        message: 'No se pudo leer el archivo. Asegúrese de subir un Excel válido (.xlsx).',
      }
    }

    const ws = workbook.getWorksheet('Plantilla de Vacaciones')
    if (!ws) {
      return {
        status: 400,
        type: 'error',
        title: 'Hoja no encontrada',
        message: 'El archivo no contiene la hoja "Plantilla de Vacaciones". Use la plantilla oficial.',
      }
    }

    // ── 2. Recolectar filas de datos (a partir de la fila 5) ──
    // Estructura de la plantilla: fila 1 = vacía (antes logo), fila 2 = título, fila 3 = encabezados, fila 4 = sub-encabezado
    const dataRows: any[] = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= 5) dataRows.push({ row, rowNumber })
    })

    if (dataRows.length === 0) {
      return {
        status: 400,
        type: 'warning',
        title: 'Sin datos',
        message: 'El archivo no contiene filas de datos.',
      }
    }

    if (dataRows.length > MAX_VACATION_IMPORT_DATA_ROWS) {
      return {
        status: 400,
        type: 'error',
        title: 'Demasiadas filas en el archivo',
        message: `El archivo tiene ${dataRows.length} filas de datos, por encima del máximo permitido (${MAX_VACATION_IMPORT_DATA_ROWS}). Divide el archivo en lotes más pequeños.`,
      }
    }

    // ── 3. Obtener el tipo de excepción "vacation" ──
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()

    if (!vacationType) {
      return {
        status: 500,
        type: 'error',
        title: 'Configuración faltante',
        message: 'No se encontró el tipo de excepción "vacation" en el sistema.',
      }
    }

    // ── 4. Fase de validación — acumular todos los errores antes de guardar ──
    interface RowParsed {
      rowNumber: number
      employee: Employee
      daysToSkip: number
      skipReason: string
      vacationDates: DateTime[]
    }

    const parsed: RowParsed[] = []
    const validationErrors: string[] = []

    for (const { row, rowNumber } of dataRows) {
      const getCellValue = (col: number): string => {
        const cell = row.getCell(col)
        const raw = cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value
        if (raw === null || raw === undefined) return ''
        // Si ExcelJS entregó un objeto Date nativo, convertir a dd/MM/yyyy directamente
        if (raw instanceof Date) {
          const dt = DateTime.fromJSDate(raw)
          return dt.isValid ? dt.toFormat('dd/MM/yyyy') : ''
        }
        return String(raw).trim()
      }

      const payrollId = getCellValue(1)

      // Fila completamente vacía → saltar silenciosamente
      if (!payrollId) continue

      // Buscar empleado por identificador de nómina, dentro del alcance de empresa del usuario.
      // El whereIn va FUERA del callback de grupo: dentro quedaría bajo el OR y no acotaría nada.
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereIn('business_unit_id', allowedBusinessUnitIds)
        .where((q) => {
          q.where('employee_payroll_num', payrollId).orWhere('employee_payroll_code', payrollId)
        })
        .first()

      if (!employee) {
        validationErrors.push(
          `Fila ${rowNumber}: No se encontró empleado con identificador de nómina "${payrollId}".`
        )
        continue
      }

      // Días a omitir
      const daysToSkipRaw = getCellValue(8)
      let daysToSkip = 0
      if (daysToSkipRaw !== '') {
        const daysToSkipParsed = Number(daysToSkipRaw)
        if (!Number.isInteger(daysToSkipParsed) || daysToSkipParsed < 0) {
          validationErrors.push(
            `Fila ${rowNumber} (${payrollId}): La columna "Días a omitir manualmente" debe ser un número entero >= 0. Valor recibido: "${daysToSkipRaw}".`
          )
          continue
        }
        daysToSkip = daysToSkipParsed
      }

      // Razón — obligatoria si hay días a omitir
      const skipReason = getCellValue(9)
      if (daysToSkip > 0 && skipReason === '') {
        validationErrors.push(
          `Fila ${rowNumber} (${payrollId}): Se ingresaron ${daysToSkip} días a omitir pero falta la "Razón de días omitidos".`
        )
        continue
      }

      // Fechas de vacaciones (columnas 10 en adelante)
      // Usamos row.actualCellCount / iteramos las celdas reales de la fila para no depender
      // de ws.columnCount que incluye columnas con solo estilo aplicado (sin valor).
      const vacationDates: DateTime[] = []
      row.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
        if (colNumber < 10) return
        const rawVal = cell.type === ExcelJS.ValueType.Formula ? cell.result : cell.value
        let raw = ''
        if (rawVal instanceof Date) {
          const dt = DateTime.fromJSDate(rawVal)
          raw = dt.isValid ? dt.toFormat('dd/MM/yyyy') : ''
        } else if (rawVal !== null && rawVal !== undefined) {
          raw = String(rawVal).trim()
        }
        // Ignorar celdas vacías o marcadores visuales
        if (raw === '' || raw === '—' || raw === '-') return

        const dt = DateTime.fromFormat(raw, 'dd/MM/yyyy')
        if (!dt.isValid) {
          validationErrors.push(
            `Fila ${rowNumber} (${payrollId}): Fecha inválida en columna ${colNumber}: "${raw}". Use el formato dd/MM/yyyy.`
          )
          return
        }
        vacationDates.push(dt)
      })

      if (vacationDates.length === 0 && daysToSkip === 0) {
        // Fila sin datos operativos → ignorar
        continue
      }

      parsed.push({ rowNumber, employee, daysToSkip, skipReason, vacationDates })
    }

    // Si hay errores de validación, detener todo
    if (validationErrors.length > 0) {
      return {
        status: 422,
        type: 'warning',
        title: 'Errores de validación',
        message: 'No se registró ningún dato. Corrija los errores y vuelva a importar.',
        data: { errors: validationErrors },
      }
    }

    // ── 5. Fase de disponibilidad ──
    // Se permite usar días "a futuro" (más allá del periodo activo) ya que la plantilla
    // los expone como editables con color suave. En ese caso el sistema los asigna al
    // periodo más reciente disponible (o crea la deducción en el periodo más antiguo con
    // capacidad). No se valida límite total aquí; la lógica de persistencia maneja la
    // distribución por periodos.

    // ── 6. Fase de persistencia — ahora sí guardamos ──
    const results = {
      totalRows: parsed.length,
      deductionsCreated: 0,
      vacationsCreated: 0,
      skipped: 0,
      skippedDetails: [] as string[],
    }

    const shiftExceptionService = new ShiftExceptionService(this.i18n)

    for (const { employee, daysToSkip, skipReason, vacationDates } of parsed) {
      const employeeLabel =
        employee.employeePayrollCode ||
        employee.employeePayrollNum ||
        `empleado ${employee.employeeId}`

      // ── 6a. Aplicar omisiones distribuidas del periodo más antiguo al más reciente ──
      if (daysToSkip > 0) {
        const periods = await this.getVacationPeriodsOrdered(employee)
        let remaining = daysToSkip

        for (const period of periods) {
          if (remaining <= 0) break
          const available = period.available
          if (available <= 0) continue

          const toDeduct = Math.min(remaining, available)
          await VacationDeduction.create({
            employeeId: employee.employeeId,
            vacationSettingId: period.vacationSettingId,
            vacationDeductionDays: toDeduct,
            vacationDeductionDescription: skipReason,
          })
          remaining -= toDeduct
          results.deductionsCreated++
        }
      }

      // ── 6b. Registrar días de vacaciones del periodo más antiguo al más reciente ──
      for (const dt of vacationDates) {
        const employeeService2 = new EmployeeService(this.i18n)
        const period = await employeeService2.getOldestAvailableVacationPeriod(employee, dt)

        if (!period) {
          results.skipped++
          results.skippedDetails.push(
            `${employeeLabel}: fecha ${dt.toFormat('dd/MM/yyyy')} omitida — no hay periodo de vacaciones con días disponibles para esa fecha.`
          )
          continue
        }

        const shiftException = {
          shiftExceptionId: 0,
          employeeId: employee.employeeId,
          exceptionTypeId: vacationType.exceptionTypeId,
          shiftExceptionsDate: dt.toJSDate(),
          shiftExceptionsDescription: 'vacation',
          shiftExceptionEnjoymentOfSalary: 1,
          shiftExceptionCheckInTime: null,
          shiftExceptionCheckOutTime: null,
          shiftExceptionTimeByTime: null,
          vacationSettingId: period.vacationSettingId,
          workDisabilityPeriodId: null,
        } as ShiftException

        const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)
        if (verifyInfo.status === 200) {
          await shiftExceptionService.create(shiftException)
          results.vacationsCreated++
        } else {
          results.skipped++
          results.skippedDetails.push(
            `${employeeLabel}: fecha ${dt.toFormat('dd/MM/yyyy')} omitida — ya existe una vacación registrada en esa fecha para el empleado.`
          )
        }
      }
    }

    const hasSkipped = results.skipped > 0
    const allSkipped = results.vacationsCreated === 0 && hasSkipped

    return {
      status: 201,
      type: allSkipped ? 'warning' : hasSkipped ? 'warning' : 'success',
      title: allSkipped
        ? 'Importación sin registros'
        : hasSkipped
          ? 'Importación parcial'
          : 'Importación completada',
      message: allSkipped
        ? 'No se registró ninguna vacación. Revise el detalle de los días omitidos.'
        : hasSkipped
          ? `Se importaron ${results.vacationsCreated} vacaciones; ${results.skipped} días fueron omitidos.`
          : 'Las vacaciones fueron importadas correctamente.',
      data: results,
    }
  }

  /**
   * Retorna la lista de periodos (VacationSetting) del empleado ordenados
   * del más antiguo al más reciente, con los días disponibles de cada uno
   * descontando ShiftExceptions y VacationDeductions activas.
   */
  private async getVacationPeriodsOrdered(
    employee: Employee
  ): Promise<Array<{ vacationSettingId: number; totalDays: number; available: number }>> {
    if (!employee.employeeHireDate) return []

    const start = DateTime.fromISO(employee.employeeHireDate.toString())
    if (!start.isValid) return []

    const currentYear = DateTime.now().year
    const startYear = start.year
    const month = start.month
    const day = start.day

    const result: Array<{ vacationSettingId: number; totalDays: number; available: number }> = []

    for (let checkYear = startYear; checkYear <= currentYear + 1; checkYear++) {
      const yearsPassed = checkYear - startYear

      const checkFormattedDate = DateTime.fromObject({ year: checkYear, month, day }).toFormat('yyyy-MM-dd')

      const vacationSetting = await VacationSetting.query()
        .whereNull('vacation_setting_deleted_at')
        .where('vacation_setting_years_of_service', yearsPassed)
        .where('vacation_setting_apply_since', '<=', checkFormattedDate)
        .orderBy('vacation_setting_years_of_service', 'desc')
        .first()

      if (!vacationSetting) continue

      // Evitar duplicados (mismo vacationSettingId puede aparecer si empleado tiene mismo rango de años)
      if (result.find((r) => r.vacationSettingId === vacationSetting.vacationSettingId)) continue

      const exceptionsUsed = await ShiftException.query()
        .whereNull('shift_exceptions_deleted_at')
        .where('vacation_setting_id', vacationSetting.vacationSettingId)
        .where('employee_id', employee.employeeId)

      const deductions = await VacationDeduction.query()
        .whereNull('vacation_deduction_deleted_at')
        .where('vacation_setting_id', vacationSetting.vacationSettingId)
        .where('employee_id', employee.employeeId)

      const daysUsedByExceptions = exceptionsUsed.length
      const daysUsedByDeductions = deductions.reduce((acc, d) => acc + d.vacationDeductionDays, 0)
      const available =
        vacationSetting.vacationSettingVacationDays - daysUsedByExceptions - daysUsedByDeductions

      result.push({
        vacationSettingId: vacationSetting.vacationSettingId,
        totalDays: vacationSetting.vacationSettingVacationDays,
        available: Math.max(available, 0),
      })
    }

    return result
  }
}
