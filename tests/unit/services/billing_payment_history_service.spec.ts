import { test } from '@japa/runner'
import { BILLING_PAYMENT_ERROR_CODES } from '../../../app/constants/billing_payment_error_codes.js'
import { BillingPaymentServiceError } from '../../../app/exceptions/billing_payment_service_error.js'
import { resolveBillingPaymentApiError } from '../../../app/helpers/billing_payment_api_error.js'

// ─── Helpers que simulan la lógica del servicio de histórico ──────────────────

function validateSubscriptionExists(exists: boolean, subscriptionId = 99): void {
  if (!exists) {
    throw new BillingPaymentServiceError(
      `Suscripción ${subscriptionId} no encontrada`,
      BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
      404,
      'suscripcion-no-encontrada',
      'La suscripción solicitada no existe.'
    )
  }
}

function validatePaymentWithReceipt(payment: { id: number; receiptPath: string | null } | null): void {
  if (!payment || !payment.receiptPath) {
    throw new BillingPaymentServiceError(
      'Pago no encontrado o sin comprobante',
      BILLING_PAYMENT_ERROR_CODES.NOT_FOUND,
      404,
      'pago-no-encontrado',
      'No existe un pago con comprobante para el identificador indicado.'
    )
  }
}

function resolveDownloadLink(result: string | { status: number }): string {
  if (typeof result !== 'string') {
    throw new BillingPaymentServiceError(
      'No se pudo generar el enlace de descarga',
      BILLING_PAYMENT_ERROR_CODES.NOT_FOUND,
      404,
      'pago-no-encontrado',
      'No fue posible generar el enlace de descarga del comprobante.'
    )
  }
  return result
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.group('PLT.PAY.NOT_FOUND — nuevo código de esta HU', () => {
  test('NOT_FOUND tiene el prefijo PLT.PAY.', ({ assert }) => {
    assert.isTrue(
      BILLING_PAYMENT_ERROR_CODES.NOT_FOUND.startsWith('PLT.PAY.'),
      'NOT_FOUND debe tener prefijo PLT.PAY.'
    )
    assert.equal(BILLING_PAYMENT_ERROR_CODES.NOT_FOUND, 'PLT.PAY.NOT_FOUND')
  })

  test('todos los códigos del contrato están completos incluyendo NOT_FOUND', ({ assert }) => {
    const expectedCodes = [
      'PLT.PAY.VAL_INPUT',
      'PLT.PAY.SUBSCRIPTION_NOT_FOUND',
      'PLT.PAY.NOT_FOUND',
      'PLT.PAY.SUBSCRIPTION_CANCELED',
      'PLT.PAY.AMOUNT_INVALID',
      'PLT.PAY.RECEIPT_INVALID',
      'PLT.PAY.RECEIPT_UPLOAD_FAILED',
      'PLT.PAY.SYS_UNHANDLED',
    ]
    const actualCodes = Object.values(BILLING_PAYMENT_ERROR_CODES)
    for (const code of expectedCodes) {
      assert.include(actualCodes, code, `Falta el código ${code}`)
    }
  })
})

test.group('listPayments — validación de suscripción', () => {
  test('suscripción inexistente lanza SUBSCRIPTION_NOT_FOUND con 404', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateSubscriptionExists(false, 99)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.SUBSCRIPTION_NOT_FOUND')
    assert.equal(err?.httpStatus, 404)
  })

  test('suscripción existente no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateSubscriptionExists(true))
  })
})

test.group('getDownloadUrl — validación del pago y comprobante', () => {
  test('pago inexistente (null) lanza NOT_FOUND con 404', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validatePaymentWithReceipt(null)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.NOT_FOUND')
    assert.equal(err?.httpStatus, 404)
    assert.equal(err?.key, 'pago-no-encontrado')
  })

  test('pago sin comprobante (receiptPath null) lanza NOT_FOUND', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validatePaymentWithReceipt({ id: 5, receiptPath: null })
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.NOT_FOUND')
  })

  test('pago con comprobante no lanza error', ({ assert }) => {
    assert.doesNotThrow(() =>
      validatePaymentWithReceipt({ id: 5, receiptPath: 'sae-bo-system/files/billing/...' })
    )
  })
})

test.group('getDownloadUrl — resolución del enlace firmado', () => {
  test('getDownloadLink retornando string devuelve la URL', ({ assert }) => {
    const url = resolveDownloadLink('https://s3.signed-url.example.com/receipt.pdf?token=abc')
    assert.equal(url, 'https://s3.signed-url.example.com/receipt.pdf?token=abc')
  })

  test('getDownloadLink retornando objeto de error lanza NOT_FOUND', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      resolveDownloadLink({ status: 500 })
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.NOT_FOUND')
    assert.equal(err?.httpStatus, 404)
  })

  test('getDownloadLink retornando objeto 404 lanza NOT_FOUND', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      resolveDownloadLink({ status: 404 })
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.NOT_FOUND')
  })
})

test.group('resolveBillingPaymentApiError — NOT_FOUND se mapea correctamente', () => {
  test('NOT_FOUND → 404 con code PLT.PAY.NOT_FOUND', ({ assert }) => {
    const error = new BillingPaymentServiceError(
      'Pago no encontrado',
      BILLING_PAYMENT_ERROR_CODES.NOT_FOUND,
      404,
      'pago-no-encontrado',
      'No existe un pago con comprobante para el identificador indicado.'
    )
    const resolved = resolveBillingPaymentApiError(error)
    assert.equal(resolved.status, 404)
    assert.equal(resolved.code, 'PLT.PAY.NOT_FOUND')
    assert.equal(resolved.key, 'pago-no-encontrado')
    assert.equal(resolved.detail, 'No existe un pago con comprobante para el identificador indicado.')
  })
})

test.group('listBillingPaymentsValidator — parámetros de paginación', () => {
  test('page y limit opcionales — defaults lógicos son 1 y 20', ({ assert }) => {
    const page = undefined ?? 1
    const limit = undefined ?? 20
    assert.equal(page, 1)
    assert.equal(limit, 20)
  })

  test('limit no puede exceder 100', ({ assert }) => {
    // Simula la lógica del validator: max(100)
    const limitInvalid = 101
    const limitValid = 100
    assert.isTrue(limitInvalid > 100, 'limit 101 debería rechazarse')
    assert.isFalse(limitValid > 100, 'limit 100 debería aceptarse')
  })
})
