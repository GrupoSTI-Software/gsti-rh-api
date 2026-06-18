import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Certification from '#models/certification'
import CertificationCategory from '#models/certification_category'
import BusinessUnit from '#models/business_unit'
import { CERTIFICATION_ERROR_CODES } from '../constants/certification_error_codes.js'
import { CertificationServiceError } from '../exceptions/certification_service_error.js'
import type { LogCertification } from '../interfaces/MongoDB/log_certification.js'
import { CERTIFICATION_SQL_META_PATTERN } from '../validators/certification.js'

export interface CertificationUpsertPayload {
  name: string
  categoryId: number
  isExternal: boolean
  externalUrl: string | null
  renewalPeriodDays: number | null
  businessUnitIds: number[] | undefined
}

function normalizeWhitespace(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function isBlankUrl(url: string | null | undefined) {
  return url === null || url === undefined || String(url).trim() === ''
}

function dedupeSortedIds(ids: number[]) {
  return [...new Set(ids)].sort((a, b) => a - b)
}

/**
 * Validación RFC: URL HTTP o HTTPS válida de hasta 2048 caracteres (límite adicional Vine).
 */
export function assertValidExternalHttpUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error()
    }
  } catch {
    throw new CertificationServiceError(
      'El link debe ser una URL válida con protocolo http o https.',
      CERTIFICATION_ERROR_CODES.VAL_INPUT,
      400
    )
  }
}

/** Serializa certificación con `category` y `businessUnits` precargadas. */
export function serializeCertificationRow(certification: Certification) {
  const unitRows = certification.businessUnits ?? []
  const appliesToAll = unitRows.length === 0
  const categoryRow = certification.category

  const categoryPayload = categoryRow
    ? {
        id: categoryRow.certificationCategoryId,
        key: categoryRow.certificationCategoryKey,
        name: categoryRow.certificationCategoryName,
        displayOrder: rowDisplayOrder(categoryRow.certificationCategoryDisplayOrder),
        isActive: categoryRow.certificationCategoryIsActive === 1,
      }
    : null

  let isExternalPayload = !!certification.isExternal
  if (typeof certification.isExternal === 'number') {
    isExternalPayload = certification.isExternal === 1
  }

  return {
    id: certification.certificationId,
    name: certification.certificationName,
    category: categoryPayload,
    isExternal: isExternalPayload,
    externalUrl: certification.externalUrl,
    renewalPeriodDays: certification.renewalPeriodDays,
    businessUnits: unitRows.map((u) => ({
      id: u.businessUnitId,
      name: u.businessUnitName,
      slug: u.businessUnitSlug,
    })),
    appliesToAllBusinessUnits: appliesToAll,
  }
}

function rowDisplayOrder(order: unknown) {
  return typeof order === 'number' ? order : Number(order)
}

/** Servicio dominio para catálogo de certificaciones (catálogo ONEST / RH). */
export default class CertificationService {
  /**
   * Lista paginada con categoría y unidades de negocio (orden alfabético por nombre).
   * @param page Página numerada desde 1.
   * @param limit Cantidad máxima por página (tope interno 500).
   */
  async listPaginated(page: number = 1, limit: number = 25) {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)

    const paginator = await Certification.query()
      .preload('category')
      .preload('businessUnits', (q) =>
        q.whereNull('business_unit_deleted_at').orderBy('business_unit_name')
      )
      .orderBy('certification_name', 'asc')
      .paginate(safePage, safeLimit)

    const serialized = paginator.serialize()
    return {
      meta: serialized.meta,
      data: serialized.data.map((row) => serializeCertificationRow(row as Certification)),
    }
  }

  /** Categorías activas ordenadas por `displayOrder`. */
  async listCategories() {
    const rows = await CertificationCategory.query()
      .where('certification_category_is_active', 1)
      .orderBy('certification_category_display_order', 'asc')

    return rows.map((row) => ({
      id: row.certificationCategoryId,
      key: row.certificationCategoryKey,
      name: row.certificationCategoryName,
      displayOrder: rowDisplayOrder(row.certificationCategoryDisplayOrder),
      isActive: row.certificationCategoryIsActive === 1,
    }))
  }

  /**
   * Crea certificación y pivote BU; omitir unidades ⇒ aplica a todas.
   * @see {@link CertificationService.update}
   */
  async create(payload: CertificationUpsertPayload) {
    return await this.persistCertification(undefined, payload)
  }

  /**
   * Actualiza certificación y reemplaza unidades relacionadas cuando se envía `businessUnitIds`.
   */
  async update(certificationId: number, payload: CertificationUpsertPayload) {
    return await this.persistCertification(certificationId, payload)
  }

  /** Elimina fila principal; pivote borra por `ON DELETE CASCADE`. */
  async delete(certificationId: number) {
    const cert = await Certification.query().where('certification_id', certificationId).first()
    if (!cert) {
      throw new CertificationServiceError(
        'La certificación no existe.',
        CERTIFICATION_ERROR_CODES.CERTIFICATION_NOT_FOUND,
        404
      )
    }
    await cert.delete()
  }

  private async persistCertification(existingId: number | undefined, payload: CertificationUpsertPayload) {
    const normalizedName = normalizeWhitespace(payload.name)
    this.assertCertificationNameSqlSafe(normalizedName)
    await this.ensureCategoryExists(payload.categoryId)
    await this.ensureBusinessUnitsExist(payload.businessUnitIds)

    const externalUrlNormalized = this.resolveExternalUrlField(payload.isExternal, payload.externalUrl)
    await this.ensureNoDuplicate(payload.categoryId, normalizedName, existingId)

    const businessIds = dedupeSortedIds(payload.businessUnitIds ?? [])

    const cert =
      existingId !== undefined
        ? await this.updateInTrx(existingId, {
            normalizedName,
            payload,
            externalUrlNormalized,
            businessIds,
          })
        : await this.createInTrx({
            normalizedName,
            payload,
            externalUrlNormalized,
            businessIds,
          })

    await cert.refresh()
    await cert.load('category')
    await cert.load('businessUnits', (q) =>
      q.whereNull('business_unit_deleted_at').orderBy('business_unit_name')
    )
    return serializeCertificationRow(cert)
  }

  private assertCertificationNameSqlSafe(name: string) {
    if (CERTIFICATION_SQL_META_PATTERN.test(name)) {
      throw new CertificationServiceError(
        'El nombre no debe contener comillas, punto y coma ni secuencias de comentarios SQL (--, /*).',
        CERTIFICATION_ERROR_CODES.VAL_INPUT,
        400
      )
    }
  }

  private resolveExternalUrlField(isExternal: boolean, externalUrl: string | null) {
    if (!isExternal) {
      return null
    }
    if (isBlankUrl(externalUrl)) {
      return null
    }
    const trimmed = String(externalUrl).trim()
    assertValidExternalHttpUrl(trimmed)
    return trimmed
  }

  private async ensureCategoryExists(categoryId: number) {
    const cat = await CertificationCategory.query()
      .where('certification_category_id', categoryId)
      .where('certification_category_is_active', 1)
      .first()
    if (!cat) {
      throw new CertificationServiceError(
        'La categoría de certificación no existe o está inactiva.',
        CERTIFICATION_ERROR_CODES.CATEGORY_NOT_FOUND,
        404
      )
    }
  }

  private async ensureBusinessUnitsExist(ids: number[] | undefined) {
    if (!ids || ids.length === 0) {
      return
    }
    const unique = dedupeSortedIds(ids)
    const rows = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .whereIn('business_unit_id', unique)
      .where('business_unit_active', 1)

    if (rows.length !== unique.length) {
      throw new CertificationServiceError(
        'Una o más unidades de negocio son inválidas o no están activas.',
        CERTIFICATION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404
      )
    }
  }

  /** Evita repetir mismo nombre dentro de la categoría (insensible mayúsculas). */
  private async ensureNoDuplicate(categoryId: number, name: string, excludeId?: number) {
    let q = Certification.query()
      .where('category_id', categoryId)
      .whereRaw('LOWER(TRIM(certification_name)) = ?', [name.trim().toLowerCase()])
    if (excludeId !== undefined) {
      q = q.whereNot('certification_id', excludeId)
    }
    const found = await q.first()
    if (found) {
      throw new CertificationServiceError(
        'Esta certificación ya existe en la categoría seleccionada.',
        CERTIFICATION_ERROR_CODES.CERTIFICATION_DUPLICATE,
        409
      )
    }
  }

  /**
   * Inserta certificación y pivotes usando el modelo dentro de una transacción.
   */
  private async createInTrx(params: {
    normalizedName: string
    payload: CertificationUpsertPayload
    externalUrlNormalized: string | null
    businessIds: number[]
  }) {
    return await db.transaction(async (trx) => {
      const cert = new Certification()
      cert.categoryId = params.payload.categoryId
      cert.certificationName = params.normalizedName
      cert.isExternal = params.payload.isExternal
      cert.externalUrl = params.externalUrlNormalized
      cert.renewalPeriodDays =
        params.payload.renewalPeriodDays === undefined || params.payload.renewalPeriodDays === null
          ? null
          : params.payload.renewalPeriodDays
      cert.useTransaction(trx)
      await cert.save()

      await this.syncBusinessUnitsTrx(trx, cert.certificationId, params.businessIds)
      return cert
    })
  }

  private async updateInTrx(
    certificationId: number,
    params: {
      normalizedName: string
      payload: CertificationUpsertPayload
      externalUrlNormalized: string | null
      businessIds: number[]
    }
  ) {
    return await db.transaction(async (trx) => {
      const cert = await Certification.query({ client: trx })
        .where('certification_id', certificationId)
        .forUpdate()
        .first()

      if (!cert) {
        throw new CertificationServiceError(
          'La certificación no existe.',
          CERTIFICATION_ERROR_CODES.CERTIFICATION_NOT_FOUND,
          404
        )
      }

      cert.categoryId = params.payload.categoryId
      cert.certificationName = params.normalizedName
      cert.isExternal = params.payload.isExternal
      cert.externalUrl = params.externalUrlNormalized
      cert.renewalPeriodDays =
        params.payload.renewalPeriodDays === undefined || params.payload.renewalPeriodDays === null
          ? null
          : params.payload.renewalPeriodDays
      cert.certificationUpdatedAt = DateTime.now()
      await cert.useTransaction(trx).save()

      await this.syncBusinessUnitsTrx(trx, certificationId, params.businessIds)
      await cert.refresh()

      return cert
    })
  }

  private async syncBusinessUnitsTrx(
    trx: TransactionClientContract,
    certificationId: number,
    businessIds: number[]
  ) {
    await trx.from('business_unit_certifications').where('certification_id', certificationId).delete()
    if (businessIds.length === 0) {
      return
    }
    const rows = businessIds.map((businessUnitId) => ({
      certification_id: certificationId,
      business_unit_id: businessUnitId,
    }))
    await trx.table('business_unit_certifications').insert(rows)
  }

  /** Construye el encabezado común antes de persistir logs en Mongo. */
  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    return {
      action,
      user_agent: this.getHeaderValue(rawHeaders, 'User-Agent') ?? '',
      sec_ch_ua_platform: this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform') ?? '',
      sec_ch_ua: this.getHeaderValue(rawHeaders, 'sec-ch-ua') ?? '',
      origin: this.getHeaderValue(rawHeaders, 'Origin') ?? '',
      date: date ?? '',
    }
  }

  async saveActionOnLog(logCert: LogCertification) {
    try {
      const { LogStore } = await import('#models/MongoDB/log_store')
      await LogStore.set('log_certifications', logCert)
    } catch {
      //
    }
  }

  private getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }
}
