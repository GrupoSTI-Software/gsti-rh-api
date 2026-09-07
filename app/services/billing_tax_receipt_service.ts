import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import {
  BILLING_TAX_RECEIPT_DEFAULT_ISSUER,
  BILLING_TAX_RECEIPT_LIVE_STATUS,
  BILLING_TAX_RECEIPT_PAYMENT_LIVE_UNIQUE,
  BILLING_TAX_RECEIPT_UUID_PATTERN,
  BILLING_TAX_RECEIPT_UUID_UNIQUE,
} from '#constants/billing_tax_receipt'
import {
  BILLING_TAX_RECEIPT_ERRORS,
  type BillingTaxReceiptErrorDefinition,
} from '#constants/billing_tax_receipt_error_codes'
import {
  BillingTaxReceiptServiceError,
  type BillingTaxReceiptErrorData,
} from '#exceptions/billing_tax_receipt_service_error'
import { hasFinancialSnapshot } from '#helpers/billing_payment_financial_snapshot'
import { computeBillingProfileCompleteness } from '#helpers/tenant_billing_profile_completeness'
import type { BillingTaxReceiptStatus } from '#models/billing_tax_receipt'
import BillingPayment from '#models/billing_payment'
import BillingSubscription from '#models/billing_subscription'
import BillingTaxReceipt from '#models/billing_tax_receipt'
import SatCfdiUse from '#models/sat_cfdi_use'
import SatTaxRegime from '#models/sat_tax_regime'
import TenantBillingProfile from '#models/tenant_billing_profile'

export interface CreateTaxReceiptInput {
  uuid: string
  series: string | null
  folio: string | null
  stampedAt: DateTime
}

export interface TaxReceiptView {
  billingTaxReceiptId: number
  billingPaymentId: number
  billingSubscriptionId: number
  uuid: string
  series: string | null
  folio: string | null
  stampedAt: string
  status: BillingTaxReceiptStatus
  issuer: string
  receiver: {
    rfc: string | null
    legalName: string
    postalCode: string | null
    taxRegimeCode: string | null
    taxRegimeLabel: string | null
    cfdiUseCode: string | null
    cfdiUseLabel: string | null
  }
  amounts: {
    subtotalCents: number
    discountAmountCents: number
    taxAmountCents: number
    totalCents: number
    taxRate: number
  }
  xmlAvailable: boolean
  pdfAvailable: boolean
  cancellation: null
}

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'
const ER_DUP_ENTRY_ERRNO = 1062

/**
 * Alta y lectura del comprobante fiscal de membresía (USRH1788288461963).
 *
 * El candado de unicidad es la base de datos, no un SELECT previo. El INSERT
 * corre en transacción y `ER_DUP_ENTRY` (1062) se traduce por el nombre del
 * índice a los dos 409 del catálogo.
 */
export default class BillingTaxReceiptService {
  /**
   * Registra un comprobante `issued` colgado del pago. La suscripción se
   * deduce del pago; el receptor y los importes se leen dentro de la
   * transacción, nunca del request.
   */
  async create(paymentId: number, input: CreateTaxReceiptInput): Promise<BillingTaxReceipt> {
    if (!BILLING_TAX_RECEIPT_UUID_PATTERN.test(input.uuid.trim())) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT)
    }

    try {
      return await db.transaction(async (trx) => {
        const payment = await BillingPayment.query({ client: trx })
          .where('billingPaymentId', paymentId)
          .first()

        if (!payment) {
          throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.PAYMENT_NOT_FOUND)
        }

        const subscription = await BillingSubscription.query({ client: trx })
          .where('billingSubscriptionId', payment.billingSubscriptionId)
          .first()

        if (!subscription) {
          throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.PAYMENT_NOT_FOUND)
        }

        if (!hasFinancialSnapshot(payment.billingPaymentTotalCents)) {
          throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT)
        }

        const profile = await TenantBillingProfile.query({ client: trx })
          .where('businessUnitId', subscription.businessUnitId)
          .first()

        const completeness = computeBillingProfileCompleteness(
          profile
            ? {
                rfc: profile.rfc,
                legalName: profile.legalName,
                postalCode: profile.postalCode,
                taxRegimeCode: profile.taxRegimeCode,
                cfdiUseCode: profile.cfdiUseCode,
              }
            : {
                rfc: null,
                legalName: '',
                postalCode: null,
                taxRegimeCode: null,
                cfdiUseCode: null,
              }
        )

        if (!completeness.complete || !profile) {
          throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.BILLING_PROFILE_INCOMPLETE, {
            missingFields: completeness.missingFields,
          })
        }

        return BillingTaxReceipt.create(
          {
            billingPaymentId: payment.billingPaymentId,
            billingSubscriptionId: payment.billingSubscriptionId,
            uuid: input.uuid.trim().toUpperCase(),
            series: this.normalizeOptional(input.series),
            folio: this.normalizeOptional(input.folio),
            stampedAt: input.stampedAt,
            status: BILLING_TAX_RECEIPT_LIVE_STATUS,
            issuer: BILLING_TAX_RECEIPT_DEFAULT_ISSUER,
            rfc: profile.rfc,
            legalName: profile.legalName,
            postalCode: profile.postalCode,
            taxRegimeCode: profile.taxRegimeCode,
            cfdiUseCode: profile.cfdiUseCode,
            subtotalCents: payment.billingPaymentSubtotalCents,
            discountAmountCents: payment.billingPaymentDiscountAmountCents,
            taxAmountCents: payment.billingPaymentTaxAmountCents,
            totalCents: payment.billingPaymentTotalCents,
            taxRate: Number(payment.billingPaymentTaxRate),
          },
          { client: trx }
        )
      })
    } catch (error) {
      this.rethrowDuplicateIndex(error)
    }
  }

  /**
   * Lectura del comprobante vivo del pago. Pago inexistente → 404.
   * Pago sin vivo (o solo cancelados) → `null`, nunca 404.
   */
  async getLiveByPayment(paymentId: number): Promise<TaxReceiptView | null> {
    const payment = await BillingPayment.query().where('billingPaymentId', paymentId).first()

    if (!payment) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.PAYMENT_NOT_FOUND)
    }

    const receipt = await BillingTaxReceipt.query()
      .where('billingPaymentId', paymentId)
      .where('status', BILLING_TAX_RECEIPT_LIVE_STATUS)
      .first()

    if (!receipt) {
      return null
    }

    return this.toView(receipt)
  }

  /**
   * DTO plano armado a mano. Nunca `.serialize()` del modelo (el RFC no
   * viaja por serialización). `xmlAvailable`/`pdfAvailable`/`cancellation`
   * se declaran y quedan reservados para las rebanadas 3 y 7.
   */
  async toView(receipt: BillingTaxReceipt): Promise<TaxReceiptView> {
    const [taxRegime, cfdiUse] = await Promise.all([
      receipt.taxRegimeCode
        ? SatTaxRegime.query().where('satTaxRegimeCode', receipt.taxRegimeCode).first()
        : Promise.resolve(null),
      receipt.cfdiUseCode
        ? SatCfdiUse.query().where('satCfdiUseCode', receipt.cfdiUseCode).first()
        : Promise.resolve(null),
    ])

    return {
      billingTaxReceiptId: receipt.billingTaxReceiptId,
      billingPaymentId: receipt.billingPaymentId,
      billingSubscriptionId: receipt.billingSubscriptionId,
      uuid: receipt.uuid,
      series: receipt.series,
      folio: receipt.folio,
      stampedAt: receipt.stampedAt.toISO()!,
      status: receipt.status,
      issuer: receipt.issuer,
      receiver: {
        rfc: receipt.rfc,
        legalName: receipt.legalName,
        postalCode: receipt.postalCode,
        taxRegimeCode: receipt.taxRegimeCode,
        taxRegimeLabel: taxRegime?.satTaxRegimeDescription ?? null,
        cfdiUseCode: receipt.cfdiUseCode,
        cfdiUseLabel: cfdiUse?.satCfdiUseDescription ?? null,
      },
      amounts: {
        subtotalCents: receipt.subtotalCents,
        discountAmountCents: receipt.discountAmountCents,
        taxAmountCents: receipt.taxAmountCents,
        totalCents: receipt.totalCents,
        taxRate: Number(receipt.taxRate),
      },
      xmlAvailable: false,
      pdfAvailable: false,
      cancellation: null,
    }
  }

  /**
   * Traduce `ER_DUP_ENTRY` (1062) al 409 del índice violado.
   * Cualquier otro UNIQUE, u otro error de motor, no filtra el sqlMessage.
   */
  rethrowDuplicateIndex(error: unknown): never {
    if (error instanceof BillingTaxReceiptServiceError) {
      throw error
    }

    const parsed = this.readMysqlError(error)
    const isDuplicate = parsed.code === ER_DUP_ENTRY || parsed.errno === ER_DUP_ENTRY_ERRNO

    if (isDuplicate && parsed.sqlMessage.includes(BILLING_TAX_RECEIPT_PAYMENT_LIVE_UNIQUE)) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.LIVE_RECEIPT_EXISTS)
    }

    if (isDuplicate && parsed.sqlMessage.includes(BILLING_TAX_RECEIPT_UUID_UNIQUE)) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.UUID_ALREADY_REGISTERED)
    }

    if (isDuplicate) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.SYS_UNHANDLED)
    }

    throw error
  }

  private fromCatalog(
    definition: BillingTaxReceiptErrorDefinition,
    data?: BillingTaxReceiptErrorData
  ): BillingTaxReceiptServiceError {
    return new BillingTaxReceiptServiceError(
      definition.title,
      definition.code,
      definition.status,
      definition.key,
      definition.detail,
      data
    )
  }

  private readMysqlError(error: unknown): {
    code?: string
    errno?: number
    sqlMessage: string
  } {
    const err = error as {
      code?: string
      errno?: number
      sqlMessage?: string
      original?: { code?: string; errno?: number; sqlMessage?: string }
      cause?: { code?: string; errno?: number; sqlMessage?: string }
    }
    const inner = err.original ?? err.cause ?? err
    return {
      code: inner.code ?? err.code,
      errno: inner.errno ?? err.errno,
      sqlMessage: inner.sqlMessage ?? err.sqlMessage ?? '',
    }
  }

  private normalizeOptional(value: string | null): string | null {
    if (value === null || value === undefined) {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
}
