import Supplie from '#models/supplie'
import EmployeeSupplie from '#models/employee_supplie'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import ExcelJS from 'exceljs'
import axios from 'axios'
import sharp from 'sharp'
import env from '#start/env'
import { DateTime } from 'luxon'
import { SupplieFilterSearchInterface } from '../interfaces/supplie_filter_search_interface.js'

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
          .orWhere('supplyFileNumber', filters.search as unknown as number)
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
   * Create new supply
   */
  static async create(data: {
    supplyFileNumber: number
    supplyName: string
    supplyDescription?: string
    supplyTypeId: number
    supplyStatus?: 'active' | 'inactive' | 'lost' | 'damaged'
  }) {
    // Check if file number already exists
    const existingSupply = await Supplie.query()
      .where('supplyFileNumber', data.supplyFileNumber)
      .first()

    if (existingSupply) {
      throw new Error('Supply with this file number already exists')
    }

    return await Supplie.create(data)
  }

  /**
   * Update supply
   */
  static async update(id: number, data: {
    supplyFileNumber?: number
    supplyName?: string
    supplyDescription?: string
    supplyTypeId?: number
    supplyStatus?: 'active' | 'inactive' | 'lost' | 'damaged'
  }) {
    const supply = await Supplie.findOrFail(id)

    // Check if file number already exists (excluding current record)
    if (data.supplyFileNumber) {
      const existingSupply = await Supplie.query()
        .where('supplyFileNumber', data.supplyFileNumber)
        .where('supplyId', '!=', id)
        .first()

      if (existingSupply) {
        throw new Error('Supply with this file number already exists')
      }
    }

    supply.merge(data)
    await supply.save()

    return supply
  }

  /**
   * Delete supply (soft delete)
   */
  static async delete(id: number) {
    const supply = await Supplie.findOrFail(id)
    await supply.delete()
    return supply
  }

  /**
   * Deactivate supply with reason
   */
  static async deactivate(id: number, data: {
    supplyDeactivationReason: string
    supplyDeactivationDate?: string
  }) {
    const supply = await Supplie.findOrFail(id)

    supply.supplyStatus = 'inactive'
    supply.supplyDeactivationReason = data.supplyDeactivationReason
    supply.supplyDeactivationDate = data.supplyDeactivationDate
      ? DateTime.fromISO(data.supplyDeactivationDate)
      : DateTime.now()

    await supply.save()
    return supply
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

      // Get active system setting
      const systemSettingService = new SystemSettingService()
      const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting

      // Get logo and colors from system setting
      let imageLogo = systemSettingActive?.systemSettingLogo || `${env.get('BACKGROUND_IMAGE_LOGO')}`
      let sidebarColor = systemSettingActive?.systemSettingSidebarColor || '244062'

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Supplies Report')

      // Add logo
      await SupplieService.addImageLogo(workbook, worksheet, imageLogo)

      // Title row
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:M1')
      const titleRow = worksheet.addRow(['Supplies and Assignments Report'])
      const titleColor = sidebarColor
      const fgColor = 'FFFFFFF'
      worksheet.getCell('A2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: titleColor },
      }
      titleRow.font = { bold: true, size: 24, color: { argb: fgColor } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:M2')

      // Date row
      const periodColor = '366092'
      const currentDate = DateTime.now().toFormat('DDDD')
      const periodRow = worksheet.addRow([`Generated on: ${currentDate}`])
      periodRow.font = { size: 15, color: { argb: fgColor } }
      worksheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: periodColor },
      }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      periodRow.height = 30
      worksheet.mergeCells('A3:M3')

      // Freeze rows
      worksheet.views = [
        { state: 'frozen', ySplit: 1 },
        { state: 'frozen', ySplit: 2 },
        { state: 'frozen', ySplit: 3 },
        { state: 'frozen', ySplit: 4 },
      ]

      // Headers
      SupplieService.addHeadRow(worksheet, sidebarColor, fgColor)

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
   * Add image logo to worksheet
   */
  private static async addImageLogo(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet, imageLogo: string) {
    try {
      const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
      const imageBuffer = imageResponse.data

      const metadata = await sharp(imageBuffer).metadata()
      const imageWidth = metadata.width ? metadata.width : 0
      const imageHeight = metadata.height ? metadata.height : 0

      const targetWidth = 139
      const targetHeight = 49
      const scale = Math.min(targetWidth / imageWidth, targetHeight / imageHeight)

      const adjustedWidth = imageWidth * scale
      const adjustedHeight = imageHeight * scale

      const imageId = workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      })

      worksheet.addImage(imageId, {
        tl: { col: 0.28, row: 0.7 },
        ext: { width: adjustedWidth, height: adjustedHeight },
      })
    } catch (error) {
      // If logo fails, continue without it
      console.error('Error loading logo:', error)
    }
  }

  /**
   * Add header row
   */
private static addHeadRow(worksheet: ExcelJS.Worksheet, color: string, fgColor: string) {
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
      fgColor: { argb: color },
    }
    cell.font = {
      bold: true,
      color: { argb: fgColor },
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
    let rowCount = 5

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
    let color = 'FFFFFFF'
    let fgColor = '000000'

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
