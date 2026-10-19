import logger from '@adonisjs/core/services/logger'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import BusinessUnit from '#models/business_unit'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import type { TenantBillingProfileView } from '../interfaces/tenant_billing_profile_interface.js'
import { resolveBillingProvider } from '#modules/billing-provider/billing_provider.registry'
import {
  BILLING_PROVIDER_KEYS,
  isBillingCustomerIdentityProvider,
  type ProviderCustomerAddress,
  type ProviderCustomerContact,
  type ProviderCustomerIdentity,
} from '#modules/billing-provider/billing_provider.port'
import TenantBillingProfileService from '#services/tenant_billing_profile_service'
import { TenantContext } from '#utils/tenant_context'

export type BillingCustomerIdentitySyncTrigger = 'signup' | 'profile' | 'plan'

const IDENTITY_SYNC_FAILURE_TITLE = 'Identidad del tenant no sincronizada en Stripe'
const IDENTITY_SYNC_FAILURE_DETAIL =
  'No se pudo actualizar el cliente o la suscripción de Stripe con los datos de la empresa; se reintenta en el siguiente cambio de datos de facturación o de plan.'
const IDENTITY_SYNC_FAILURE_KEY = 'identidad-del-tenant-no-sincronizada-en-stripe'

export function toProviderCustomerAddress(view: TenantBillingProfileView): ProviderCustomerAddress {
  const line1Parts = [view.street, view.exteriorNumber].filter(
    (part): part is string => part !== null && part !== ''
  )
  const line2Parts = [view.interiorNumber, view.neighborhood].filter(
    (part): part is string => part !== null && part !== ''
  )
  return {
    line1: line1Parts.length > 0 ? line1Parts.join(' ') : null,
    line2: line2Parts.length > 0 ? line2Parts.join(', ') : null,
    city: view.municipality,
    state: view.state,
    postalCode: view.postalCode,
  }
}

export default class BillingCustomerIdentityService {
  constructor(private readonly profileService = new TenantBillingProfileService()) {}

  async syncForSubscription(
    billingSubscriptionId: number,
    trigger: BillingCustomerIdentitySyncTrigger
  ): Promise<void> {
    try {
      const sub = await BillingSubscription.query()
        .where('billing_subscription_id', billingSubscriptionId)
        .whereNull('billing_subscription_deleted_at')
        .first()
      if (sub === null) {
        return
      }
      await this.syncSubscriptionRow(sub, trigger)
    } catch (error) {
      this.logSyncFailure(error, trigger, billingSubscriptionId, null)
    }
  }

  async syncForBusinessUnit(
    businessUnitId: number,
    trigger: BillingCustomerIdentitySyncTrigger
  ): Promise<void> {
    try {
      const sub = await BillingSubscription.query()
        .where('business_unit_id', businessUnitId)
        .where('billing_subscription_provider', BILLING_PROVIDER_KEYS.STRIPE)
        .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
        .whereNull('billing_subscription_deleted_at')
        .orderBy('billing_subscription_id', 'desc')
        .first()
      if (sub === null) {
        return
      }
      await this.syncSubscriptionRow(sub, trigger)
    } catch (error) {
      this.logSyncFailure(error, trigger, null, businessUnitId)
    }
  }

  private async syncSubscriptionRow(
    sub: BillingSubscription,
    trigger: BillingCustomerIdentitySyncTrigger
  ): Promise<void> {
    if (sub.billingSubscriptionProvider !== BILLING_PROVIDER_KEYS.STRIPE) {
      return
    }
    if (!LIVE_SUBSCRIPTION_STATUSES.includes(sub.billingSubscriptionStatus)) {
      return
    }
    const customerRef = sub.billingSubscriptionStripeCustomerId
    const subscriptionRef = sub.billingSubscriptionStripeSubscriptionId
    if (customerRef === null || subscriptionRef === null) {
      return
    }

    let provider
    try {
      provider = resolveBillingProvider(sub.billingSubscriptionProvider)
    } catch (error) {
      this.logSyncFailure(error, trigger, sub.billingSubscriptionId, sub.businessUnitId)
      return
    }
    if (!isBillingCustomerIdentityProvider(provider)) {
      return
    }

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', sub.businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()
    if (businessUnit === null) {
      logger.warn(
        {
          operation: 'syncCustomerIdentity',
          trigger,
          billingSubscriptionId: sub.billingSubscriptionId,
          businessUnitId: sub.businessUnitId,
        },
        'Identidad del tenant: empresa no encontrada; se omite sincronización con Stripe'
      )
      return
    }

    let profileView: TenantBillingProfileView | null = null
    let profileUpdatedAt = 'none'
    try {
      profileView = await TenantContext.run([sub.businessUnitId], () =>
        this.profileService.getForTenant(sub.businessUnitId)
      )
      profileUpdatedAt = profileView.updatedAt ?? 'none'
    } catch {
      profileView = null
    }

    let name: string | null
    let contact: ProviderCustomerContact | null
    if (profileView !== null && profileView.exists) {
      name = profileView.legalName
      contact = {
        billingEmail: profileView.billingEmail,
        address: toProviderCustomerAddress(profileView),
      }
    } else {
      name = businessUnit.businessUnitLegalName
      contact = null
    }

    const version = `${sub.updatedAt?.toMillis() ?? 0}-${profileUpdatedAt}`

    const identity: ProviderCustomerIdentity = {
      customerRef,
      subscriptionRef,
      billingSubscriptionId: sub.billingSubscriptionId,
      businessUnitId: sub.businessUnitId,
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: sub.billingPlanId,
      billingPlanPriceId: sub.billingPlanPriceId,
      name,
      contact,
      version,
    }

    try {
      await provider.syncCustomerIdentity(identity)
      logger.info({
        operation: 'syncCustomerIdentity',
        trigger,
        billingSubscriptionId: sub.billingSubscriptionId,
        businessUnitId: sub.businessUnitId,
      })
    } catch (error) {
      this.logSyncFailure(error, trigger, sub.billingSubscriptionId, sub.businessUnitId)
    }
  }

  private logSyncFailure(
    error: unknown,
    trigger: BillingCustomerIdentitySyncTrigger,
    billingSubscriptionId: number | null,
    businessUnitId: number | null
  ): void {
    if (error instanceof BillingProviderServiceError) {
      if (error.errorCode === BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED) {
        logger.info({
          operation: 'syncCustomerIdentity',
          trigger,
          billingSubscriptionId,
          businessUnitId,
          title: IDENTITY_SYNC_FAILURE_TITLE,
          detail: IDENTITY_SYNC_FAILURE_DETAIL,
          key: IDENTITY_SYNC_FAILURE_KEY,
          code: error.errorCode,
        })
        return
      }
      logger.warn({
        operation: 'syncCustomerIdentity',
        trigger,
        billingSubscriptionId,
        businessUnitId,
        title: IDENTITY_SYNC_FAILURE_TITLE,
        detail: IDENTITY_SYNC_FAILURE_DETAIL,
        key: IDENTITY_SYNC_FAILURE_KEY,
        code: error.errorCode,
      })
      return
    }

    const err = error instanceof Error ? error : new Error(String(error))
    logger.warn({
      operation: 'syncCustomerIdentity',
      trigger,
      billingSubscriptionId,
      businessUnitId,
      title: IDENTITY_SYNC_FAILURE_TITLE,
      detail: IDENTITY_SYNC_FAILURE_DETAIL,
      key: IDENTITY_SYNC_FAILURE_KEY,
      code: BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED,
      errorName: err.name,
    })
  }
}
