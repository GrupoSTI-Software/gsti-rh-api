import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import { FILE_INTAKE_XML_MIMES } from '#constants/file_intake'
import {
  BILLING_TAX_RECEIPT_DEFAULT_ISSUER,
  BILLING_TAX_RECEIPT_INTAKE_PROFILE,
  BILLING_TAX_RECEIPT_LIVE_STATUS,
  BILLING_TAX_RECEIPT_PAYMENT_LIVE_UNIQUE,
  BILLING_TAX_RECEIPT_S3_FOLDER,
  BILLING_TAX_RECEIPT_SIGNED_URL_EXPIRES_SECONDS,
  BILLING_TAX_RECEIPT_UUID_PATTERN,
  BILLING_TAX_RECEIPT_UUID_UNIQUE,
  BILLING_TAX_RECEIPT_XML_MAX_BYTES,
  BILLING_TAX_RECEIPT_XML_UPLOAD_CONTENT_TYPE,
  type BillingTaxReceiptFileType,
} from '#constants/billing_tax_receipt'
import {
  BILLING_TAX_RECEIPT_ERRORS,
  type BillingTaxReceiptErrorDefinition,
} from '#constants/billing_tax_receipt_error_codes'
import { FileIntakeError } from '#exceptions/file_intake_error'
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
import FileIntakeService, { type IncomingFile } from '#services/file_intake_service'
import UploadService from '#services/upload_service'

const XML_MIME_SET: ReadonlySet<string> = new Set(FILE_INTAKE_XML_MIMES)

export interface CreateTaxReceiptInput {
  uuid: string
  series: string | null
  folio: string | null
  stampedAt: DateTime
}

export interface TaxReceiptFiles {
  xml?: IncomingFile | null
  pdf?: IncomingFile | null
}

type UploadedTaxReceiptFile = {
  path: string | null
  mime: string | null
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
   *
   * Los archivos van primero (regla 6): se validan y se suben antes del
   * INSERT. Si el INSERT falla quedan objetos huérfanos en el bucket
   * (basura, no inconsistencia). Un acuse incompleto no bloquea el alta.
   */
  async create(
    paymentId: number,
    input: CreateTaxReceiptInput,
    files: TaxReceiptFiles = {}
  ): Promise<BillingTaxReceipt> {
    if (!BILLING_TAX_RECEIPT_UUID_PATTERN.test(input.uuid.trim())) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT)
    }

    const uuid = input.uuid.trim().toUpperCase()
    const xmlFile = await this.uploadOptionalFile(uuid, 'xml', files.xml)
    const pdfFile = await this.uploadOptionalFile(uuid, 'pdf', files.pdf)

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
            uuid,
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
            xmlPath: xmlFile.path,
            xmlMime: xmlFile.mime,
            pdfPath: pdfFile.path,
            pdfMime: pdfFile.mime,
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
   * Enlace firmado de 300 s. El comprobante se resuelve encadenado al pago
   * (nunca `find(id)` a secas). Path nulo u objeto ausente → el mismo 404
   * que un id inexistente en su forma HTTP; `getDownloadLink` no lanza.
   */
  async getDownloadUrl(
    taxReceiptId: number,
    fileType: BillingTaxReceiptFileType,
    actorUserId?: number
  ): Promise<{ url: string; expiresIn: number }> {
    const receipt = await BillingTaxReceipt.query()
      .where('billingTaxReceiptId', taxReceiptId)
      .whereHas('payment', (paymentQuery) => {
        void paymentQuery
      })
      .first()

    if (!receipt) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.TAX_RECEIPT_NOT_FOUND)
    }

    const storedKey = fileType === 'xml' ? receipt.xmlPath : receipt.pdfPath
    if (!storedKey) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.FILE_NOT_AVAILABLE)
    }

    const result = await new UploadService().getDownloadLink(
      storedKey,
      BILLING_TAX_RECEIPT_SIGNED_URL_EXPIRES_SECONDS
    )

    if (typeof result !== 'string') {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.FILE_NOT_AVAILABLE)
    }

    logger.info({
      event: 'billing_tax_receipt.file_download',
      userId: actorUserId ?? null,
      billingTaxReceiptId: receipt.billingTaxReceiptId,
      fileType,
      at: DateTime.now().toISO(),
    })

    return { url: result, expiresIn: BILLING_TAX_RECEIPT_SIGNED_URL_EXPIRES_SECONDS }
  }

  /**
   * DTO plano armado a mano. Nunca `.serialize()` del modelo (el RFC no
   * viaja por serialización). `xmlAvailable`/`pdfAvailable`/`cancellation`
   * se llenan desde las columnas de path; `cancellation` queda reservado.
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
      xmlAvailable: Boolean(receipt.xmlPath),
      pdfAvailable: Boolean(receipt.pdfPath),
      cancellation: null,
    }
  }

  /**
   * Valida y sube un archivo opcional del acuse. Sin archivo → `{ null, null }`.
   * El XML viaja a S3 como `application/octet-stream`; el MIME real se persiste.
   */
  private async uploadOptionalFile(
    uuid: string,
    fileType: 'xml' | 'pdf',
    file?: IncomingFile | null
  ): Promise<UploadedTaxReceiptFile> {
    if (!file?.tmpPath) {
      return { path: null, mime: null }
    }

    if (fileType === 'xml') {
      this.assertXmlWithinOwnLimit(file)
    }

    const intake = await this.acceptTaxReceiptFile(file)

    if (fileType === 'xml' && !XML_MIME_SET.has(intake.mimeType)) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED)
    }

    if (fileType === 'pdf' && intake.mimeType !== 'application/pdf') {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED)
    }

    if (fileType === 'xml' && intake.fileSize > BILLING_TAX_RECEIPT_XML_MAX_BYTES) {
      throw this.xmlTooLargeError()
    }

    // La Key que se persiste es la que DEVUELVE el método, no `relativeKey`:
    // `uploadPrivateBuffer` antepone `{AWS_ROOT_PATH}files/`. Sin RFC ni
    // razón social: el folio fiscal ya es único y `storageFileName` no es
    // predecible.
    const relativeKey = `${BILLING_TAX_RECEIPT_S3_FOLDER}/${uuid}/${intake.storageFileName}`
    const contentType =
      fileType === 'xml' ? BILLING_TAX_RECEIPT_XML_UPLOAD_CONTENT_TYPE : intake.mimeType

    const storedKey = await new UploadService().uploadPrivateBuffer(
      relativeKey,
      intake.buffer,
      contentType
    )

    if (!storedKey) {
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.FILE_UPLOAD_FAILED)
    }

    return { path: storedKey, mime: intake.mimeType }
  }

  private assertXmlWithinOwnLimit(file: IncomingFile): void {
    if (typeof file.size === 'number' && file.size > BILLING_TAX_RECEIPT_XML_MAX_BYTES) {
      throw this.xmlTooLargeError()
    }
  }

  private xmlTooLargeError(): BillingTaxReceiptServiceError {
    const limitMb = Math.round(BILLING_TAX_RECEIPT_XML_MAX_BYTES / (1024 * 1024))
    const definition = BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE
    return new BillingTaxReceiptServiceError(
      definition.title,
      definition.code,
      definition.status,
      definition.key,
      `El archivo XML supera el tamaño máximo de ${limitMb} MB.`
    )
  }

  private async acceptTaxReceiptFile(file: IncomingFile) {
    try {
      return await new FileIntakeService().accept(file, BILLING_TAX_RECEIPT_INTAKE_PROFILE)
    } catch (error) {
      if (error instanceof FileIntakeError) {
        throw this.fromFileIntake(error)
      }
      throw this.fromCatalog(BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED)
    }
  }

  private fromFileIntake(error: FileIntakeError): BillingTaxReceiptServiceError {
    if (error.errorCode === FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE) {
      const definition = BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE
      return new BillingTaxReceiptServiceError(
        definition.title,
        definition.code,
        definition.status,
        definition.key,
        error.detail
      )
    }

    const definition = BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED
    return new BillingTaxReceiptServiceError(
      definition.title,
      definition.code,
      definition.status,
      definition.key,
      error.detail
    )
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
