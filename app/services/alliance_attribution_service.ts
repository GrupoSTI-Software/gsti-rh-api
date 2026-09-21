import { DateTime } from 'luxon'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import BusinessUnit from '#models/business_unit'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { resolveAttributionAccrualProgress } from '#helpers/alliance_commission'
import AllianceCommissionService from '#services/alliance_commission_service'
import {
  assertCommissionPercent,
  assertPositiveAllianceId,
  assertTermPeriods,
} from '#services/alliance_service'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'
import type {
  AllianceAttributionView,
  CloseAllianceAttributionInput,
  CreateAllianceAttributionInput,
  ListAllianceAttributionsByAllianceFilters,
  ListAllianceAttributionsByAllianceResult,
  UpdateAllianceAttributionInput,
} from '../interfaces/alliance_attribution_interface.js'

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'
const LIVE_UNIQUE_INDEX = 'alliance_attributions_business_unit_live_unique'
const BUSINESS_UNIT_PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ATTRIBUTION_ID_PATTERN = /^[1-9]\d{0,9}$/
const MYSQL_UNSIGNED_INT_MAX = 4_294_967_295
const CREATE_NUMERIC_KEYS = [
  'allianceId',
  'allianceAttributionCommissionPercent',
  'allianceAttributionTermPeriods',
] as const
const PATCH_NUMERIC_KEYS = [
  'allianceAttributionCommissionPercent',
  'allianceAttributionTermPeriods',
] as const
const PATCH_OWNER_KEYS = ['allianceId', 'businessUnitPublicId'] as const

const commissions = new AllianceCommissionService()

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

/**
 * Vine convierte `[13]` en `13` y `true` en `1`. Eso hay que cortarlo
 * sobre el JSON crudo, antes de validar: si no, un body hostil crea
 * una atribución en serio.
 */
function assertCreateNumericFieldsAreScalar(body: unknown): void {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return
  }

  const record = body as Record<string, unknown>
  for (const key of CREATE_NUMERIC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue
    }
    const value = record[key]
    if (value === null) {
      continue
    }
    if (typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }
  }
}

function assertPatchDoesNotRewriteOwner(body: unknown): void {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return
  }

  const record = body as Record<string, unknown>
  for (const key of PATCH_OWNER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }
  }
}

function assertPatchNumericFieldsAreScalar(body: unknown): void {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return
  }

  const record = body as Record<string, unknown>
  for (const key of PATCH_NUMERIC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue
    }
    const value = record[key]
    if (value === null) {
      continue
    }
    if (typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }
  }
}

/** Id de ruta inválido se trata como no encontrado, no como 500. */
function parseAttributionId(raw: string | number): number {
  if (typeof raw === 'string') {
    if (!ATTRIBUTION_ID_PATTERN.test(raw)) {
      throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_NOT_FOUND)
    }
    return Number(raw)
  }

  if (!Number.isInteger(raw) || raw <= 0) {
    throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_NOT_FOUND)
  }

  return raw
}

function assertBusinessUnitPublicIdShape(businessUnitPublicId: string): void {
  if (!BUSINESS_UNIT_PUBLIC_ID_PATTERN.test(businessUnitPublicId)) {
    throwFromCatalog(ALLIANCE_ERRORS.BUSINESS_UNIT_NOT_FOUND)
  }
}

function toIso(value: { toISO: () => string | null } | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.toISO()
}

/**
 * Extrae `code` y `sqlMessage` aunque Lucid envuelva el error de MySQL.
 */
function mysqlErrorShape(error: unknown): { code?: string; sqlMessage: string } {
  const err = error as {
    code?: string
    sqlMessage?: string
    original?: { code?: string; sqlMessage?: string }
    cause?: { code?: string; sqlMessage?: string }
  }
  const inner = err.original ?? err.cause ?? err
  return {
    code: inner.code ?? err.code,
    sqlMessage: inner.sqlMessage ?? err.sqlMessage ?? '',
  }
}

function rethrowDuplicateLiveAttribution(error: unknown): never {
  const dbError = mysqlErrorShape(error)
  if (dbError.code === ER_DUP_ENTRY && dbError.sqlMessage.includes(LIVE_UNIQUE_INDEX)) {
    throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_ALREADY_LIVE)
  }
  throw error
}

type AccrualTotals = {
  accruedPeriods: number
  accruedAmountCents: number
}

const EMPTY_ACCRUAL: AccrualTotals = { accruedPeriods: 0, accruedAmountCents: 0 }

function toAllianceAttributionView(
  row: AllianceAttribution,
  alliance: Alliance,
  unit: BusinessUnit,
  totals: AccrualTotals
): AllianceAttributionView {
  const closedAt = toCalendarIsoDate(row.allianceAttributionClosedAt)
  const progress = resolveAttributionAccrualProgress(
    row.allianceAttributionTermPeriods,
    closedAt !== null,
    totals.accruedPeriods
  )

  return {
    allianceAttributionId: row.allianceAttributionId,
    allianceId: row.allianceId,
    allianceName: alliance.allianceName,
    businessUnitPublicId: unit.businessUnitPublicId,
    businessUnitName: unit.businessUnitName,
    allianceAttributionCommissionPercent: Number(row.allianceAttributionCommissionPercent),
    allianceAttributionTermPeriods: row.allianceAttributionTermPeriods,
    allianceAttributionStartsAt: toCalendarIsoDate(row.allianceAttributionStartsAt) ?? '',
    allianceAttributionClosedAt: closedAt,
    allianceAttributionCloseReason: row.allianceAttributionCloseReason,
    allianceAttributionIsLive: closedAt === null,
    allianceAttributionAccruedPeriods: totals.accruedPeriods,
    allianceAttributionRemainingPeriods: progress.remainingPeriods,
    allianceAttributionIsAccruing: progress.isAccruing,
    allianceAttributionNotAccruingReason: progress.notAccruingReason,
    allianceAttributionAccruedAmountCents: totals.accruedAmountCents,
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt),
  }
}

/**
 * Atribución de una empresa cliente a una alianza comercial
 * (USRH1789099318034 / USRH1789099318113). Crea, consulta, ajusta y cierra.
 *
 * La unicidad de la atribución viva se sostiene con `forUpdate` sobre
 * `business_units` (la fila padre siempre existe) y con el UNIQUE de
 * la columna generada. El alta a mano y el canje del código de una
 * alianza escriben por el mismo camino. El conflicto de dos vivas
 * responde 409 `PLT.ALL.ATTRIBUTION_ALREADY_LIVE`; canjear el código
 * de otra alianza con una viva responde 422
 * `PLT.ALL.ATTRIBUTION_OTHER_ALLIANCE` y no crea nada.
 */
export default class AllianceAttributionService {
  /**
   * Alta. El porcentaje y el plazo ausentes heredan del acuerdo general;
   * si vienen, se guardan los confirmados. `termPeriods: null` deja el
   * plazo indeterminado para este cliente.
   *
   * `assertCreatePayloadScalars` se llama con el JSON crudo, antes de Vine:
   * Vine convertiría `[13]` en `13` y `true` en `1`.
   */
  assertCreatePayloadScalars(body: unknown): void {
    assertCreateNumericFieldsAreScalar(body)
  }

  /**
   * Rechaza cambiar de dueño en el PATCH y los mismos tipos hostiles
   * del alta en porcentaje y plazo.
   */
  assertUpdatePayloadScalars(body: unknown): void {
    assertPatchDoesNotRewriteOwner(body)
    assertPatchNumericFieldsAreScalar(body)
  }

  /**
   * Alta a mano. El porcentaje y el plazo ausentes heredan del acuerdo
   * general; si vienen, se guardan los confirmados. `termPeriods: null`
   * deja el plazo indeterminado para este cliente.
   */
  async createAttribution(
    input: CreateAllianceAttributionInput
  ): Promise<AllianceAttributionView> {
    const created = await db.transaction(async (trx) => {
      return this.createAttributionWithin(input, trx)
    })

    return this.getAttribution(created.allianceAttributionId)
  }

  /**
   * Alta de atribución dentro de una transacción ya abierta. Única
   * escritura de atribución nueva: el alta a mano y el canje del código
   * de una alianza pasan por aquí, con las mismas reglas.
   */
  async createAttributionWithin(
    input: CreateAllianceAttributionInput,
    trx: TransactionClientContract
  ): Promise<AllianceAttribution> {
    assertPositiveAllianceId(input.allianceId)
    this.assertStartsAtCalendarDate(input.allianceAttributionStartsAt)

    const unit = await this.lockBusinessUnitByPublicId(input.businessUnitPublicId, trx)

    const live = await AllianceAttribution.query({ client: trx })
      .where('business_unit_id', unit.businessUnitId)
      .whereNull('alliance_attribution_closed_at')
      .first()

    if (live) {
      throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_ALREADY_LIVE)
    }

    const alliance = await this.getActiveAllianceForCreate(input.allianceId, trx)
    const commissionPercent =
      input.allianceAttributionCommissionPercent ?? alliance.allianceDefaultCommissionPercent
    const termPeriods =
      input.allianceAttributionTermPeriods === undefined
        ? alliance.allianceDefaultTermPeriods
        : input.allianceAttributionTermPeriods

    assertCommissionPercent(commissionPercent)
    assertTermPeriods(termPeriods)
    if (
      typeof termPeriods === 'number' &&
      (termPeriods > MYSQL_UNSIGNED_INT_MAX || !Number.isSafeInteger(termPeriods))
    ) {
      throwFromCatalog(ALLIANCE_ERRORS.TERM_PERIODS_INVALID)
    }

    try {
      return await AllianceAttribution.create(
        {
          allianceId: alliance.allianceId,
          businessUnitId: unit.businessUnitId,
          allianceAttributionCommissionPercent: commissionPercent,
          allianceAttributionTermPeriods: termPeriods,
          allianceAttributionStartsAt: DateTime.fromISO(input.allianceAttributionStartsAt, {
            zone: 'utc',
          }),
          allianceAttributionClosedAt: null,
          allianceAttributionCloseReason: null,
        },
        { client: trx }
      )
    } catch (error) {
      rethrowDuplicateLiveAttribution(error)
    }
  }

  /**
   * Si el código canjeado es de una alianza, deja a la empresa atribuida
   * a esa alianza en la misma transacción del alta. Misma alianza viva:
   * no-op. Otra alianza viva: rechaza el alta completo (422).
   */
  async attributeOnAllianceCodeRedeem(
    allianceId: number,
    businessUnitPublicId: string,
    trx: TransactionClientContract
  ): Promise<void> {
    assertPositiveAllianceId(allianceId)

    const unit = await this.lockBusinessUnitByPublicId(businessUnitPublicId, trx)
    const live = await AllianceAttribution.query({ client: trx })
      .where('business_unit_id', unit.businessUnitId)
      .whereNull('alliance_attribution_closed_at')
      .forUpdate()
      .first()

    if (live) {
      if (live.allianceId === allianceId) {
        return
      }
      throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_OTHER_ALLIANCE)
    }

    await this.createAttributionWithin(
      {
        allianceId,
        businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      },
      trx
    )
  }

  /**
   * Ajusta porcentaje, plazo o fecha de inicio de una atribución viva.
   * No toca alianza, empresa ni el acuerdo general.
   * El plazo no puede quedar por debajo de los periodos ya devengados;
   * igual a lo devengado se permite (deja la atribución agotada).
   */
  async updateAllianceAttribution(
    allianceAttributionId: number | string,
    input: UpdateAllianceAttributionInput
  ): Promise<AllianceAttributionView> {
    const id = parseAttributionId(allianceAttributionId)

    if (input.allianceAttributionStartsAt !== undefined) {
      this.assertStartsAtCalendarDate(input.allianceAttributionStartsAt)
    }
    if (input.allianceAttributionCommissionPercent !== undefined) {
      assertCommissionPercent(input.allianceAttributionCommissionPercent)
    }
    if (input.allianceAttributionTermPeriods !== undefined) {
      assertTermPeriods(input.allianceAttributionTermPeriods)
      if (
        typeof input.allianceAttributionTermPeriods === 'number' &&
        (input.allianceAttributionTermPeriods > MYSQL_UNSIGNED_INT_MAX ||
          !Number.isSafeInteger(input.allianceAttributionTermPeriods))
      ) {
        throwFromCatalog(ALLIANCE_ERRORS.TERM_PERIODS_INVALID)
      }
    }

    await db.transaction(async (trx) => {
      const row = await AllianceAttribution.query({ client: trx })
        .where('alliance_attribution_id', id)
        .forUpdate()
        .first()

      if (!row) {
        throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_NOT_FOUND)
      }

      if (row.allianceAttributionClosedAt) {
        throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_CLOSED_IMMUTABLE)
      }

      if (typeof input.allianceAttributionTermPeriods === 'number') {
        const accrued = await commissions.sumAccruedPeriods(id, trx)
        if (input.allianceAttributionTermPeriods < accrued) {
          throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_TERM_BELOW_ACCRUED)
        }
      }

      if (input.allianceAttributionCommissionPercent !== undefined) {
        row.allianceAttributionCommissionPercent = input.allianceAttributionCommissionPercent
      }
      if (input.allianceAttributionTermPeriods !== undefined) {
        row.allianceAttributionTermPeriods = input.allianceAttributionTermPeriods
      }
      if (input.allianceAttributionStartsAt !== undefined) {
        row.allianceAttributionStartsAt = DateTime.fromISO(input.allianceAttributionStartsAt, {
          zone: 'utc',
        })
      }

      await row.save()
    })

    return this.getAttribution(id)
  }

  /**
   * Cierra una atribución viva. Corta hacia adelante: solo escribe
   * closed_at, close_reason y updated_at. forUpdate sobre la propia fila.
   */
  async closeAllianceAttribution(
    allianceAttributionId: number | string,
    input: CloseAllianceAttributionInput
  ): Promise<AllianceAttributionView> {
    const id = parseAttributionId(allianceAttributionId)
    this.assertCloseDateCalendar(input.allianceAttributionClosedAt)

    await db.transaction(async (trx) => {
      const row = await AllianceAttribution.query({ client: trx })
        .where('alliance_attribution_id', id)
        .forUpdate()
        .first()

      if (!row) {
        throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_NOT_FOUND)
      }

      if (row.allianceAttributionClosedAt) {
        throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_ALREADY_CLOSED)
      }

      const startsAt = toCalendarIsoDate(row.allianceAttributionStartsAt)
      const today = toBusinessDateString()
      if (
        !startsAt ||
        input.allianceAttributionClosedAt < startsAt ||
        input.allianceAttributionClosedAt > today
      ) {
        throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_CLOSE_DATE_INVALID)
      }

      row.allianceAttributionClosedAt = DateTime.fromISO(input.allianceAttributionClosedAt, {
        zone: 'utc',
      }).startOf('day')
      row.allianceAttributionCloseReason = input.allianceAttributionCloseReason.trim()
      await row.save()
    })

    return this.getAttribution(id)
  }

  /**
   * Suma periodos y montos de un conjunto de atribuciones en una sola
   * consulta (`whereIn` + `GROUP BY`). Lectura informativa: sin
   * `forUpdate`. Sin filas para un id → el mapa no lo trae; el mapeador
   * usa ceros. `SUM` de MySQL llega como texto: se convierte con
   * `Number(...)`.
   */
  private async loadAccrualByAttribution(
    attributionIds: number[],
    client?: TransactionClientContract
  ): Promise<Map<number, AccrualTotals>> {
    const accrual = new Map<number, AccrualTotals>()
    if (attributionIds.length === 0) {
      return accrual
    }

    let query = db.from('alliance_commissions')
    if (client) {
      query = query.useTransaction(client)
    }

    const rows = (await query
      .whereIn('alliance_attribution_id', attributionIds)
      .groupBy('alliance_attribution_id')
      .select(
        'alliance_attribution_id',
        db.raw('SUM(alliance_commission_periods) AS accrued_periods'),
        db.raw('SUM(alliance_commission_amount_cents) AS accrued_amount_cents')
      )) as Array<{
      alliance_attribution_id?: number | string
      accrued_periods?: number | string | null
      accrued_amount_cents?: number | string | null
    }>

    for (const row of rows) {
      const attributionId = Number(row.alliance_attribution_id)
      if (!Number.isFinite(attributionId)) {
        continue
      }
      const accruedPeriods = Number(row.accrued_periods ?? 0)
      const accruedAmountCents = Number(row.accrued_amount_cents ?? 0)
      accrual.set(attributionId, {
        accruedPeriods: Number.isFinite(accruedPeriods) ? accruedPeriods : 0,
        accruedAmountCents: Number.isFinite(accruedAmountCents) ? accruedAmountCents : 0,
      })
    }

    return accrual
  }

  /**
   * Mapeador único de `AllianceAttributionView`. Quien llama ya trajo
   * el agregado; aquí no hay consultas.
   */
  private toAllianceAttributionViews(
    attributions: AllianceAttribution[],
    accrual: Map<number, AccrualTotals>
  ): AllianceAttributionView[] {
    return attributions.map((row) =>
      toAllianceAttributionView(
        row,
        row.alliance,
        row.businessUnit,
        accrual.get(row.allianceAttributionId) ?? EMPTY_ACCRUAL
      )
    )
  }

  /**
   * Consulta por id. 404 tipado si no existe, el id es inválido o está
   * retirada con soft delete.
   */
  async getAttribution(allianceAttributionId: number | string): Promise<AllianceAttributionView> {
    const id = parseAttributionId(allianceAttributionId)

    const row = await AllianceAttribution.query()
      .where('alliance_attribution_id', id)
      .preload('alliance')
      .preload('businessUnit')
      .first()

    if (!row) {
      throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_NOT_FOUND)
    }

    const accrual = await this.loadAccrualByAttribution([row.allianceAttributionId])
    const views = this.toAllianceAttributionViews([row], accrual)
    const view = views[0]
    if (!view) {
      throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_NOT_FOUND)
    }
    return view
  }

  /**
   * Histórico completo de un cliente, viva y cerradas, id descendente.
   * Sin atribuciones → arreglo vacío (la venta directa no es un error).
   * El avance de todo el conjunto se resuelve con una sola consulta
   * agregada, nunca una por atribución.
   */
  async listAttributionsByTenant(businessUnitPublicId: string): Promise<AllianceAttributionView[]> {
    assertBusinessUnitPublicIdShape(businessUnitPublicId)
    const unit = await this.findLiveBusinessUnitByPublicId(businessUnitPublicId)

    const rows = await AllianceAttribution.query()
      .where('business_unit_id', unit.businessUnitId)
      .preload('alliance')
      .preload('businessUnit')
      .orderBy('alliance_attribution_id', 'desc')

    const accrual = await this.loadAccrualByAttribution(rows.map((row) => row.allianceAttributionId))
    return this.toAllianceAttributionViews(rows, accrual)
  }

  /**
   * Listado paginado de atribuciones de una alianza, vivas y cerradas.
   * Orden: vivas primero; cerradas por fecha de cierre descendente; id
   * descendente. El avance se resuelve con un solo agregado por página.
   * Una empresa dada de baja sigue en la lista: su nombre se carga con
   * `withTrashed` para no perder el rastro de dinero.
   */
  async listAllianceAttributionsByAlliance(
    allianceId: number,
    filters: ListAllianceAttributionsByAllianceFilters = {}
  ): Promise<ListAllianceAttributionsByAllianceResult> {
    assertPositiveAllianceId(allianceId)

    const alliance = await Alliance.query().where('alliance_id', allianceId).first()
    if (!alliance) {
      throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
    }

    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)

    const paginated = await AllianceAttribution.query()
      .where('alliance_attributions.alliance_id', allianceId)
      .preload('alliance')
      .preload('businessUnit', (query) => {
        query.withTrashed()
      })
      .orderByRaw('alliance_attribution_closed_at IS NULL DESC')
      .orderBy('alliance_attribution_closed_at', 'desc')
      .orderBy('alliance_attribution_id', 'desc')
      .paginate(page, limit)

    const rows = paginated.all()
    const accrual = await this.loadAccrualByAttribution(
      rows.map((row) => row.allianceAttributionId)
    )

    return {
      data: this.toAllianceAttributionViews(rows, accrual),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit: paginated.perPage,
        lastPage: paginated.lastPage,
      },
    }
  }

  /**
   * `startsAt` tiene que ser un día civil real y no puede ser posterior
   * a hoy: la atribución ocupa el slot único de "viva" desde que se crea.
   * El regex del validador acepta `2026-02-31`; aquí se rechaza con 422
   * para no reventar en 500 al persistir.
   */
  private assertStartsAtCalendarDate(startsAt: string): void {
    const parsed = DateTime.fromISO(startsAt, { zone: 'utc' })
    if (!parsed.isValid || parsed.toISODate() !== startsAt) {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }

    if (startsAt > toBusinessDateString()) {
      throwFromCatalog(ALLIANCE_ERRORS.ATTRIBUTION_START_IN_FUTURE)
    }
  }

  private assertCloseDateCalendar(closedAt: string): void {
    const parsed = DateTime.fromISO(closedAt, { zone: 'utc' })
    if (!parsed.isValid || parsed.toISODate() !== closedAt) {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }
  }

  /**
   * Bloquea la fila padre del cliente. Un `FOR UPDATE` sobre el rango
   * vacío de atribuciones no toma candado; esta fila sí existe siempre.
   */
  private async lockBusinessUnitByPublicId(
    businessUnitPublicId: string,
    trx: TransactionClientContract
  ): Promise<BusinessUnit> {
    const unit = await BusinessUnit.query({ client: trx })
      .where('business_unit_public_id', businessUnitPublicId)
      .whereNull('business_unit_deleted_at')
      .forUpdate()
      .first()

    if (!unit) {
      throwFromCatalog(ALLIANCE_ERRORS.BUSINESS_UNIT_NOT_FOUND)
    }

    return unit
  }

  private async findLiveBusinessUnitByPublicId(
    businessUnitPublicId: string
  ): Promise<BusinessUnit> {
    const unit = await BusinessUnit.query()
      .where('business_unit_public_id', businessUnitPublicId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!unit) {
      throwFromCatalog(ALLIANCE_ERRORS.BUSINESS_UNIT_NOT_FOUND)
    }

    return unit
  }

  private async getActiveAllianceForCreate(
    allianceId: number,
    trx: TransactionClientContract
  ): Promise<Alliance> {
    const alliance = await Alliance.query({ client: trx })
      .where('alliance_id', allianceId)
      .whereNull('alliance_deleted_at')
      .forUpdate()
      .first()

    if (!alliance) {
      throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
    }

    if (alliance.allianceActive !== 1) {
      throwFromCatalog(ALLIANCE_ERRORS.INACTIVE)
    }

    return alliance
  }
}
