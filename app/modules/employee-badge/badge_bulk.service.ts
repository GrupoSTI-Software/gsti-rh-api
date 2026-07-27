import type { HttpContext } from '@adonisjs/core/http'
import type { Readable } from 'node:stream'
import { ZipArchive } from 'archiver'
import PDFDocument from 'pdfkit'
import { EMPLOYEE_BADGE_ERROR_CODES } from '#constants/employee_badge_error_codes'
import { EmployeeBadgeError } from '#exceptions/employee_badge_error'
import { todayInBusinessZone } from '#utils/business_date'
import BadgeRepositoryMysql from './badge.repository.mysql.js'
import BadgeRenderService from './badge_render.service.js'
import BadgeService from './badge.service.js'
import type { BadgeRepository } from './badge.repository.js'
import type { BadgeEmployeeContext } from './dto/badge.dto.js'

/** Tamaño credencial CR80 en puntos (85.6 × 53.98 mm). */
export const BULK_CELL_WIDTH = 242.65
export const BULK_CELL_HEIGHT = 153.07

/** Gafetes por hoja carta (2 columnas × 4 filas). */
export const BULK_BADGES_PER_PAGE = 8

const LETTER_WIDTH = 612
const GUTTER = 12
const HORIZONTAL_MARGIN = (LETTER_WIDTH - 2 * BULK_CELL_WIDTH - GUTTER) / 2
const VERTICAL_MARGIN = (792 - 4 * BULK_CELL_HEIGHT - 3 * GUTTER) / 2

const CUT_MARK_LENGTH = 8
const CUT_MARK_OFFSET = 4
const CUT_MARK_COLOR = '#9CA3AF'

export type BulkBadgeFormat = 'pdf' | 'png'

export interface BulkBadgeStreamInput {
  empleadoIds: number[]
  formato: BulkBadgeFormat
  businessUnitIds: number[]
  response: HttpContext['response']
}

/** Sanea el nombre de entrada del ZIP — espejo `expediente.controller.ts:510`. */
export function sanitizeBulkEntryName(nombreCompleto: string): string {
  return nombreCompleto.replace(/[^\w.\- ]/g, '_').replace(/\s+/g, '-')
}

/** Nombre del archivo de descarga masiva con fecha de negocio. */
export function buildBulkDownloadFilename(formato: BulkBadgeFormat): string {
  const date = todayInBusinessZone().toFormat('yyyy-MM-dd')
  return `gafetes-empleados-${date}.${formato === 'pdf' ? 'pdf' : 'zip'}`
}

/** Posición de celda en la cuadrícula LETTER (índice global 0-based). */
export function computeBadgeCellPosition(index: number): { x: number; y: number; pageIndex: number } {
  const pageIndex = Math.floor(index / BULK_BADGES_PER_PAGE)
  const slotOnPage = index % BULK_BADGES_PER_PAGE
  const col = slotOnPage % 2
  const row = Math.floor(slotOnPage / 2)

  return {
    pageIndex,
    x: HORIZONTAL_MARGIN + col * (BULK_CELL_WIDTH + GUTTER),
    y: VERTICAL_MARGIN + row * (BULK_CELL_HEIGHT + GUTTER),
  }
}

/**
 * Servicio de descarga masiva de gafetes (E6 — USRH1784690015411).
 * Streaming obligatorio: PDF LETTER 2×4 con líneas de corte o ZIP de PNGs.
 */
export default class BadgeBulkService {
  private readonly repository: BadgeRepository
  private readonly badgeService: BadgeService
  private readonly renderService: BadgeRenderService

  constructor(
    repository: BadgeRepository = new BadgeRepositoryMysql(),
    badgeService: BadgeService = new BadgeService(repository),
    renderService: BadgeRenderService = new BadgeRenderService()
  ) {
    this.repository = repository
    this.badgeService = badgeService
    this.renderService = renderService
  }

  async streamBulk(input: BulkBadgeStreamInput): Promise<void> {
    const dedupedIds = [...new Set(input.empleadoIds)]
    const employees = await this.repository.findActiveEmployeesInTenant(
      dedupedIds,
      input.businessUnitIds
    )

    if (employees.length === 0) {
      throw new EmployeeBadgeError(
        'El gafete no existe o el trabajador no pertenece al tenant actual.',
        EMPLOYEE_BADGE_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404,
        'gafete-no-encontrado'
      )
    }

    const logoCache = new Map<number, Buffer | null>()

    if (input.formato === 'png') {
      await this.streamBulkZip(employees, logoCache, input.response)
    } else {
      await this.streamBulkPdf(employees, logoCache, input.response)
    }
  }

  private async resolveLogoBuffer(context: BadgeEmployeeContext, cache: Map<number, Buffer | null>) {
    if (cache.has(context.businessUnitId)) {
      return cache.get(context.businessUnitId)!
    }

    const buffer = await this.renderService.fetchImageTolerant(context.systemSettingLogo)
    cache.set(context.businessUnitId, buffer)
    return buffer
  }

  private setBinaryHeaders(
    response: HttpContext['response'],
    contentType: string,
    filename: string
  ): void {
    response.header('Content-Type', contentType)
    response.header('Content-Disposition', `attachment; filename="${filename}"`)
    response.header('Cache-Control', 'private, no-store')
    response.status(200)
  }

  private async streamBulkPdf(
    employees: BadgeEmployeeContext[],
    logoCache: Map<number, Buffer | null>,
    response: HttpContext['response']
  ): Promise<void> {
    this.setBinaryHeaders(response, 'application/pdf', buildBulkDownloadFilename('pdf'))

    const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: true })
    const streamed = response.stream(doc as unknown as Readable)

    try {
      for (const [index, employee] of employees.entries()) {
        if (index > 0 && index % BULK_BADGES_PER_PAGE === 0) {
          doc.addPage()
        }

        const { x, y } = computeBadgeCellPosition(index)
        const logoBuffer = await this.resolveLogoBuffer(employee, logoCache)
        const renderContext = await this.badgeService.buildRenderContext(employee, logoBuffer)
        const pngBuffer = await this.renderService.renderBadgePng(renderContext)

        doc.image(pngBuffer, x, y, { width: BULK_CELL_WIDTH, height: BULK_CELL_HEIGHT })
        this.drawCutGuides(doc, x, y, BULK_CELL_WIDTH, BULK_CELL_HEIGHT)
      }

      doc.end()
      await streamed
    } catch (error) {
      doc.end()
      this.destroyStream(response, error)
    }
  }

  private async streamBulkZip(
    employees: BadgeEmployeeContext[],
    logoCache: Map<number, Buffer | null>,
    response: HttpContext['response']
  ): Promise<void> {
    this.setBinaryHeaders(response, 'application/zip', buildBulkDownloadFilename('png'))

    const archive = new ZipArchive({ store: true })
    const streamed = response.stream(archive)

    try {
      for (const employee of employees) {
        const logoBuffer = await this.resolveLogoBuffer(employee, logoCache)
        const renderContext = await this.badgeService.buildRenderContext(employee, logoBuffer)
        const pngBuffer = await this.renderService.renderBadgePng(renderContext)
        const entryName = `${employee.employeeId}-${sanitizeBulkEntryName(
          renderContext.nombreCompleto
        )}.png`

        archive.append(pngBuffer, { name: entryName })
      }

      await archive.finalize()
      await streamed
    } catch (error) {
      archive.abort()
      this.destroyStream(response, error)
    }
  }

  /**
   * Guías de recorte: rectángulo punteado en el contorno CR80 + cruces en esquinas
   * (espejo del mockup §9.4 — líneas de corte visibles al imprimir).
   */
  private drawCutGuides(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    doc.save()
    doc.lineWidth(0.5)
    doc.strokeColor(CUT_MARK_COLOR)
    doc.dash(3, { space: 2 })

    doc.rect(x, y, width, height).stroke()

    const corners = [
      { cx: x, cy: y },
      { cx: x + width, cy: y },
      { cx: x, cy: y + height },
      { cx: x + width, cy: y + height },
    ]

    for (const { cx, cy } of corners) {
      const left = cx <= x + width / 2
      const top = cy <= y + height / 2

      doc
        .moveTo(cx + (left ? -CUT_MARK_OFFSET - CUT_MARK_LENGTH : CUT_MARK_OFFSET), cy)
        .lineTo(cx + (left ? -CUT_MARK_OFFSET : CUT_MARK_OFFSET + CUT_MARK_LENGTH), cy)
        .stroke()

      doc
        .moveTo(cx, cy + (top ? -CUT_MARK_OFFSET - CUT_MARK_LENGTH : CUT_MARK_OFFSET))
        .lineTo(cx, cy + (top ? -CUT_MARK_OFFSET : CUT_MARK_OFFSET + CUT_MARK_LENGTH))
        .stroke()
    }

    doc.undash()
    doc.restore()
  }

  private destroyStream(response: HttpContext['response'], error: unknown): never {
    if (!response.response.destroyed) {
      response.response.destroy()
    }
    throw error
  }
}
