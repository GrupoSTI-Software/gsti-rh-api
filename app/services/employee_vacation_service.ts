import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import Employee from '#models/employee'
import { EmployeeVacationExcelFilterInterface } from '../interfaces/employee_vacation_excel_filter_interface.js'
import EmployeeService from './employee_service.js'
import { EmployeeVacationExcelRowInterface } from '../interfaces/employee_vacation_excel_row_interface.js'
import BusinessUnit from '#models/business_unit'
import { EmployeeVacationUsedDaysExcelRowInterface } from '../interfaces/employee_vacation_used_days_excel_row_interface.js'
import ShiftException from '#models/shift_exception'
import { AssistExcelImageInterface } from '../interfaces/assist_excel_image_interface.js'
import axios from 'axios'
import env from '#start/env'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import sharp from 'sharp'
import { EmployeeVacationExcelRowSummaryInterface } from '../interfaces/employee_vacation_excel_row_summary_interface.js'
import { EmployeeVacationExcelRowSummaryYearInterface } from '../interfaces/employee_vacation_excel_row_summary_year_interface.js'
import { I18n } from '@adonisjs/i18n'
import ExceptionType from '#models/exception_type'
import ShiftExceptionService from './shift_exception_service.js'
import VacationSetting from '#models/vacation_setting'
import VacationDeduction from '#models/vacation_deduction'

export default class EmployeeVacationService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
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
              .orWhereHas('person', (personQuery) => {
                personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
              })
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
    let fgColor = 'FFFFFFF'
    let color = '4EA72E'
    const headers = [
      'ID',
      'Employee',
      'Department',
      'Position',
      'Hire Date',
      'Employer Company',
      'Years',
      'Vac.',
      'Used',
      'Rest.',
    ]
    for (let i = 1; i <= 15; i++) {
      headers.push(`Date ${i}`)
    }
    // Agregar los encabezados al worksheet
    const headerRow = worksheet.addRow(headers)
    color = '156082'
    for (let col = 1; col <= 25; col++) {
      const cell = worksheet.getCell(1, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    headerRow.height = 24
    headerRow.font = { bold: true, color: { argb: fgColor } }
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

  getDate(date: string) {
    return DateTime.fromISO(date).toFormat('yyyy-MM-dd')
  }

  getDateFromHttp(date: string) {
    const dateObject = new Date(date)
    return DateTime.fromJSDate(dateObject).toFormat('yyyy-MM-dd')
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
              .orWhereHas('person', (personQuery) => {
                personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
              })
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
        const sheet = workbook.addWorksheet(`${year} Vacations used`)
        await this.addVacationUsedHeadRow(sheet, workbook)
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
      const dateA = new Date(a.date)
      const dateB = new Date(b.date)

      if (dateA < dateB) return -1
      if (dateA > dateB) return 1

      if (a.employeeCode < b.employeeCode) return -1
      if (a.employeeCode > b.employeeCode) return 1

      return 0
    })
    const fillColors = ['9FC5E8', 'CFE2F3']

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

  async addImageLogo(assistExcelImageInterface: AssistExcelImageInterface) {
    const imageLogo = await this.getLogo()
    const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
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
    }

    const imageId = assistExcelImageInterface.workbook.addImage({
      buffer: imageBuffer,
      extension: 'png',
    })

    assistExcelImageInterface.worksheet.addImage(imageId, {
      tl: { col: assistExcelImageInterface.col, row: assistExcelImageInterface.row },
      ext: { width: adjustedWidth, height: adjustedHeight },
    })
  }

  async addVacationUsedHeadRow(worksheet: ExcelJS.Worksheet, workbook:  ExcelJS.Workbook) {
    const assistExcelImageInterface = {
      workbook: workbook,
      worksheet: worksheet,
      col: 0.28,
      row: 0.7,
    } as AssistExcelImageInterface
    await this.addImageLogo(assistExcelImageInterface)
    worksheet.getRow(1).height = 60
    worksheet.mergeCells('A1:E1')
    let fgColor = 'FFFFFFF'
    let color = '4EA72E'
    const headers = [
      'Date',
      'ID',
      'Employee',
      'Department',
      'Position',
    ]

    // Agregar los encabezados al worksheet
    const headerRow = worksheet.addRow(headers)
    color = '156082'
    for (let col = 1; col <= 5; col++) {
      const cell = worksheet.getCell(2, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    headerRow.height = 24
    headerRow.font = { bold: true, color: { argb: fgColor } }
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
      { state: 'frozen', ySplit: 1 }, // Fija la primera fila
      { state: 'frozen', ySplit: 2 }, // Fija la segunda fila
    ]
    const row = worksheet.getRow(1)
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  }

  paintVacationUsedBorderAll(worksheet: ExcelJS.Worksheet, rowCount: number) {
    for (let rowIndex = 1; rowIndex <= rowCount + 2; rowIndex++) {
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
              .orWhereHas('person', (personQuery) => {
                personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
              })
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
      const title = `Vacations Control Summary, ${start.toFormat('DDD')} to ${end.toFormat('DDD')}`
      const sheet = workbook.addWorksheet('Vacations Control Summary')
      await this.addHeadRowSummary(workbook, sheet, title, years)
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

  async addHeadRowSummary(workbook: ExcelJS.Workbook ,worksheet: ExcelJS.Worksheet, title: string, years: number[]) {
    let fgColor = 'FFFFFFF'
    const imageLogo = await this.getLogo()
    const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
    const imageBuffer = imageResponse.data
    const imageId = workbook.addImage({
      buffer: imageBuffer,
      extension: 'png',
    })
    worksheet.addImage(imageId, {
      tl: { col: 0.4, row: 0.5 },
      ext: { width: 173, height: 64 },
    })
    worksheet.getRow(1).height = 64
    worksheet.addRow([])
    worksheet.mergeCells('A1:B1')
    worksheet.getCell('C1').value = title
    worksheet.mergeCells('C1:E1')
    worksheet.getCell('C1').font = { size: 16 ,bold: true, color: { argb: '000000'} } // texto negro
    worksheet.getCell('C1').alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.addRow([])
    let cell = null
    let color = '4EA72E'
    const headers = [
      'ID',
      'Employee',
      'Department',
      'Position',
      'Hire Date',
    ]

    // Agregar los encabezados al worksheet
    const headerRow = worksheet.addRow(headers)
    color = '156082'
    for (let col = 1; col <= 5; col++) {
      cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }
    headerRow.font = { bold: true, color: { argb: fgColor } }

    const labels = ['Years', 'Vac', 'Used', 'Rest', 'Acc. Disp.']
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
      cell.font = { bold: true, color: { argb: 'FFFFFF' } }

      color = '156082'
      for (let col = startColIndex; col <= startColIndex + 4; col++) {
        cell = worksheet.getCell(3, col)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        }
        cell = worksheet.getCell(4, col)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color },
        }
      }
      const labelsRow = 4
      for (const [i, label] of labels.entries()) {
        const colLetter = worksheet.getColumn(startColIndex + i).letter
        const labelCell = worksheet.getCell(`${colLetter}${labelsRow}`)
        labelCell.value = label
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' }
        labelCell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
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
        rowData.employeePayrollCode,
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
        employeeCode: employee.employeePayrollCode?.toString() || '',
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
          ? DateTime.fromISO(cellValue)
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

            if ((j === 3 || j === 4) && rowIndex > 4) {
              let bgColor = 'F2F2F2'
              let color = '969696'
              if (typeof cellYear.value === 'number' && cellYear.value > 0) {
                bgColor = 'ECF1E0'
                color = '50AE5D'
                if (j === 3 ) {
                  if (!canUseDays) {
                    bgColor = 'FAEADB'
                    color = 'D3722D'
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
   * Diseño alineado con generateShiftAssignmentTemplate:
   *  - Logo + color corporativo en encabezados
   *  - Columnas fijas (1–9): identificador nómina, nombre, departamento, puesto,
   *    unidad de negocio, unidad de nómina, sucursal, días a omitir, razón
   *  - Columnas de días (10+): tantas como el máximo de días posibles según
   *    el VacationSetting más alto de todos los empleados
   *  - Por empleado: solo se desbloquean las celdas de días que le corresponden
   *    según sus días disponibles actuales (total − usados − deducciones previas)
   *  - Las celdas bloqueadas (sin días disponibles) aparecen en gris con candado
   */
  async generateVacationImportTemplate(
    filters: EmployeeVacationExcelFilterInterface,
    allowedBusinessUnitIds: number[] = []
  ): Promise<{ status: number; buffer?: Buffer; type?: string; title?: string; message?: string; error?: string }> {
    try {
      // ── Obtener color corporativo y logo (igual que generateShiftAssignmentTemplate) ──
      const systemSettingService = new SystemSettingService()
      const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
      let headerColor = 'FFD6FFDC'
      let imageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
      if (systemSettingActive) {
        if (systemSettingActive.systemSettingLogo) {
          imageLogo = systemSettingActive.systemSettingLogo
        }
        if (systemSettingActive.systemSettingSidebarColor) {
          let c = systemSettingActive.systemSettingSidebarColor.replace('#', '').toUpperCase()
          headerColor = c.length === 6 ? 'FF' + c : c
        }
      }

      // Calcular luminosidad para decidir color de texto sobre el header
      const hexOnly = headerColor.length === 8 ? headerColor.substring(2) : headerColor
      const redChannel = Number.parseInt(hexOnly.substring(0, 2), 16)
      const greenChannel = Number.parseInt(hexOnly.substring(2, 4), 16)
      const blueChannel = Number.parseInt(hexOnly.substring(4, 6), 16)
      const luminosity = 0.299 * redChannel + 0.587 * greenChannel + 0.114 * blueChannel
      const headerTextColor = luminosity < 128 ? 'FFFFFFFF' : 'FF001A04'

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

      // ── Agregar logo (igual que shift template) ──
      try {
        const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
        const imageBuffer = imageResponse.data
        const metadata = await sharp(imageBuffer).metadata()
        const iw = metadata.width ?? 1
        const ih = metadata.height ?? 1
        const scale = Math.min(139 / iw, 49 / ih)
        const imageId = workbook.addImage({ buffer: imageBuffer, extension: 'png' })
        ws.addImage(imageId, {
          tl: { col: 0.28, row: 0.7 },
          ext: { width: iw * scale, height: ih * scale },
        })
      } catch {
        // Logo opcional; no bloquea la generación
      }

      // ── Fila 1: logo placeholder (altura 60, igual que shift template) ──
      ws.getRow(1).height = 60

      // ── Fila 2: título ──
      const totalColCount = 9 + maxVacationCols
      const lastColLetter = this.colIndexToLetter(totalColCount)
      ws.mergeCells(`A2:${lastColLetter}2`)
      const titleRow = ws.getRow(2)
      titleRow.height = 28
      const titleCell = ws.getCell('A2')
      titleCell.value = 'PLANTILLA DE IMPORTACIÓN DE VACACIONES'
      titleCell.font = { bold: true, size: 14, color: { argb: headerTextColor } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } }
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
        cell.font = { bold: true, size: 9, color: { argb: headerTextColor } }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: idx < 9 ? headerColor : 'FF4472C4' },
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
          cell.font = { italic: true, size: 8, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } }
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

      // ── Fills de datos ──
      const FILL_EVEN: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      const FILL_ODD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      const FILL_INFO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      const FILL_EDITABLE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F2E3' } }
      // Zona 1 — días disponibles: siempre blanco (sin mezcla con gris)
      const FILL_AVAILABLE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      // Zona 2 — días a futuro / dentro del periodo pero ya consumidos: gris oscuro
      const FILL_FUTURE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6D6D6' } }
      // Zona 3 — fuera del periodo actual: azul claro
      const FILL_USED: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4FB' } }

      const BORDER_THIN = (color = 'FFD0D0D0') => ({
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

        // Columnas informativas (1–7): solo lectura visualmente.
        // Solo col 2 (nombre) queda bloqueada para el scroll; las demás son informativas pero no bloqueadas en protección.
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
          cell.font = { size: 9, color: { argb: 'FF1F3864' } }
          cell.alignment = { vertical: 'middle', horizontal: colIdx === 0 ? 'center' : 'left', wrapText: true }
          cell.border = BORDER_THIN()
          // Solo bloqueamos la col 2 (nombre); el resto queda libre para no interferir con el scroll
          cell.protection = { locked: colIdx === 1 }
        })

        // Col 8: Días a omitir (editable)
        const cellSkip = dataRow.getCell(8)
        cellSkip.value = ''
        cellSkip.fill = FILL_EDITABLE
        cellSkip.font = { size: 9 }
        cellSkip.alignment = { vertical: 'middle', horizontal: 'center' }
        cellSkip.border = BORDER_THIN('FF00A800')
        cellSkip.protection = { locked: false }

        // Col 9: Razón (editable)
        const cellReason = dataRow.getCell(9)
        cellReason.value = ''
        cellReason.fill = FILL_EDITABLE
        cellReason.font = { size: 9 }
        cellReason.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        cellReason.border = BORDER_THIN('FF00A800')
        cellReason.protection = { locked: false }

        // Columnas de días (10 en adelante) — tres zonas visuales, todas editables:
        //   [1..availableDays]       → blanco/gris alterno normal  (días disponibles netos)
        //   [availableDays+1..totalDays] → azul muy suave          (días "a futuro", no desbloqueados aún)
        //   [totalDays+1..maxVacationCols] → gris oscuro           (días ya usados u omitidos o fuera de periodo)
        for (let d = 1; d <= maxVacationCols; d++) {
          const cell = dataRow.getCell(9 + d)
          cell.value = ''
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.protection = { locked: false }

          if (d <= info.availableDays) {
            // Zona 1: días disponibles netos — siempre blanco
            cell.fill = FILL_AVAILABLE
            cell.font = { size: 9, color: { argb: 'FF000000' } }
            cell.border = BORDER_THIN()
          } else if (d <= info.totalDays) {
            // Zona 2: días a futuro / dentro del periodo pero ya consumidos — gris oscuro
            cell.fill = FILL_FUTURE
            cell.font = { size: 9, color: { argb: 'FF888888' } }
            cell.border = BORDER_THIN('FFAAAAAA')
          } else {
            // Zona 3: fuera del periodo actual — azul claro
            cell.fill = FILL_USED
            cell.font = { size: 9, color: { argb: 'FF5B9BD5' } }
            cell.border = BORDER_THIN('FFADD8E6')
          }
        }
      })

      // ── Proteger hoja: solo celdas marcadas como locked=false son editables ──
      await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
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
        ['9. Los días a futuro (fondo azul muy suave) corresponden a días dentro del periodo', false],
        ['   del empleado que ya fueron consumidos. Si los utiliza, se asignarán al periodo', false],
        ['   vigente más próximo disponible.', false],
        ['', false],
        ['COLORES DE REFERENCIA', true],
        ['Fondo azul claro (columnas 2–7): información de solo lectura.', false],
        ['Fondo verde claro (columnas 8–9): campos editables.', false],
        ['Fondo blanco (columnas 10+): días disponibles netos para ingresar fecha.', false],
        ['Fondo gris oscuro: días a futuro (dentro del periodo, ya consumidos). Editables.', false],
        ['Fondo azul claro: días fuera del periodo actual. Editables para asignaciones futuras.', false],
      ]
      instrLines.forEach(([text, isBold]) => {
        const row = wsInstr.addRow([text])
        row.getCell(1).font = {
          bold: isBold,
          size: isBold ? 12 : 10,
          color: { argb: isBold ? 'FF1F3864' : 'FF000000' },
        }
        row.height = isBold ? 22 : 16
      })
      wsInstr.getColumn(1).width = 95

      const buffer = await workbook.xlsx.writeBuffer()
      return { status: 201, buffer: Buffer.from(buffer) }
    } catch (error: any) {
      return {
        status: 500,
        type: 'error',
        title: 'Error al generar template',
        message: 'Ocurrió un error al generar la plantilla de vacaciones',
        error: error.message,
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
  async importVacationFromExcel(file: any): Promise<{
    status: number
    type: string
    title: string
    message: string
    data?: any
    error?: string
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
    // Estructura de la plantilla: fila 1 = logo, fila 2 = título, fila 3 = encabezados, fila 4 = sub-encabezado
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

      // Buscar empleado por identificador de nómina
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
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
    }

    const shiftExceptionService = new ShiftExceptionService(this.i18n)

    for (const { employee, daysToSkip, skipReason, vacationDates } of parsed) {
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
        }
      }
    }

    return {
      status: 201,
      type: 'success',
      title: 'Importación completada',
      message: 'Las vacaciones fueron importadas correctamente.',
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
