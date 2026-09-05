import Alliance from '#models/alliance'
import AllianceBillingProfile from '#models/alliance_billing_profile'
import DiscountCode from '#models/discount_code'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import {
  ALLIANCE_CODE_MAX_ATTEMPTS,
  QR_URL_EXPIRE_SECONDS,
  generateAllianceCodeText,
} from '#helpers/alliance_code_generator'
import { computeBillingProfileCompleteness } from '#helpers/tenant_billing_profile_completeness'
import DiscountCodeService from '#services/discount_code_service'
import UploadService from '#services/upload_service'
import QRCode from 'qrcode'
import type {
  AllianceDiscountCodeView,
  AllianceListItem,
  AllianceQrUrlView,
  AllianceView,
  CreateAllianceInput,
  ListAlliancesFilters,
  ListAlliancesResult,
  UpdateAllianceInput,
} from '../interfaces/alliance_interface.js'

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

function throwFromCatalog(
  catalog: (typeof ALLIANCE_ERRORS)[keyof typeof ALLIANCE_ERRORS]
): never {
  throw new AllianceServiceError(
    catalog.detail,
    catalog.code,
    catalog.status,
    catalog.key,
    catalog.detail
  )
}

/** Id de ruta inválido (NaN, 0, negativo) se trata como no encontrado, no como 500. */
export function assertPositiveAllianceId(allianceId: number): void {
  if (!Number.isFinite(allianceId) || allianceId <= 0) {
    throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
  }
}

/**
 * Rechaza un porcentaje de comisión fuera de 0..100 o con más de dos
 * decimales. Exportable: la HU 06a la reutiliza desde otra entrada.
 */
export function assertCommissionPercent(value: number): void {
  const catalog = ALLIANCE_ERRORS.COMMISSION_OUT_OF_RANGE
  if (!Number.isFinite(value) || value < 0 || value > 100 || hasMoreThanTwoDecimals(value)) {
    throw new AllianceServiceError(
      catalog.detail,
      catalog.code,
      catalog.status,
      catalog.key,
      catalog.detail
    )
  }
}

/**
 * `null`/`undefined` es plazo indeterminado. Cero y negativos se rechazan.
 * Exportable: la HU 06a la reutiliza desde otra entrada.
 */
export function assertTermPeriods(value: number | null | undefined): void {
  if (value === null || value === undefined) {
    return
  }

  if (!Number.isInteger(value) || value < 1) {
    const catalog = ALLIANCE_ERRORS.TERM_PERIODS_INVALID
    throw new AllianceServiceError(
      catalog.detail,
      catalog.code,
      catalog.status,
      catalog.key,
      catalog.detail
    )
  }
}

function hasMoreThanTwoDecimals(value: number): boolean {
  const scaled = value * 100
  return Math.abs(scaled - Math.round(scaled)) > 1e-6
}

function toIso(value: { toISO: () => string | null } | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.toISO()
}

function resolveAllianceCompleteness(alliance: Alliance) {
  const profile = alliance.allianceBillingProfile as AllianceBillingProfile | null | undefined

  if (!profile) {
    return computeBillingProfileCompleteness({
      rfc: null,
      legalName: alliance.allianceName,
      postalCode: null,
      taxRegimeCode: null,
      cfdiUseCode: null,
    })
  }

  return computeBillingProfileCompleteness({
    rfc: profile.rfc,
    legalName: profile.legalName,
    postalCode: profile.postalCode,
    taxRegimeCode: profile.taxRegimeCode,
    cfdiUseCode: profile.cfdiUseCode,
  })
}

export function toAllianceListItem(alliance: Alliance): AllianceListItem {
  const completeness = resolveAllianceCompleteness(alliance)

  return {
    allianceId: alliance.allianceId,
    allianceName: alliance.allianceName,
    allianceContactName: alliance.allianceContactName,
    allianceContactEmail: alliance.allianceContactEmail,
    allianceDefaultCommissionPercent: Number(alliance.allianceDefaultCommissionPercent),
    allianceDefaultTermPeriods: alliance.allianceDefaultTermPeriods,
    allianceActive: alliance.allianceActive === 1 ? 1 : 0,
    createdAt: toIso(alliance.createdAt) ?? '',
    billingProfileComplete: completeness.complete,
    missingFields: completeness.missingFields,
  }
}

export function toAllianceDiscountCodeView(
  code: DiscountCode,
  alliance: Alliance
): AllianceDiscountCodeView {
  return {
    discountCodeId: Number(code.discountCodeId),
    discountCodeText: code.discountCodeCode,
    discountCodeKind: code.discountCodeKind,
    discountCodeValue: Number(code.discountCodeValue),
    discountCodeActive: code.discountCodeActive === 1 ? 1 : 0,
    qrUrlPath: `/platform/alliances/${alliance.allianceId}/code/qr-url`,
    allianceQrReady: Boolean(alliance.allianceQrStorageKey),
  }
}

function resolvePreloadedDiscountCode(alliance: Alliance): DiscountCode | null {
  const related = alliance.$preloaded.discountCode
  if (!related || Array.isArray(related)) {
    return null
  }
  return related as DiscountCode
}

export function toAllianceView(alliance: Alliance): AllianceView {
  const code = resolvePreloadedDiscountCode(alliance)

  return {
    ...toAllianceListItem(alliance),
    allianceContactPhone: alliance.allianceContactPhone,
    updatedAt: toIso(alliance.updatedAt),
    allianceDiscountCode: code ? toAllianceDiscountCodeView(code, alliance) : null,
  }
}

/**
 * Lógica de negocio del registro de alianzas comerciales de la plataforma
 * (USRH1788505941892).
 *
 * Invariantes: toda alianza nace activa y con su código; el nombre puede
 * repetirse; el porcentaje y el plazo son valores por omisión; ningún
 * método escribe `alliance_deleted_at`.
 */
export default class AllianceService {
  private readonly discountCodes = new DiscountCodeService()
  private readonly uploads: UploadService

  constructor(uploads: UploadService = new UploadService()) {
    this.uploads = uploads
  }

  /**
   * Listado paginado con filtros. Sin criterios, se comporta como el
   * catálogo completo (sin retirados), orden `alliance_id asc`.
   */
  async listAlliances(filters: ListAlliancesFilters = {}): Promise<ListAlliancesResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)

    const query = Alliance.query()
      .whereNull('alliance_deleted_at')
      .preload('allianceBillingProfile')
      .orderBy('alliance_id', 'asc')

    if (filters.search) {
      const term = `%${filters.search.toUpperCase()}%`
      query.where((builder) => {
        builder
          .whereRaw('UPPER(alliance_name) LIKE ?', [term])
          .orWhereRaw('UPPER(alliance_contact_name) LIKE ?', [term])
      })
    }

    if (filters.active !== undefined) {
      query.where('alliance_active', filters.active)
    }

    const paginated = await query.paginate(page, limit)
    const json = paginated.toJSON()

    return {
      data: (json.data as Alliance[]).map(toAllianceListItem),
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
      },
    }
  }

  /** 404 tipado si no existe, el id es inválido o está retirada con soft delete. */
  async getAlliance(allianceId: number): Promise<Alliance> {
    assertPositiveAllianceId(allianceId)

    const alliance = await Alliance.query()
      .where('alliance_id', allianceId)
      .whereNull('alliance_deleted_at')
      .preload('allianceBillingProfile')
      .preload('discountCode')
      .first()

    if (!alliance) {
      const catalog = ALLIANCE_ERRORS.NOT_FOUND
      throw new AllianceServiceError(
        catalog.detail,
        catalog.code,
        catalog.status,
        catalog.key,
        catalog.detail
      )
    }

    return alliance
  }

  async createAlliance(input: CreateAllianceInput): Promise<Alliance> {
    assertCommissionPercent(input.allianceDefaultCommissionPercent)
    assertTermPeriods(input.allianceDefaultTermPeriods)

    const alliance = await db.transaction(async (trx) => {
      const created = await Alliance.create(
        {
          allianceName: input.allianceName,
          allianceContactName: input.allianceContactName ?? null,
          allianceContactEmail: input.allianceContactEmail ?? null,
          allianceContactPhone: input.allianceContactPhone ?? null,
          allianceDefaultCommissionPercent: input.allianceDefaultCommissionPercent,
          allianceDefaultTermPeriods: input.allianceDefaultTermPeriods ?? null,
          allianceActive: 1,
        },
        { client: trx }
      )

      const code = await this.mintAllianceDiscountCode(created, trx)
      created.$setRelated('discountCode', code)
      return created
    })

    await this.ensureAllianceQrUploaded(alliance)
    return alliance
  }

  /**
   * Genera y sube el PNG del QR si aún no hay key. Idempotente y no lanza:
   * un fallo de S3 se registra y devuelve `null`. Persiste la key que
   * **devuelve** el servicio de subida, no la compuesta por el llamador.
   */
  async ensureAllianceQrUploaded(alliance: Alliance): Promise<string | null> {
    if (alliance.allianceQrStorageKey) {
      return alliance.allianceQrStorageKey
    }

    try {
      const code =
        resolvePreloadedDiscountCode(alliance) ??
        (await DiscountCode.query().where('discount_code_alliance_id', alliance.allianceId).first())

      if (!code) {
        return null
      }

      const png = await QRCode.toBuffer(code.discountCodeCode, { margin: 1, width: 512 })
      const composedKey = `alliances/${alliance.allianceId}/qr-${code.discountCodeCode}.png`
      const returnedKey = await this.uploads.uploadPrivateBuffer(composedKey, png, 'image/png')

      if (!returnedKey) {
        logger.warn({ allianceId: alliance.allianceId }, 'No se pudo subir el QR de la alianza')
        return null
      }

      alliance.allianceQrStorageKey = returnedKey
      await alliance.save()
      return returnedKey
    } catch (error) {
      const err = error as { message?: string; status?: number }
      logger.warn(
        { allianceId: alliance.allianceId, message: err.message, status: err.status },
        'Fallo al asegurar el QR de la alianza'
      )
      return null
    }
  }

  /**
   * Entrega la URL firmada del QR. Si la key falta, repara en el acto.
   * Distingue sin código (404) de almacenamiento caído (503).
   */
  async getAllianceQrUrl(allianceId: number): Promise<AllianceQrUrlView> {
    const alliance = await this.getAlliance(allianceId)
    const code = resolvePreloadedDiscountCode(alliance)

    if (!code) {
      throwFromCatalog(ALLIANCE_ERRORS.CODE_NOT_FOUND)
    }

    const key = await this.ensureAllianceQrUploaded(alliance)
    if (!key) {
      throwFromCatalog(ALLIANCE_ERRORS.QR_UNAVAILABLE)
    }

    const url = await this.uploads.getDownloadLink(key, QR_URL_EXPIRE_SECONDS)
    if (typeof url !== 'string') {
      logger.warn(
        { allianceId: alliance.allianceId },
        'La firma de la URL del QR no devolvió un string'
      )
      throwFromCatalog(ALLIANCE_ERRORS.QR_UNAVAILABLE)
    }

    return { url, expiresIn: QR_URL_EXPIRE_SECONDS }
  }

  /**
   * Acuña el código de la alianza dentro de la transacción del alta.
   * Pre-chequeo del texto; si choca, genera otro. Nunca deja escapar
   * el texto en un error ni en un log.
   */
  async mintAllianceDiscountCode(
    alliance: Alliance,
    trx: TransactionClientContract
  ): Promise<DiscountCode> {
    const alreadyOwned = await DiscountCode.query({ client: trx })
      .where('discount_code_alliance_id', alliance.allianceId)
      .first()

    if (alreadyOwned) {
      throwFromCatalog(ALLIANCE_ERRORS.CODE_ALREADY_EXISTS)
    }

    for (let attempt = 1; attempt <= ALLIANCE_CODE_MAX_ATTEMPTS; attempt++) {
      const text = generateAllianceCodeText()
      const taken = await trx.from('discount_codes').where('discount_code_code', text).first()

      if (taken) {
        logger.warn(
          { allianceId: alliance.allianceId, attempt },
          'Colisión de texto al acuñar el código de una alianza'
        )
        continue
      }

      try {
        return await this.discountCodes.createDiscountCode(
          {
            discountCodeCode: text,
            discountCodeName: `Alianza ${alliance.allianceName}`.slice(0, 160),
            discountCodeKind: 'percent',
            discountCodeValue: 0,
            discountCodeAllianceId: alliance.allianceId,
          },
          trx
        )
      } catch (error) {
        if (this.isRetryableTextCollision(error, alliance.allianceId, attempt)) {
          continue
        }
        this.rethrowNonRetryableMintFailure(error)
      }
    }

    logger.error(
      { allianceId: alliance.allianceId },
      'Agotados los intentos de acuñación del código de una alianza'
    )
    throwFromCatalog(ALLIANCE_ERRORS.CODE_GENERATION_EXHAUSTED)
  }

  /**
   * Consulta el código de la alianza. Distingue alianza inexistente
   * (`NOT_FOUND`) de alianza sin código (`CODE_NOT_FOUND`).
   */
  async getAllianceDiscountCode(allianceId: number): Promise<AllianceDiscountCodeView> {
    const alliance = await this.getAlliance(allianceId)
    const code = resolvePreloadedDiscountCode(alliance)

    if (!code) {
      throwFromCatalog(ALLIANCE_ERRORS.CODE_NOT_FOUND)
    }

    return toAllianceDiscountCodeView(code, alliance)
  }

  /**
   * Corrige datos de la alianza. `allianceActive` no se acepta (viven
   * activate/deactivate). Las aserciones se re-corren con el estado
   * resultante para no dejar una combinación inconsistente cuando el
   * cliente solo manda un campo.
   */
  async updateAlliance(allianceId: number, input: UpdateAllianceInput): Promise<Alliance> {
    const alliance = await this.getAlliance(allianceId)

    const resultingCommission =
      input.allianceDefaultCommissionPercent ?? alliance.allianceDefaultCommissionPercent
    assertCommissionPercent(Number(resultingCommission))

    const resultingTerm =
      input.allianceDefaultTermPeriods !== undefined
        ? input.allianceDefaultTermPeriods
        : alliance.allianceDefaultTermPeriods
    assertTermPeriods(resultingTerm)

    if (input.allianceName !== undefined) {
      alliance.allianceName = input.allianceName
    }
    if (input.allianceContactName !== undefined) {
      alliance.allianceContactName = input.allianceContactName
    }
    if (input.allianceContactEmail !== undefined) {
      alliance.allianceContactEmail = input.allianceContactEmail
    }
    if (input.allianceContactPhone !== undefined) {
      alliance.allianceContactPhone = input.allianceContactPhone
    }
    if (input.allianceDefaultCommissionPercent !== undefined) {
      alliance.allianceDefaultCommissionPercent = input.allianceDefaultCommissionPercent
    }
    if (input.allianceDefaultTermPeriods !== undefined) {
      alliance.allianceDefaultTermPeriods = input.allianceDefaultTermPeriods
    }

    await alliance.save()
    return alliance
  }

  async activateAlliance(allianceId: number): Promise<Alliance> {
    const alliance = await this.getAlliance(allianceId)

    if (alliance.allianceActive === 1) {
      throwFromCatalog(ALLIANCE_ERRORS.ALREADY_ACTIVE)
    }

    return db.transaction(async (trx) => {
      alliance.useTransaction(trx)
      alliance.allianceActive = 1
      await alliance.save()
      await this.syncDiscountCodeActive(alliance.allianceId, 1, trx)
      await alliance.load('discountCode')
      return alliance
    })
  }

  async deactivateAlliance(allianceId: number): Promise<Alliance> {
    const alliance = await this.getAlliance(allianceId)

    if (alliance.allianceActive === 0) {
      throwFromCatalog(ALLIANCE_ERRORS.ALREADY_INACTIVE)
    }

    return db.transaction(async (trx) => {
      alliance.useTransaction(trx)
      alliance.allianceActive = 0
      await alliance.save()
      await this.syncDiscountCodeActive(alliance.allianceId, 0, trx)
      await alliance.load('discountCode')
      return alliance
    })
  }

  /**
   * Cascada tolerante: solo invoca al catálogo si el código no está
   * ya en el estado destino. Sin código, no hace nada (ventana §16).
   */
  private async syncDiscountCodeActive(
    allianceId: number,
    target: 0 | 1,
    trx: TransactionClientContract
  ): Promise<void> {
    const code = await DiscountCode.query({ client: trx })
      .where('discount_code_alliance_id', allianceId)
      .first()

    if (!code || code.discountCodeActive === target) {
      return
    }

    if (target === 1) {
      await this.discountCodes.activateDiscountCode(code.discountCodeId, trx)
      return
    }

    await this.discountCodes.deactivateDiscountCode(code.discountCodeId, trx)
  }

  /**
   * Choque de texto entre el pre-chequeo y el INSERT. Se reintenta.
   * Nunca reexpone el texto: `CODE_DUPLICATE` lo lleva en `detail`.
   */
  private isRetryableTextCollision(
    error: unknown,
    allianceId: number,
    attempt: number
  ): boolean {
    if (
      error instanceof DiscountCodeServiceError &&
      error.errorCode === DISCOUNT_CODE_ERROR_CODES.CODE_DUPLICATE
    ) {
      logger.warn(
        { allianceId, attempt },
        'Colisión de texto al insertar el código de una alianza'
      )
      return true
    }

    return false
  }

  /** `ER_DUP_ENTRY` sobre el UNIQUE de dueño; cualquier otro error se relanza. */
  private rethrowNonRetryableMintFailure(error: unknown): never {
    const dbError = error as { code?: string; sqlMessage?: string }
    if (
      dbError.code === ER_DUP_ENTRY &&
      dbError.sqlMessage?.includes('uq_discount_code_alliance_id')
    ) {
      throwFromCatalog(ALLIANCE_ERRORS.CODE_ALREADY_EXISTS)
    }

    throw error
  }
}
