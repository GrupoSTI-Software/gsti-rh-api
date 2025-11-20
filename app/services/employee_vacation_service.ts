import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import Employee from '#models/employee'
import { EmployeeVacationExcelFilterInterface } from '../interfaces/employee_vacation_excel_filter_interface.js'
import EmployeeService from './employee_service.js'
import { EmployeeVacationExcelRowInterface } from '../interfaces/employee_vacation_excel_row_interface.js'
import Env from '#start/env'
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

export default class EmployeeVacationService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }
  async getExcelAll(filters: EmployeeVacationExcelFilterInterface) {
    try {
      const businessConf = `${Env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
      const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
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
        .whereIn('business_unit_id', businessUnitsList)
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
      const businessConf = `${Env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
      const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
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
        .whereIn('business_unit_id', businessUnitsList)
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
      const businessConf = `${Env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
      const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
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
        .whereIn('business_unit_id', businessUnitsList)
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
}
