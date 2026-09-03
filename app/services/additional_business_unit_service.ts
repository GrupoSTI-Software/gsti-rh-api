import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { I18n } from '@adonisjs/i18n'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import type User from '#models/user'
import type BillingSubscription from '#models/billing_subscription'
import BusinessUnitService from '#services/business_unit_service'
import SystemSettingService from '#services/system_setting_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingTenantService from '#services/billing_tenant_service'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import {
  BUSINESS_UNIT_SLUG_MAX_ATTEMPTS,
  MAX_LIVE_BUSINESS_UNITS_PER_USER,
} from '../constants/business_unit.js'
import { ADDITIONAL_BUSINESS_UNIT_SKIPS_TRIAL } from '../helpers/contracted_employees_rules.js'
import { assertContractedEmployees } from '../helpers/contracted_employees_rules.js'
import {
  duplicateNameError,
  limitReachedError,
  slugConflictError,
} from '../helpers/business_unit_signup_errors.js'
import { toCalendarIsoDate, toBusinessDateString } from '../utils/business_date.js'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface CreateAdditionalBusinessUnitInput {
  businessUnitName: string
  businessUnitLegalName?: string
  billingPlanId: number
  contractedEmployees: number
  user: User
}

/** Reproduce campo a campo `ContractSubscriptionResult` de `billing_tenant_service.ts`
 * para que el front tenga un único parser; se calcula aquí porque
 * `firstPaymentDate` debe ser `trialEndsAt ?? hoy`, no `hoy` incondicionalmente. */
export interface AdditionalBusinessUnitSubscriptionResult {
  billingSubscriptionId: number
  billingPlanId: number
  billingPlanName: string
  billingSubscriptionStatus: BillingSubscription['billingSubscriptionStatus']
  billingSubscriptionContractedEmployees: number
  billingSubscriptionContractedUnitAmount: number
  billingSubscriptionDiscountPercent: number
  billingSubscriptionContractedCurrency: string
  billingSubscriptionContractedTaxRate: number
  billingSubscriptionContractedSubtotal: number
  billingSubscriptionContractedTaxAmount: number
  billingSubscriptionContractedTotal: number
  billingSubscriptionContractedTrialDays: number
  billingSubscriptionTrialEndsAt: string | null
  firstPaymentDate: string
}

export interface AdditionalBusinessUnitResult {
  businessUnit: {
    businessUnitPublicId: string
    businessUnitName: string
    businessUnitLegalName: string
    businessUnitOrigin: string
    businessUnitActive: number
  }
  subscription: AdditionalBusinessUnitSubscriptionResult
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/**
 * Alta de empresa adicional para un usuario ya autenticado con plan activo
 * (USRH1787932877001).
 *
 * Garantías:
 * - Transacción todo-o-nada: `business_units → business_unit_users →
 *   system_settings → billing_subscriptions`.
 * - FOR UPDATE por índice: se adquiere sobre las filas de `business_units` del
 *   usuario resueltas desde `business_unit_users.user_id` (indexado), no sobre
 *   toda la tabla.
 * - Sin periodo de prueba (`ADDITIONAL_BUSINESS_UNIT_SKIPS_TRIAL = true`).
 * - Reintentos acotados ante colisión de slug (hermana -01).
 */
export default class AdditionalBusinessUnitService {
  async createAdditionalBusinessUnit(
    input: CreateAdditionalBusinessUnitInput
  ): Promise<AdditionalBusinessUnitResult> {
    const { billingPlanId, contractedEmployees, user } = input

    // 3.1 Validación de cantidad — pura, sin I/O (falla rápido)
    assertContractedEmployees(contractedEmployees)

    // 3.2 Plan vendible / con precio vigente — fuera de la transacción
    //     Lanza BillingSubscriptionServiceError (PLT.SUB.*) que el resolver propaga.
    const tenantService = new BillingTenantService()
    await tenantService.assertPlanReadyToSubscribe(billingPlanId)

    // Instancias de servicios compartidos por el bucle de reintento de slug
    const buService = new BusinessUnitService(
      { formatMessage: (k: string) => k } as unknown as I18n
    )
    const systemSettingService = new SystemSettingService()
    const subscriptionService = new BillingSubscriptionService()

    // 3.3 Slug opaco fuera de la transacción (USRH1787932877000)
    let slug = buService.generateOpaqueSlug()
    let slugAttempt = 1

    for (;;) {
      try {
        // 3.4 Transacción todo-o-nada
        const result = await db.transaction(async (trx: TransactionClientContract) => {
          // 3.4a FOR UPDATE indexada (CA-10):
          //   Paso 1 — IDs de empresas del usuario via business_unit_users.user_id (indexado)
          const pivotRows = await trx
            .from('business_unit_users')
            .where('user_id', user.userId)
            .select('business_unit_id')

          const buIds: number[] = pivotRows.map(
            (r: { business_unit_id: number }) => r.business_unit_id
          )

          //   Paso 2 — LOCK sobre las filas de business_units activas del scope (PK)
          const liveUnits: BusinessUnit[] =
            buIds.length > 0
              ? await BusinessUnit.query({ client: trx })
                  .whereIn('business_unit_id', buIds)
                  .where('business_unit_active', 1)
                  .whereNull('business_unit_deleted_at')
                  .forUpdate()
              : []

          // Tope de empresas vivas por cuenta (CA-11)
          if (liveUnits.length >= MAX_LIVE_BUSINESS_UNITS_PER_USER) {
            throw limitReachedError()
          }

          // Nombre duplicado entre las empresas vivas del mismo usuario (CA-9)
          const normalizedName = input.businessUnitName.toLowerCase().trim()
          const isDuplicate = liveUnits.some(
            (u) => u.businessUnitName.toLowerCase().trim() === normalizedName
          )
          if (isDuplicate) {
            throw duplicateNameError()
          }

          // 3.4b Crear la empresa
          const buData = new BusinessUnit()
          buData.businessUnitName = input.businessUnitName
          buData.businessUnitSlug = slug
          // business_unit_legal_name es NOT NULL: copia el nombre si no viene
          buData.businessUnitLegalName = input.businessUnitLegalName ?? input.businessUnitName
          buData.businessUnitActive = 1
          // 'self_service' habilita las reglas comerciales (USRH1783712837572)
          buData.businessUnitOrigin = 'self_service'
          const newBu = await buService.create(buData, trx)

          // 3.4c Vincular usuario (UNIQUE business_unit_id + user_id)
          //     useTransaction hace que related().attach() use la misma TRX.
          user.useTransaction(trx)
          await user.related('businessUnits').attach([newBu.businessUnitId])

          // 3.4d Configuración mínima del tenant nuevo
          await systemSettingService.createForTenant(
            newBu.businessUnitId,
            slug,
            newBu.businessUnitName,
            trx
          )

          // 3.4e Suscripción — sin periodo de prueba (ADDITIONAL_BUSINESS_UNIT_SKIPS_TRIAL)
          const subscription = await subscriptionService.createSubscription(
            {
              businessUnitPublicId: newBu.businessUnitPublicId,
              billingPlanId,
              contractedEmployees,
              skipTrial: ADDITIONAL_BUSINESS_UNIT_SKIPS_TRIAL,
            },
            trx
          )

          return { newBu, subscription }
        })

        // 4. Fuera de la transacción: cargar relación plan, contar empresas
        //    vivas del creador y notificar fire-and-forget (USRH1787932877001).
        await result.subscription.load('plan')
        const billingPlanName =
          result.subscription.plan?.billingPlanName ?? `Plan #${billingPlanId}`

        const creatorLiveBusinessUnitCount = await this.countLiveBusinessUnits(user.userId)

        new BillingInternalNotificationService()
          .notifySelfServiceSubscriptionCreated({
            subscription: result.subscription,
            businessUnitName: result.newBu.businessUnitName,
            billingPlanName,
            origin: 'additional',
            creatorLiveBusinessUnitCount,
          })
          .catch((notifyErr: unknown) => {
            logger.error(
              { err: notifyErr },
              'AdditionalBusinessUnitService: fallo al enviar notificación interna.'
            )
          })

        return this.toResult(result.newBu, result.subscription)
      } catch (error: unknown) {
        // Colisión de slug: regenerar y reintentar (exactamente igual que signup_draft_service.ts)
        if (buService.isSlugDuplicateError(error)) {
          if (slugAttempt >= BUSINESS_UNIT_SLUG_MAX_ATTEMPTS) {
            logger.error(
              { err: error, intento: slugAttempt },
              'AdditionalBusinessUnitService: agotados los intentos para asignar slug.'
            )
            throw slugConflictError()
          }
          slug = buService.generateOpaqueSlug()
          slugAttempt++
          logger.warn(
            { intento: slugAttempt },
            'AdditionalBusinessUnitService: colisión de slug, reintentando.'
          )
          continue
        }

        throw error
      }
    }
  }

  /**
   * Número de empresas activas vinculadas al usuario (incluida la recién creada).
   * Se llama FUERA de la transacción para que refleje el estado ya persistido.
   */
  private async countLiveBusinessUnits(userId: number): Promise<number> {
    const row = await db
      .from('business_unit_users as buu')
      .join('business_units as bu', 'bu.business_unit_id', 'buu.business_unit_id')
      .where('buu.user_id', userId)
      .where('bu.business_unit_active', 1)
      .whereNull('bu.business_unit_deleted_at')
      .count('* as total')
      .first()
    return Number((row as { total: number } | null)?.total ?? 0)
  }

  private toResult(
    bu: BusinessUnit,
    subscription: BillingSubscription
  ): AdditionalBusinessUnitResult {
    const trialEndsAtIso = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
    // firstPaymentDate = trialEndsAt ?? hoy
    // No debe ser `toBusinessDateString()` incondicionalmente como en toContractSubscriptionResult(),
    // porque esa función solo se llama con skipTrial:true y no considera el trial.
    const firstPaymentDate = trialEndsAtIso ?? toBusinessDateString()

    return {
      businessUnit: {
        businessUnitPublicId: bu.businessUnitPublicId,
        businessUnitName: bu.businessUnitName,
        businessUnitLegalName: bu.businessUnitLegalName,
        businessUnitOrigin: bu.businessUnitOrigin,
        businessUnitActive: bu.businessUnitActive,
      },
      subscription: {
        billingSubscriptionId: subscription.billingSubscriptionId,
        billingPlanId: subscription.billingPlanId,
        billingPlanName: subscription.plan?.billingPlanName ?? '',
        billingSubscriptionStatus: subscription.billingSubscriptionStatus,
        billingSubscriptionContractedEmployees:
          subscription.billingSubscriptionContractedEmployees,
        billingSubscriptionContractedUnitAmount: Number(
          subscription.billingSubscriptionContractedUnitAmount
        ),
        billingSubscriptionDiscountPercent: subscription.billingSubscriptionDiscountPercent,
        billingSubscriptionContractedCurrency: subscription.billingSubscriptionContractedCurrency,
        billingSubscriptionContractedTaxRate: Number(
          subscription.billingSubscriptionContractedTaxRate
        ),
        billingSubscriptionContractedSubtotal: Number(
          subscription.billingSubscriptionContractedSubtotal
        ),
        billingSubscriptionContractedTaxAmount: Number(
          subscription.billingSubscriptionContractedTaxAmount
        ),
        billingSubscriptionContractedTotal: Number(subscription.billingSubscriptionContractedTotal),
        billingSubscriptionContractedTrialDays: subscription.billingSubscriptionContractedTrialDays,
        billingSubscriptionTrialEndsAt: trialEndsAtIso,
        firstPaymentDate,
      },
    }
  }
}
