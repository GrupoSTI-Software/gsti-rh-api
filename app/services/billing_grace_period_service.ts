import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PlatformBillingSetting from '#models/platform_billing_setting'
import { toBusinessDateString } from '#utils/business_date'
import { BILLING_GRACE_DAYS_DEFAULT } from '../helpers/contracted_employees_rules.js'

/** TTL de la caché del ajuste: 60 segundos (también la usa la decisión de acceso limitado). */
export const BILLING_GRACE_SETTING_CACHE_TTL_MS = 60_000

export interface PlatformBillingSettingActor {
  userId: number
  userEmail: string
}

/** La fecha de encendido solo existe con la bandera encendida: el typecheck rechaza la mezcla. */
export type BillingRestrictionState =
  | { restrictionEnabled: true; restrictionEnabledOn: string }
  | { restrictionEnabled: false; restrictionEnabledOn: null }

export type BillingGraceSettingOrigin =
  | { source: 'default'; platformBillingSettingId: null; updatedAt: null; updatedBy: null }
  | {
      source: 'configured'
      platformBillingSettingId: number
      updatedAt: string
      updatedBy: PlatformBillingSettingActor
    }

export type EffectiveBillingGraceSetting = { graceDays: number } & BillingRestrictionState &
  BillingGraceSettingOrigin

export interface UpdateBillingGraceSettingInput {
  graceDays: number
  restrictionEnabled: boolean
}

export interface PlatformBillingSettingHistoryItem {
  platformBillingSettingId: number
  graceDays: number
  restrictionEnabled: boolean
  restrictionEnabledOn: string | null
  createdAt: string
  createdBy: PlatformBillingSettingActor
}

export interface PlatformBillingSettingHistoryPage {
  data: PlatformBillingSettingHistoryItem[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

function toEffective(row: PlatformBillingSetting): EffectiveBillingGraceSetting {
  const isEnabled = row.platformBillingSettingRestrictionEnabled
  const enabledOnStr = row.platformBillingSettingRestrictionEnabledOn
    ? row.platformBillingSettingRestrictionEnabledOn.toISODate()
    : null

  const actor: PlatformBillingSettingActor = {
    userId: row.createdBy.userId,
    userEmail: row.createdBy.userEmail,
  }

  const baseOrigin: BillingGraceSettingOrigin = {
    source: 'configured',
    platformBillingSettingId: row.platformBillingSettingId,
    updatedAt: row.platformBillingSettingCreatedAt.toUTC().toISO()!,
    updatedBy: actor,
  }

  if (isEnabled) {
    return {
      graceDays: row.platformBillingSettingGraceDays,
      restrictionEnabled: true,
      restrictionEnabledOn: enabledOnStr!,
      ...baseOrigin,
    }
  }

  return {
    graceDays: row.platformBillingSettingGraceDays,
    restrictionEnabled: false,
    restrictionEnabledOn: null,
    ...baseOrigin,
  }
}

function toHistoryItem(row: PlatformBillingSetting): PlatformBillingSettingHistoryItem {
  return {
    platformBillingSettingId: row.platformBillingSettingId,
    graceDays: row.platformBillingSettingGraceDays,
    restrictionEnabled: row.platformBillingSettingRestrictionEnabled,
    restrictionEnabledOn: row.platformBillingSettingRestrictionEnabledOn
      ? row.platformBillingSettingRestrictionEnabledOn.toISODate()
      : null,
    createdAt: row.platformBillingSettingCreatedAt.toUTC().toISO()!,
    createdBy: {
      userId: row.createdBy.userId,
      userEmail: row.createdBy.userEmail,
    },
  }
}

/** Caché de una sola entrada, por proceso. `now` inyectable para probar el TTL sin dormir. */
class BillingGraceSettingCache {
  private entry: { value: EffectiveBillingGraceSetting; storedAt: number } | null = null

  get(now: number = Date.now()): EffectiveBillingGraceSetting | undefined {
    if (!this.entry) return undefined
    if (now - this.entry.storedAt >= BILLING_GRACE_SETTING_CACHE_TTL_MS) {
      this.entry = null
      return undefined
    }
    return this.entry.value
  }

  set(value: EffectiveBillingGraceSetting, now: number = Date.now()): void {
    this.entry = { value, storedAt: now }
  }

  invalidate(): void {
    this.entry = null
  }
}

export const billingGraceSettingCache = new BillingGraceSettingCache()

const DEFAULT_SETTING: EffectiveBillingGraceSetting = {
  graceDays: BILLING_GRACE_DAYS_DEFAULT,
  restrictionEnabled: false,
  restrictionEnabledOn: null,
  source: 'default',
  platformBillingSettingId: null,
  updatedAt: null,
  updatedBy: null,
}

export default class BillingGracePeriodService {
  /** Ajuste vigente: caché de 60 s; sin filas, el default con la bandera apagada. */
  async getEffectiveSetting(): Promise<EffectiveBillingGraceSetting> {
    const cached = billingGraceSettingCache.get()
    if (cached) return cached
    const row = await PlatformBillingSetting.query()
      .preload('createdBy')
      .orderBy('platform_billing_setting_id', 'desc')
      .first()
    const value = row ? toEffective(row) : DEFAULT_SETTING
    billingGraceSettingCache.set(value)
    return value
  }

  /**
   * Inserta una fila si algo cambió. La fecha de encendido se fija al pasar de
   * apagada a encendida, se ARRASTRA de la fila vigente mientras siga encendida
   * y se borra al apagar (VLRH-C0178 R4). `today` inyectable para las pruebas.
   */
  async updateSetting(
    input: UpdateBillingGraceSettingInput,
    actorUserId: number,
    today: string = toBusinessDateString()
  ): Promise<{ setting: EffectiveBillingGraceSetting; changed: boolean }> {
    const result = await db.transaction(async (trx) => {
      const current = await PlatformBillingSetting.query({ client: trx })
        .orderBy('platform_billing_setting_id', 'desc')
        .forUpdate()
        .first()

      if (
        current &&
        current.platformBillingSettingGraceDays === input.graceDays &&
        current.platformBillingSettingRestrictionEnabled === input.restrictionEnabled
      ) {
        return { id: current.platformBillingSettingId, changed: false }
      }

      const enabledOn = !input.restrictionEnabled
        ? null
        : current?.platformBillingSettingRestrictionEnabled &&
            current.platformBillingSettingRestrictionEnabledOn
          ? current.platformBillingSettingRestrictionEnabledOn
          : DateTime.fromISO(today)

      const created = await PlatformBillingSetting.create(
        {
          platformBillingSettingGraceDays: input.graceDays,
          platformBillingSettingRestrictionEnabled: input.restrictionEnabled,
          platformBillingSettingRestrictionEnabledOn: enabledOn,
          platformBillingSettingCreatedByUserId: actorUserId,
        },
        { client: trx }
      )
      return { id: created.platformBillingSettingId, changed: true }
    })

    if (result.changed) billingGraceSettingCache.invalidate()
    const row = await PlatformBillingSetting.query()
      .preload('createdBy')
      .where('platform_billing_setting_id', result.id)
      .firstOrFail()
    return { setting: toEffective(row), changed: result.changed }
  }

  /** Historial completo, del más reciente al más antiguo, paginado por la PK. */
  async listSettingHistory(page: number, limit: number): Promise<PlatformBillingSettingHistoryPage> {
    const paginator = await PlatformBillingSetting.query()
      .preload('createdBy')
      .orderBy('platform_billing_setting_id', 'desc')
      .paginate(page, limit)
    return {
      data: paginator.all().map(toHistoryItem),
      meta: {
        total: paginator.total,
        page: paginator.currentPage,
        limit: paginator.perPage,
        lastPage: paginator.lastPage,
      },
    }
  }
}