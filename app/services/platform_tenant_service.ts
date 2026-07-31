import db from '@adonisjs/lucid/services/db'
import { PLATFORM_TENANT_ERROR_CODES } from '../constants/platform_tenant_error_codes.js'
import { PlatformTenantServiceError } from '../exceptions/platform_tenant_service_error.js'
import { toCalendarIsoDate } from '../utils/business_date.js'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface TenantSubscriptionSnapshot {
  status: string
  planName: string | null
  contractedEmployees: number
  contractedUnitAmount: number
  contractedSubtotal: number
  contractedTaxAmount: number
  contractedTotal: number
  contractedTrialDays: number
  contractedEffectiveFrom: string | null
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
}

export interface TenantListItem {
  businessUnitPublicId: string
  businessUnitName: string
  businessUnitLegalName: string
  businessUnitActive: number
  activeEmployees: number
  subscription: TenantSubscriptionSnapshot | null
}

export interface TenantDetail extends TenantListItem {}

export interface ListTenantsFilters {
  search?: string
  status?: string
  page?: number
  limit?: number
}

export interface ListTenantsResult {
  data: TenantListItem[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

// ─── Helpers de serialización de fecha ───────────────────────────────────────

function toIsoDate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  return toCalendarIsoDate(value as Parameters<typeof toCalendarIsoDate>[0])
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export default class PlatformTenantService {
  /**
   * Listado paginado de empresas con su estado de suscripción resuelto y
   * su conteo agregado de empleados activos (no soft-deleted, no terminados).
   *
   * Por cada empresa se selecciona UNA suscripción: la viva primero
   * (live_business_unit_id IS NOT NULL), en caso de solo tener canceladas
   * la más reciente. Empresas sin ninguna suscripción aparecen con
   * `subscription: null`.
   */
  async listTenants(filters: ListTenantsFilters = {}): Promise<ListTenantsResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const offset = (page - 1) * limit

    // ── 1 + 2. Empresas que coinciden con los filtros de texto ────────────────
    const allIds = await this.fetchAllCompanyIds(filters.search)
    const allInternalIds = allIds.map((r) => r.buId)

    const SUB_SELECT_COLS = [
      'bs.business_unit_id as buId',
      'bs.billing_subscription_status as subscriptionStatus',
      'bp.billing_plan_name as planName',
      'bs.billing_subscription_contracted_employees as contractedEmployees',
      'bs.billing_subscription_contracted_unit_amount as contractedUnitAmount',
      'bs.billing_subscription_contracted_subtotal as contractedSubtotal',
      'bs.billing_subscription_contracted_tax_amount as contractedTaxAmount',
      'bs.billing_subscription_contracted_total as contractedTotal',
      'bs.billing_subscription_contracted_trial_days as contractedTrialDays',
      'bs.billing_subscription_contracted_effective_from as contractedEffectiveFrom',
      'bs.billing_subscription_trial_ends_at as trialEndsAt',
      'bs.billing_subscription_current_period_start as currentPeriodStart',
      'bs.billing_subscription_current_period_end as currentPeriodEnd',
      'bs.billing_subscription_canceled_at as canceledAt',
    ]

    // ── 3a. Suscripción "mejor" por empresa para mostrar en listado sin filtro
    // Viva (live_bu_id IS NOT NULL) primero; si solo hay canceladas, la más reciente.
    let subMap: Record<number, Record<string, unknown>> = {}
    if (allInternalIds.length > 0) {
      const subs = await db
        .from('billing_subscriptions as bs')
        .join('billing_plans as bp', 'bp.billing_plan_id', 'bs.billing_plan_id')
        .whereIn('bs.business_unit_id', allInternalIds)
        .whereNull('bs.billing_subscription_deleted_at')
        .whereRaw(
          `bs.billing_subscription_id = (
            SELECT billing_subscription_id FROM billing_subscriptions
            WHERE business_unit_id = bs.business_unit_id
              AND billing_subscription_deleted_at IS NULL
            ORDER BY (billing_subscription_live_business_unit_id IS NOT NULL) DESC,
                     created_at DESC
            LIMIT 1
          )`
        )
        .select(SUB_SELECT_COLS)

      for (const sub of subs as Array<Record<string, unknown>>) {
        subMap[sub.buId as number] = sub
      }
    }

    // ── 3b. Cuando se filtra por "canceled": mapa adicional con la cancelada
    // más reciente de cada empresa (independientemente de si también tiene activa)
    let canceledSubMap: Record<number, Record<string, unknown>> = {}
    if (filters.status === 'canceled' && allInternalIds.length > 0) {
      const canceledSubs = await db
        .from('billing_subscriptions as bs')
        .join('billing_plans as bp', 'bp.billing_plan_id', 'bs.billing_plan_id')
        .whereIn('bs.business_unit_id', allInternalIds)
        .whereNull('bs.billing_subscription_deleted_at')
        .where('bs.billing_subscription_status', 'canceled')
        .whereRaw(
          `bs.billing_subscription_id = (
            SELECT billing_subscription_id FROM billing_subscriptions
            WHERE business_unit_id = bs.business_unit_id
              AND billing_subscription_deleted_at IS NULL
              AND billing_subscription_status = 'canceled'
            ORDER BY created_at DESC
            LIMIT 1
          )`
        )
        .select(SUB_SELECT_COLS)

      for (const sub of canceledSubs as Array<Record<string, unknown>>) {
        canceledSubMap[sub.buId as number] = sub
      }
    }

    // ── 4. Aplicar filtro de status ───────────────────────────────────────────
    // Para "canceled": incluir empresas con CUALQUIER suscripción cancelada,
    // aunque también tengan una activa. Para otros estados: filtrar por el
    // estado de la suscripción "mejor".
    let filteredIds = allIds as Array<{ buId: number; buPublicId: string }>
    if (filters.status !== undefined) {
      if (filters.status === 'canceled') {
        filteredIds = filteredIds.filter((r) => canceledSubMap[r.buId] !== undefined)
      } else {
        filteredIds = filteredIds.filter(
          (r) => (subMap[r.buId] as Record<string, unknown> | undefined)?.subscriptionStatus === filters.status
        )
      }
    }

    const total = filteredIds.length
    const lastPage = Math.max(1, Math.ceil(total / limit))
    const pageIds = filteredIds.slice(offset, offset + limit)

    // ── 5. Datos completos de las empresas de esta página ─────────────────────
    let rows: Array<Record<string, unknown>> = []
    if (pageIds.length > 0) {
      rows = await db
        .from('business_units as bu')
        .whereIn(
          'bu.business_unit_id',
          pageIds.map((r) => r.buId)
        )
        .select([
          'bu.business_unit_id as buId',
          'bu.business_unit_public_id as businessUnitPublicId',
          'bu.business_unit_name as businessUnitName',
          'bu.business_unit_legal_name as businessUnitLegalName',
          'bu.business_unit_active as businessUnitActive',
        ])
        .orderBy('bu.business_unit_name', 'asc')
    }

    // ── 6. Conteo de empleados activos ────────────────────────────────────────
    const buPublicIds = rows.map((r) => r.businessUnitPublicId as string)
    let employeeCounts: Record<string, number> = {}
    if (buPublicIds.length > 0) {
      const counts = await db
        .from('employees as e')
        .join('business_units as bu2', 'bu2.business_unit_id', 'e.business_unit_id')
        .whereIn('bu2.business_unit_public_id', buPublicIds)
        .whereNull('e.employee_deleted_at')
        .whereNull('e.employee_terminated_date')
        .groupBy('bu2.business_unit_public_id')
        .select(['bu2.business_unit_public_id as publicId', db.raw('count(*) as cnt')])

      for (const c of counts as Array<{ publicId: string; cnt: string | number }>) {
        employeeCounts[c.publicId] = Number(c.cnt)
      }
    }

    // ── 7. Armar respuesta ────────────────────────────────────────────────────
    const data: TenantListItem[] = rows.map((r) => {
      const sub = this.pickSub(r.buId as number, filters.status, subMap, canceledSubMap)
      return this.toListItem(
        sub ? { ...r, ...sub } : r,
        employeeCounts[r.businessUnitPublicId as string] ?? 0
      )
    })

    return { data, meta: { total, page, limit, lastPage } }
  }

  /**
   * Detalle de una empresa por su `businessUnitPublicId`.
   *
   * @throws {PlatformTenantServiceError} si la empresa no existe.
   */
  async getTenantDetail(publicId: string): Promise<TenantDetail> {
    const bu = await db
      .from('business_units as bu')
      .whereNull('bu.business_unit_deleted_at')
      .where('bu.business_unit_public_id', publicId)
      .select([
        'bu.business_unit_id as buId',
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
        'bu.business_unit_legal_name as businessUnitLegalName',
        'bu.business_unit_active as businessUnitActive',
      ])
      .first()

    const row = bu as Record<string, unknown> | null

    if (!row) {
      throw new PlatformTenantServiceError(
        `Empresa ${publicId} no encontrada`,
        PLATFORM_TENANT_ERROR_CODES.NOT_FOUND,
        404,
        'tenant-no-encontrado',
        'La empresa solicitada no existe o no está disponible.'
      )
    }

    // ── Suscripción más relevante (viva primero, luego más reciente) ──────────
    const sub = await db
      .from('billing_subscriptions as bs')
      .join('billing_plans as bp', 'bp.billing_plan_id', 'bs.billing_plan_id')
      .where('bs.business_unit_id', row.buId as number)
      .whereNull('bs.billing_subscription_deleted_at')
      .whereRaw(
        `bs.billing_subscription_id = (
          SELECT billing_subscription_id FROM billing_subscriptions
          WHERE business_unit_id = ?
            AND billing_subscription_deleted_at IS NULL
          ORDER BY (billing_subscription_live_business_unit_id IS NOT NULL) DESC,
                   created_at DESC
          LIMIT 1
        )`,
        [row.buId as number]
      )
      .select([
        'bs.billing_subscription_status as subscriptionStatus',
        'bp.billing_plan_name as planName',
        'bs.billing_subscription_contracted_employees as contractedEmployees',
        'bs.billing_subscription_contracted_unit_amount as contractedUnitAmount',
        'bs.billing_subscription_contracted_subtotal as contractedSubtotal',
        'bs.billing_subscription_contracted_tax_amount as contractedTaxAmount',
        'bs.billing_subscription_contracted_total as contractedTotal',
        'bs.billing_subscription_contracted_trial_days as contractedTrialDays',
        'bs.billing_subscription_contracted_effective_from as contractedEffectiveFrom',
        'bs.billing_subscription_trial_ends_at as trialEndsAt',
        'bs.billing_subscription_current_period_start as currentPeriodStart',
        'bs.billing_subscription_current_period_end as currentPeriodEnd',
        'bs.billing_subscription_canceled_at as canceledAt',
      ])
      .first()

    const activeEmployees = await db
      .from('employees as e')
      .join('business_units as bu2', 'bu2.business_unit_id', 'e.business_unit_id')
      .where('bu2.business_unit_public_id', publicId)
      .whereNull('e.employee_deleted_at')
      .whereNull('e.employee_terminated_date')
      .count('* as cnt')
      .first()
      .then((r) => Number((r as { cnt: string | number } | null)?.cnt ?? 0))

    const merged = sub ? { ...row, ...(sub as Record<string, unknown>) } : row
    return this.toListItem(merged, activeEmployees)
  }

  // ─── Helpers internos ────────────────────────────────────────────────────────

  private async fetchAllCompanyIds(
    search?: string
  ): Promise<Array<{ buId: number; buPublicId: string }>> {
    const q = db
      .from('business_units as bu')
      .whereNull('bu.business_unit_deleted_at')
      .select(['bu.business_unit_id as buId', 'bu.business_unit_public_id as buPublicId'])
      .orderBy('bu.business_unit_name', 'asc')

    if (search) {
      const term = `%${search.toUpperCase()}%`
      q.where((inner) => {
        inner
          .whereRaw('UPPER(bu.business_unit_name) LIKE ?', [term])
          .orWhereRaw('UPPER(bu.business_unit_legal_name) LIKE ?', [term])
      })
    }

    return q as unknown as Promise<Array<{ buId: number; buPublicId: string }>>
  }

  /**
   * Elige la suscripción a mostrar para una empresa según el filtro activo.
   * Con filtro "canceled": devuelve la cancelada más reciente aunque también
   * exista una activa. Para otros filtros devuelve la suscripción "mejor"
   * (viva primero).
   */
  private pickSub(
    buId: number,
    status: string | undefined,
    subMap: Record<number, Record<string, unknown>>,
    canceledSubMap: Record<number, Record<string, unknown>>
  ): Record<string, unknown> | null {
    if (status === 'canceled') {
      return canceledSubMap[buId] ?? subMap[buId] ?? null
    }
    return subMap[buId] ?? null
  }

  // ─── Serialización ──────────────────────────────────────────────────────────

  private toListItem(row: Record<string, unknown>, activeEmployees: number): TenantListItem {
    const hasSubscription = row.subscriptionStatus !== null && row.subscriptionStatus !== undefined

    return {
      businessUnitPublicId: row.businessUnitPublicId as string,
      businessUnitName: row.businessUnitName as string,
      businessUnitLegalName: row.businessUnitLegalName as string,
      businessUnitActive: Number(row.businessUnitActive ?? 0),
      activeEmployees,
      subscription: hasSubscription
        ? {
            status: row.subscriptionStatus as string,
            planName: (row.planName as string | null) ?? null,
            contractedEmployees: Number(row.contractedEmployees ?? 0),
            contractedUnitAmount: Number(row.contractedUnitAmount ?? 0),
            contractedSubtotal: Number(row.contractedSubtotal ?? 0),
            contractedTaxAmount: Number(row.contractedTaxAmount ?? 0),
            contractedTotal: Number(row.contractedTotal ?? 0),
            contractedTrialDays: Number(row.contractedTrialDays ?? 0),
            contractedEffectiveFrom: toIsoDate(row.contractedEffectiveFrom),
            trialEndsAt: toIsoDate(row.trialEndsAt),
            currentPeriodStart: toIsoDate(row.currentPeriodStart),
            currentPeriodEnd: toIsoDate(row.currentPeriodEnd),
            canceledAt: toIsoDate(row.canceledAt),
          }
        : null,
    }
  }
}
