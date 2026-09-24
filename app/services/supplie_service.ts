import db from '@adonisjs/lucid/services/db'
import Supplie from '#models/supplie'
import SupplyType from '#models/supply_type'
import SupplyValueHistory from '#models/supply_value_history'
import EmployeeSupplie from '#models/employee_supplie'
import ExcelJS from 'exceljs'
import { REPORT_NEUTRAL_ARGB } from '#constants/report_neutral_theme'
import { DateTime } from 'luxon'
import { SupplieFilterSearchInterface } from '../interfaces/supplie_filter_search_interface.js'
import {
  ACQUISITION_VALUE_HISTORY_NOTE,
  type AssetDeactivationStatus,
  type AssetStatus,
} from '#modules/assets/assets.constants'
import {
  assertAssetWithoutActiveAssignment,
  assertFileNumberAvailable,
  closeActiveAssignments,
} from '#modules/assets/assets.rules'

interface SupplyCreateInput {
  supplyFileNumber: string
  supplyName: string
  supplySerialNumber?: string | null
  supplyDescription?: string
  supplyTypeId: number
  supplyStatus?: AssetStatus
  supplyAcquisitionDate?: string | null
  supplyAcquisitionValue?: number | null
}

type SupplyUpdateInput = Partial<SupplyCreateInput>

interface SupplyDeactivationInput {
  supplyStatus?: AssetDeactivationStatus
  supplyDeactivationReason: string
  supplyDeactivationDate?: string
}

export default class SupplieService {
  /**
   * Get all supplies with pagination and filters
   */
  static async getAll(filters: SupplieFilterSearchInterface) {
    const page = filters.page || 1
    const limit = filters.limit || 10

    const query = Supplie.query()

    if (filters.includeDeleted) {
      // incluir eliminados lógicamente
      // @ts-ignore provided by adonis-lucid-soft-deletes
      query.withTrashed()
    }

    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('supplyName', `%${filters.search}%`)
          .orWhereILike('supplyDescription', `%${filters.search}%`)
          .orWhereILike('supplyFileNumber', `%${filters.search}%`)
          .orWhereILike('supplySerialNumber', `%${filters.search}%`)
      })
    }

    if (filters.supplyTypeId) {
      query.where('supplyTypeId', filters.supplyTypeId)
    }

    if (filters.supplyName) {
      query.whereILike('supplyName', `%${filters.supplyName}%`)
    }

    if (filters.supplyStatus) {
      query.where('supplyStatus', filters.supplyStatus)
    }

    if (filters.supplyFileNumber) {
      query.where('supplyFileNumber', filters.supplyFileNumber)
    }

    return await query.paginate(page, limit)
  }

  /**
   * Get supply by ID
   */
  static async getById(id: number) {
    return await Supplie.findOrFail(id)
  }

  /**
   * Alta de un activo. El folio es único por empresa (la del tipo, que es la
   * que el modelo le asigna). Con valor de adquisición, el historial nace con
   * su primer registro ("Valor de adquisición"), en la misma transacción.
   *
   * @throws AssetError 409 `folio-de-activo-duplicado`.
   */
  static async create(data: SupplyCreateInput) {
    const supplyType = await SupplyType.findOrFail(data.supplyTypeId)
    await assertFileNumberAvailable(supplyType.businessUnitId, data.supplyFileNumber)

    return db.transaction(async (trx) => {
      const supply = new Supplie()
      supply.useTransaction(trx)
      supply.businessUnitId = supplyType.businessUnitId
      supply.merge({
        supplyFileNumber: data.supplyFileNumber,
        supplyName: data.supplyName,
        supplySerialNumber: data.supplySerialNumber ?? null,
        supplyDescription: data.supplyDescription ?? null,
        supplyTypeId: data.supplyTypeId,
        supplyStatus: data.supplyStatus ?? 'active',
        supplyAcquisitionDate: data.supplyAcquisitionDate
          ? DateTime.fromISO(data.supplyAcquisitionDate)
          : null,
        supplyAcquisitionValue: data.supplyAcquisitionValue ?? null,
      })
      await supply.save()

      if (data.supplyAcquisitionValue !== null && data.supplyAcquisitionValue !== undefined) {
        // La empresa va explícita: el hook la resolvería consultando el activo
        // fuera de la transacción, donde todavía no existe.
        await SupplyValueHistory.create(
          {
            businessUnitId: supply.businessUnitId,
            supplyId: supply.supplyId,
            supplyValueHistoryCost: data.supplyAcquisitionValue,
            supplyValueHistoryCurrentValue: data.supplyAcquisitionValue,
            supplyValueHistoryNotes: ACQUISITION_VALUE_HISTORY_NOTE,
          },
          { client: trx }
        )
      }
      return supply
    })
  }

  /**
   * Edición de un activo. Volver a `active` (reactivar) limpia el motivo y la
   * fecha de baja.
   *
   * @throws AssetError 409 `folio-de-activo-duplicado`.
   */
  static async update(id: number, data: SupplyUpdateInput) {
    const supply = await Supplie.findOrFail(id)

    if (data.supplyFileNumber !== undefined && data.supplyFileNumber !== supply.supplyFileNumber) {
      await assertFileNumberAvailable(supply.businessUnitId, data.supplyFileNumber, supply.supplyId)
    }

    const { supplyAcquisitionDate, ...rest } = data
    supply.merge(rest)
    if (supplyAcquisitionDate !== undefined) {
      supply.supplyAcquisitionDate = supplyAcquisitionDate
        ? DateTime.fromISO(supplyAcquisitionDate)
        : null
    }
    if (data.supplyStatus === 'active') {
      supply.supplyDeactivationReason = null
      supply.supplyDeactivationDate = null
    }
    await supply.save()

    return supply
  }

  /**
   * Borrado lógico. Un activo en resguardo no se borra.
   *
   * @throws AssetError 409 `activo-con-resguardo-activo`.
   */
  static async delete(id: number) {
    const supply = await Supplie.findOrFail(id)
    await assertAssetWithoutActiveAssignment(supply.supplyId)
    await supply.delete()
    return supply
  }

  /**
   * Baja del activo: pasa al estado destino (`inactive` por omisión, `lost` o
   * `damaged`) con motivo y fecha, y cierra su resguardo activo (lo pasa a
   * `retired` con el mismo motivo y fecha), todo en una transacción.
   */
  static async deactivate(id: number, data: SupplyDeactivationInput) {
    const supply = await Supplie.findOrFail(id)
    const date = data.supplyDeactivationDate
      ? DateTime.fromISO(data.supplyDeactivationDate)
      : DateTime.now()

    return db.transaction(async (trx) => {
      supply.useTransaction(trx)
      supply.supplyStatus = data.supplyStatus ?? 'inactive'
      supply.supplyDeactivationReason = data.supplyDeactivationReason
      supply.supplyDeactivationDate = date
      await supply.save()

      const closedAssignments = await closeActiveAssignments(
        supply.supplyId,
        data.supplyDeactivationReason,
        date,
        trx
      )
      return { supply, closedAssignments }
    })
  }

  /**
   * Get supply with its type
   */
  static async getWithType(id: number) {
    return await Supplie.query()
      .where('supplyId', id)
      .preload('supplyType')
      .firstOrFail()
  }

  /**
   * Get supplies by type
   */
  static async getByType(supplyTypeId: number) {
    return await Supplie.query()
      .where('supplyTypeId', supplyTypeId)
      .where('supplyStatus', 'active')
  }

  /**
   * Generate Excel report of supplies with assignments
   */
  static async getExcelReport() {
    try {
      // Get all supplies with their assignments
      const supplies = await Supplie.query()
        .preload('supplyType')
        .orderBy('supplyFileNumber', 'asc')

      // Get all employee supplies with relations
      const employeeSupplies = await EmployeeSupplie.query()
        .preload('employee', (employeeQuery) => {
          employeeQuery.preload('person')
          employeeQuery.preload('department')
          employeeQuery.preload('position')
        })
        .preload('supply')
        .orderBy('employeeSupplyCreatedAt', 'desc')

      // Formato neutral (report_neutral_theme): sin logo ni colores de la
      // empresa, así que el reporte ya no consulta la configuración del sistema.
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Supplies Report')

      // Fila 1: título en negro, sin relleno
      const titleRow = worksheet.addRow(['Supplies and Assignments Report'])
      titleRow.font = { bold: true, size: 24, color: { argb: REPORT_NEUTRAL_ARGB.text } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A1:M1')

      // Fila 2: fecha de generación en texto secundario
      const currentDate = DateTime.now().toFormat('DDDD')
      const periodRow = worksheet.addRow([`Generated on: ${currentDate}`])
      periodRow.font = { size: 15, color: { argb: REPORT_NEUTRAL_ARGB.textMuted } }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A2:M2')

      // Headers
      SupplieService.addHeadRow(worksheet)

      // Add data rows
      await SupplieService.addDataRows(supplies, employeeSupplies, worksheet)

      // Generate buffer
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
   * Add header row
   */
private static addHeadRow(worksheet: ExcelJS.Worksheet) {
  const headers = [
    'File Number',
    'Supply Name',
    'Supply Type',
    'Supply Status',
    'Employee ID',
    'Employee Name',
    'Department',
    'Position',
    'Assignment Status',
    'Assignment Date',
    'Expiration Date',
    'Retirement Date',
    'Retirement Reason',
  ]

  const headerRow = worksheet.addRow(headers)

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: REPORT_NEUTRAL_ARGB.headerFill },
    }
    cell.font = {
      bold: true,
      color: { argb: REPORT_NEUTRAL_ARGB.text },
      size: 12,
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
  })

  headerRow.height = 30

  const widths = [15, 40, 25, 15, 15, 45, 30, 30, 20, 25, 25, 25, 40]
  widths.forEach((w, i) => (worksheet.getColumn(i + 1).width = w))

  worksheet.views = [
    {
      state: 'frozen',
      ySplit: headerRow.number, // Congela hasta la fila del header
      topLeftCell: 'A1',
      activeCell: 'A1',
    },
  ]
}


  /**
   * Add data rows
   */
  private static async addDataRows(
    supplies: Supplie[],
    employeeSupplies: EmployeeSupplie[],
    worksheet: ExcelJS.Worksheet
  ) {
    // Primera fila de datos: justo debajo del encabezado de columnas
    let rowCount = worksheet.rowCount + 1

    // Group supplies and sort them
    const suppliesWithAssignments = supplies.map((supply) => {
      const assignments = employeeSupplies
        .filter((es) => es.supplyId === supply.supplyId)
        .sort((a, b) => {
          // Sort by assignment date (most recent first)
          const dateA = a.employeeSupplyCreatedAt
            ? a.employeeSupplyCreatedAt.toMillis()
            : 0
          const dateB = b.employeeSupplyCreatedAt
            ? b.employeeSupplyCreatedAt.toMillis()
            : 0
          return dateB - dateA
        })

      return { supply, assignments }
    })

    // Sort supplies by their name for consistent grouping
    suppliesWithAssignments.sort((a, b) => {
      const nameA = a.supply.supplyName || ''
      const nameB = b.supply.supplyName || ''
      return nameA.localeCompare(nameB)
    })

    for (const { supply, assignments } of suppliesWithAssignments) {
      if (assignments.length > 0) {
        // Supply has assignments - group by supply and show sorted assignments
        for (const assignment of assignments) {
          const employee = assignment.employee
          const person = employee?.person

          const employeeName = person
            ? `${person.personFirstname || ''} ${person.personLastname || ''} ${person.personSecondLastname || ''}`.trim()
            : 'N/A'

          // Get department name
          let departmentName = 'N/A'
          if (employee?.department) {
            departmentName = employee.department.departmentAlias || employee.department.departmentName || 'N/A'
          }

          // Get position name
          let positionName = 'N/A'
          if (employee?.position) {
            positionName = employee.position.positionAlias || employee.position.positionName || 'N/A'
          }

          worksheet.addRow([
            supply.supplyFileNumber,
            supply.supplyName,
            supply.supplyType?.supplyTypeName || 'N/A',
            supply.supplyStatus,
            employee?.employeeCode || 'N/A',
            employeeName,
            departmentName,
            positionName,
            assignment.employeeSupplyStatus,
            assignment.employeeSupplyCreatedAt
              ? DateTime.fromJSDate(assignment.employeeSupplyCreatedAt.toJSDate())
                  .setZone('UTC-6')
                  .toFormat('MMM d, yyyy, h:mm:ss a')
              : '',
            assignment.employeeSupplyExpirationDate
              ? DateTime.fromJSDate(assignment.employeeSupplyExpirationDate.toJSDate())
                  .setZone('UTC-6')
                  .toFormat('MMM d, yyyy, h:mm:ss a')
              : '',
            assignment.employeeSupplyRetirementDate
              ? DateTime.fromJSDate(assignment.employeeSupplyRetirementDate.toJSDate())
                  .setZone('UTC-6')
                  .toFormat('MMM d, yyyy, h:mm:ss a')
              : '',
            assignment.employeeSupplyRetirementReason || '',
          ])

          // Color status cells (now in column I instead of G)
          SupplieService.paintStatus(worksheet, rowCount, assignment.employeeSupplyStatus)

          rowCount++
        }
      } else {
        // Supply has no assignments
        worksheet.addRow([
          supply.supplyFileNumber,
          supply.supplyName,
          supply.supplyType?.supplyTypeName || 'N/A',
          supply.supplyStatus,
          '',
          'Not Assigned',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ])

        // Color unassigned row
        SupplieService.paintUnassigned(worksheet, rowCount)

        rowCount++
      }
    }
  }

  /**
   * Paint status cell
   */
  private static paintStatus(worksheet: ExcelJS.Worksheet, row: number, status: string) {
    // Colores de estatus: semánticos, no de marca; se conservan
    let color = REPORT_NEUTRAL_ARGB.background as string
    let fgColor = REPORT_NEUTRAL_ARGB.text as string

    if (status === 'active') {
      color = 'C6EFCE'
      fgColor = '006100'
    } else if (status === 'retired') {
      color = 'FFC7CE'
      fgColor = '9C0006'
    } else if (status === 'shipping') {
      color = 'FFEB9C'
      fgColor = '9C6500'
    }

    // Status is now in column I (9th column)
    const cell = worksheet.getCell('I' + row)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    }
    cell.font = { color: { argb: fgColor }, bold: true }
  }

  /**
   * Paint unassigned row
   */
  private static paintUnassigned(worksheet: ExcelJS.Worksheet, row: number) {
    const color = 'E4E4E4'
    const fgColor = '000000'

    // Now we have 13 columns
    for (let col = 1; col <= 13; col++) {
      const cell = worksheet.getCell(row, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
      cell.font = { color: { argb: fgColor }, italic: true }
    }
  }
}
