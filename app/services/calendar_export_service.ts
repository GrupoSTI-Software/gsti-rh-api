import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import { I18n } from '@adonisjs/i18n'
import Employee from '#models/employee'
import Holiday from '#models/holiday'
import {
  CALENDAR_EXPORT_COLUMN_MAX_WIDTH,
  CALENDAR_EXPORT_COLUMN_MIN_WIDTH,
  CALENDAR_EXPORT_DATE_FORMAT,
  CALENDAR_EXPORT_HEADER_FILL,
} from '#constants/calendar_export'

type CellValue = string | number

interface SheetSpec {
  title: string
  headers: string[]
  rows: CellValue[][]
}

/**
 * Arma los Excel del calendario unificado: festividades, cumpleaños y
 * aniversarios laborales del año consultado.
 *
 * Solo transforma: recibe los modelos ya filtrados y acotados por empresa
 * desde los servicios que existen, y devuelve el binario. Así los reportes
 * muestran exactamente lo mismo que el calendario en pantalla.
 */
export default class CalendarExportService {
  private readonly t: (key: string, data?: Record<string, unknown>) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /**
   * Festividades del año, una por fila, con su tipo (descanso oficial o
   * conmemorativa) resuelto a texto.
   */
  async holidays(holidays: Holiday[], year: number): Promise<Buffer> {
    const rows = holidays.map((holiday) => [
      this.formatDate(holiday.holidayDate),
      holiday.holidayName,
      holiday.holidayIsOfficialRestDay
        ? this.t('calendar_export_official_rest_day')
        : this.t('calendar_export_commemorative'),
    ])
    return this.build({
      title: `${year} ${this.t('calendar_export_holidays_sheet')}`,
      headers: [
        this.t('calendar_export_date'),
        this.t('calendar_export_holiday'),
        this.t('calendar_export_type'),
      ],
      rows,
    })
  }

  /**
   * Cumpleaños del año ordenados por fecha; la fecha se proyecta al año
   * consultado y el 29 de febrero cae al 28 en años no bisiestos, igual que
   * en el calendario.
   */
  async birthdays(employees: Employee[], year: number): Promise<Buffer> {
    const rows = employees
      .flatMap((employee) => {
        const birthday = employee.person?.personBirthday
        if (!birthday) return []
        const date = this.projectToYear(birthday, year)
        if (!date) return []
        return [[date, ...this.employeeCells(employee)]]
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    return this.build({
      title: `${year} ${this.t('calendar_export_birthdays_sheet')}`,
      headers: [this.t('calendar_export_date'), ...this.employeeHeaders()],
      rows,
    })
  }

  /**
   * Aniversarios laborales del año con los años cumplidos; solo entra quien
   * ingresó antes del año consultado, criterio que ya aplica el listado.
   */
  async anniversaries(employees: Employee[], year: number): Promise<Buffer> {
    const rows = employees
      .flatMap((employee) => {
        const hireDate = employee.employeeHireDate
        if (!hireDate) return []
        const hired = DateTime.fromISO(String(hireDate), { zone: 'utc' })
        if (!hired.isValid || hired.year >= year) return []
        const date = this.projectToYear(String(hireDate), year)
        if (!date) return []
        return [[date, ...this.employeeCells(employee), year - hired.year, hired.toFormat(CALENDAR_EXPORT_DATE_FORMAT)]]
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    return this.build({
      title: `${year} ${this.t('calendar_export_anniversaries_sheet')}`,
      headers: [
        this.t('calendar_export_date'),
        ...this.employeeHeaders(),
        this.t('calendar_export_years'),
        this.t('calendar_export_hire_date'),
      ],
      rows,
    })
  }

  private employeeHeaders(): string[] {
    return [
      this.t('calendar_export_payroll_code'),
      this.t('calendar_export_employee'),
      this.t('calendar_export_department'),
      this.t('calendar_export_position'),
    ]
  }

  private employeeCells(employee: Employee): CellValue[] {
    const person = employee.person
    const fullName = person
      ? [person.personFirstname, person.personLastname, person.personSecondLastname]
          .filter((part) => Boolean(part))
          .join(' ')
      : `${employee.employeeFirstName ?? ''} ${employee.employeeLastName ?? ''}`.trim()
    return [
      employee.employeePayrollCode ?? '',
      fullName,
      employee.department?.departmentName ?? '',
      employee.position?.positionName ?? '',
    ]
  }

  private formatDate(value: string | Date | DateTime | null | undefined): string {
    if (!value) return ''
    const parsed =
      value instanceof DateTime
        ? value
        : value instanceof Date
          ? DateTime.fromJSDate(value, { zone: 'utc' })
          : DateTime.fromISO(String(value), { zone: 'utc' })
    return parsed.isValid ? parsed.toFormat(CALENDAR_EXPORT_DATE_FORMAT) : ''
  }

  /** Misma fecha (mes y día) llevada al año pedido; `null` si no se puede leer. */
  private projectToYear(value: string | Date, year: number): string | null {
    const base =
      value instanceof Date
        ? DateTime.fromJSDate(value, { zone: 'utc' })
        : DateTime.fromISO(String(value), { zone: 'utc' })
    if (!base.isValid) return null
    const target = DateTime.utc(year, base.month, 1)
    const day = Math.min(base.day, target.daysInMonth ?? base.day)
    return target.set({ day }).toFormat(CALENDAR_EXPORT_DATE_FORMAT)
  }

  private async build(spec: SheetSpec): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(spec.title.slice(0, 31))
    const header = sheet.addRow(spec.headers)
    header.font = { bold: true }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CALENDAR_EXPORT_HEADER_FILL } }
    spec.rows.forEach((row) => sheet.addRow(row))
    sheet.columns.forEach((column, index) => {
      const longest = Math.max(
        spec.headers[index]?.length ?? 0,
        ...spec.rows.map((row) => String(row[index] ?? '').length)
      )
      column.width = Math.min(
        CALENDAR_EXPORT_COLUMN_MAX_WIDTH,
        Math.max(CALENDAR_EXPORT_COLUMN_MIN_WIDTH, longest + 2)
      )
    })
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }
}
