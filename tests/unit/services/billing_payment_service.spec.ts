import { test } from '@japa/runner'
import { BILLING_PAYMENT_ERROR_CODES } from '../../../app/constants/billing_payment_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import { BillingPaymentServiceError } from '../../../app/exceptions/billing_payment_service_error.js'
import { BillingSubscriptionServiceError } from '../../../app/exceptions/billing_subscription_service_error.js'
import {
  changeApplyFailedError,
  changeInconsistentSnapshotError,
} from '../../../app/helpers/billing_payment_error.js'
import { resolveBillingPaymentApiError } from '../../../app/helpers/billing_payment_api_error.js'
import { RECEIPT_MAX_BYTES, RECEIPT_ALLOWED_MIMES } from '../../../app/validators/billing_payment.js'

// ─── Constantes de cotas (espejo del servicio para tests) ─────────────────────
const AMOUNT_MIN_CENTS = 100
const AMOUNT_MAX_CENTS = 99_999_999

// ─── Helper: simula la validación de monto del servicio ──────────────────────
function validateAmount(amountCents: number): void {
  if (
    !Number.isInteger(amountCents) ||
    amountCents < AMOUNT_MIN_CENTS ||
    amountCents > AMOUNT_MAX_CENTS
  ) {
    throw new BillingPaymentServiceError(
      `Monto inválido: ${amountCents} centavos`,
      BILLING_PAYMENT_ERROR_CODES.AMOUNT_INVALID,
      422,
      'monto-invalido',
      'El monto debe ser un entero positivo dentro de las cotas.'
    )
  }
}

// ─── Helper: simula la validación de comprobante del servicio ─────────────────
function validateReceipt(mime: string, size: number): void {
  if (!(RECEIPT_ALLOWED_MIMES as readonly string[]).includes(mime)) {
    throw new BillingPaymentServiceError(
      `Tipo no permitido: ${mime}`,
      BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID,
      422,
      'comprobante-tipo-invalido',
      'El comprobante debe ser PDF, JPG o PNG.'
    )
  }
  if (size > RECEIPT_MAX_BYTES) {
    throw new BillingPaymentServiceError(
      `Tamaño excedido: ${size}`,
      BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID,
      422,
      'comprobante-muy-grande',
      'El comprobante supera el tope.'
    )
  }
}

// ─── Helper: simula la validación de estado de suscripción ───────────────────
function validateSubscriptionStatus(status: string): void {
  if (status === 'canceled') {
    throw new BillingPaymentServiceError(
      'Suscripción cancelada',
      BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED,
      422,
      'suscripcion-cancelada',
      'No se puede registrar un pago sobre una suscripción cancelada.'
    )
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.group('BillingPaymentServiceError — constructor y propiedades', () => {
  test('construye el error con los campos correctos', ({ assert }) => {
    const error = new BillingPaymentServiceError(
      'Suscripción no encontrada',
      BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
      404,
      'suscripcion-no-encontrada',
      'La suscripción solicitada no existe.'
    )
    assert.equal(error.message, 'Suscripción no encontrada')
    assert.equal(error.errorCode, 'PLT.PAY.SUBSCRIPTION_NOT_FOUND')
    assert.equal(error.httpStatus, 404)
    assert.equal(error.key, 'suscripcion-no-encontrada')
    assert.equal(error.detail, 'La suscripción solicitada no existe.')
    assert.equal(error.name, 'BillingPaymentServiceError')
  })

  test('el httpStatus default es 400', ({ assert }) => {
    const error = new BillingPaymentServiceError('Error', BILLING_PAYMENT_ERROR_CODES.VAL_INPUT)
    assert.equal(error.httpStatus, 400)
  })

  test('es instancia de Error', ({ assert }) => {
    const error = new BillingPaymentServiceError(
      'Error',
      BILLING_PAYMENT_ERROR_CODES.SYS_UNHANDLED,
      500
    )
    assert.instanceOf(error, Error)
  })
})

test.group('BILLING_PAYMENT_ERROR_CODES — contrato PLT.PAY.*', () => {
  test('todos los códigos tienen el prefijo PLT.PAY.', ({ assert }) => {
    for (const code of Object.values(BILLING_PAYMENT_ERROR_CODES)) {
      assert.isTrue(code.startsWith('PLT.PAY.'), `"${code}" no tiene el prefijo PLT.PAY.`)
    }
  })

  test('el contrato de códigos del spec está completo', ({ assert }) => {
    assert.equal(BILLING_PAYMENT_ERROR_CODES.VAL_INPUT, 'PLT.PAY.VAL_INPUT')
    assert.equal(
      BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
      'PLT.PAY.SUBSCRIPTION_NOT_FOUND'
    )
    assert.equal(
      BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED,
      'PLT.PAY.SUBSCRIPTION_CANCELED'
    )
    assert.equal(BILLING_PAYMENT_ERROR_CODES.AMOUNT_INVALID, 'PLT.PAY.AMOUNT_INVALID')
    assert.equal(BILLING_PAYMENT_ERROR_CODES.RECEIPT_INVALID, 'PLT.PAY.RECEIPT_INVALID')
    assert.equal(
      BILLING_PAYMENT_ERROR_CODES.RECEIPT_UPLOAD_FAILED,
      'PLT.PAY.RECEIPT_UPLOAD_FAILED'
    )
    assert.equal(
      BILLING_PAYMENT_ERROR_CODES.CHANGE_APPLY_FAILED,
      'PLT.PAY.CHANGE_APPLY_FAILED'
    )
    assert.equal(
      BILLING_PAYMENT_ERROR_CODES.CHANGE_INCONSISTENT_SNAPSHOT,
      'PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT'
    )
    assert.equal(BILLING_PAYMENT_ERROR_CODES.SYS_UNHANDLED, 'PLT.PAY.SYS_UNHANDLED')
  })
})

test.group('billing_payment_error — factories PLT.PAY.* (0856)', () => {
  test('changeApplyFailedError expone código y status 500', ({ assert }) => {
    const error = changeApplyFailedError()
    assert.instanceOf(error, BillingPaymentServiceError)
    assert.equal(error.errorCode, 'PLT.PAY.CHANGE_APPLY_FAILED')
    assert.equal(error.httpStatus, 500)
    assert.equal(error.key, 'cambio-aplicacion-fallida')
  })

  test('changeInconsistentSnapshotError expone código y status 500', ({ assert }) => {
    const error = changeInconsistentSnapshotError()
    assert.instanceOf(error, BillingPaymentServiceError)
    assert.equal(error.errorCode, 'PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT')
    assert.equal(error.httpStatus, 500)
    assert.equal(error.key, 'cambio-snapshot-inconsistente')
  })

  test('las factories se resuelven en resolveBillingPaymentApiError', ({ assert }) => {
    const error = changeInconsistentSnapshotError('Snapshot corrupto')
    const resolved = resolveBillingPaymentApiError(error)
    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, 'PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT')
    assert.equal(resolved.detail, 'Snapshot corrupto')
  })
})

test.group('resolveBillingPaymentApiError — mapeo de errores a HTTP', () => {
  test('BillingPaymentServiceError se mapea correctamente', ({ assert }) => {
    const error = new BillingPaymentServiceError(
      'Suscripción cancelada',
      BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED,
      422,
      'suscripcion-cancelada',
      'No se puede pagar una suscripción cancelada.'
    )
    const resolved = resolveBillingPaymentApiError(error)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, 'PLT.PAY.SUBSCRIPTION_CANCELED')
    assert.equal(resolved.key, 'suscripcion-cancelada')
    assert.equal(resolved.detail, 'No se puede pagar una suscripción cancelada.')
  })

  test('error de validación Vine (E_VALIDATION_ERROR) → 422 VAL_INPUT', ({ assert }) => {
    const vineError = { code: 'E_VALIDATION_ERROR', messages: [{ message: 'Campo requerido' }] }
    const resolved = resolveBillingPaymentApiError(vineError)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, 'PLT.PAY.VAL_INPUT')
    assert.equal(resolved.detail, 'Campo requerido')
  })

  test('error desconocido → 500 SYS_UNHANDLED', ({ assert }) => {
    const resolved = resolveBillingPaymentApiError(new Error('error inesperado'))
    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, 'PLT.PAY.SYS_UNHANDLED')
  })

  test('BillingSubscriptionServiceError se mapea con código PLT.SUB.* (0856 E5)', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Plan no publicado',
      BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
      422,
      'plan-no-publicado',
      'Solo se puede contratar sobre un plan publicado del catálogo.'
    )
    const resolved = resolveBillingPaymentApiError(error)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, 'PLT.SUB.PLAN_NOT_PUBLISHED')
    assert.equal(resolved.title, 'Pagos de suscripción')
    assert.equal(resolved.key, 'plan-no-publicado')
  })

  test('BillingSubscriptionServiceError incluye data opcional', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Cantidad bajo plantilla',
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT,
      422,
      'cantidad-bajo-plantilla',
      'La cantidad no puede ser menor a la plantilla activa.',
      { activeEmployees: 73, minimumContractedEmployees: 80 }
    )
    const resolved = resolveBillingPaymentApiError(error)
    assert.deepEqual(resolved.data, { activeEmployees: 73, minimumContractedEmployees: 80 })
  })
})

test.group('Validación de monto — regla 4 (server-side)', () => {
  test('monto válido no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateAmount(927800))
  })

  test('monto mínimo válido (100 centavos = $1 MXN)', ({ assert }) => {
    assert.doesNotThrow(() => validateAmount(AMOUNT_MIN_CENTS))
  })

  test('monto máximo válido', ({ assert }) => {
    assert.doesNotThrow(() => validateAmount(AMOUNT_MAX_CENTS))
  })

  test('monto 0 lanza AMOUNT_INVALID', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateAmount(0)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.AMOUNT_INVALID')
    assert.equal(err?.httpStatus, 422)
  })

  test('monto negativo lanza AMOUNT_INVALID', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateAmount(-1000)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.AMOUNT_INVALID')
  })

  test('monto decimal lanza AMOUNT_INVALID (debe ser entero)', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateAmount(9278.5)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.AMOUNT_INVALID')
  })

  test('monto mayor al máximo lanza AMOUNT_INVALID', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateAmount(AMOUNT_MAX_CENTS + 1)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.AMOUNT_INVALID')
  })
})

test.group('Validación de comprobante — regla 5 (privado)', () => {
  test('PDF válido no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateReceipt('application/pdf', 1024))
  })

  test('JPG válido no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateReceipt('image/jpeg', 1024))
  })

  test('PNG válido no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateReceipt('image/png', 1024))
  })

  test('tipo no permitido (MP4) lanza RECEIPT_INVALID', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateReceipt('video/mp4', 1024)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.RECEIPT_INVALID')
    assert.equal(err?.httpStatus, 422)
  })

  test('tamaño > 10 MB lanza RECEIPT_INVALID', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateReceipt('application/pdf', RECEIPT_MAX_BYTES + 1)
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.RECEIPT_INVALID')
  })

  test('exactamente 10 MB no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateReceipt('application/pdf', RECEIPT_MAX_BYTES))
  })
})

test.group('Validación de estado de suscripción — reglas 6 y 7', () => {
  test('suscripción cancelada lanza SUBSCRIPTION_CANCELED con 422', ({ assert }) => {
    let err: BillingPaymentServiceError | null = null
    try {
      validateSubscriptionStatus('canceled')
    } catch (e) {
      err = e as BillingPaymentServiceError
    }
    assert.equal(err?.errorCode, 'PLT.PAY.SUBSCRIPTION_CANCELED')
    assert.equal(err?.httpStatus, 422)
  })

  test('suscripción trialing no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateSubscriptionStatus('trialing'))
  })

  test('suscripción active no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => validateSubscriptionStatus('active'))
  })

  test('suscripción past_due no lanza error (se puede pagar para salir de mora)', ({ assert }) => {
    assert.doesNotThrow(() => validateSubscriptionStatus('past_due'))
  })
})

test.group('RECEIPT_ALLOWED_MIMES — tipos permitidos del contrato', () => {
  test('incluye PDF, JPG y PNG', ({ assert }) => {
    assert.include(RECEIPT_ALLOWED_MIMES, 'application/pdf')
    assert.include(RECEIPT_ALLOWED_MIMES, 'image/jpeg')
    assert.include(RECEIPT_ALLOWED_MIMES, 'image/png')
  })

  test('son exactamente 3 tipos', ({ assert }) => {
    assert.lengthOf(RECEIPT_ALLOWED_MIMES, 3)
  })
})

test.group('RECEIPT_MAX_BYTES — tope de 10 MB', () => {
  test('el tope es exactamente 10 MB', ({ assert }) => {
    assert.equal(RECEIPT_MAX_BYTES, 10 * 1024 * 1024)
  })
})
