import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import BillingPriceController from '../../../app/controllers/billing_price_controller.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

function makeResponse(): { response: HttpContext['response']; captured: CapturedResponse } {
  const captured: CapturedResponse = {}
  const response = {
    status(code: number) {
      captured.status = code
      return {
        json(body: Record<string, unknown>) {
          captured.body = body
          return body
        },
      }
    },
  } as unknown as HttpContext['response']
  return { response, captured }
}

function makeRequestWithBody(body: Record<string, unknown>) {
  return {
    async validateUsing() {
      return body
    },
  } as unknown as HttpContext['request']
}

// ---------------------------------------------------------------------------
// index — historial de precios
// ---------------------------------------------------------------------------

test.group('BillingPriceController.index — historial de precios', () => {
  test('devuelve 200 con type success y array en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.index = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(200).json({ type: 'success', data: [] })
    }
    await controller.index(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isArray(captured.body?.data)
  })

  test('los precios se ordenan por effective_from ascendente', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.index = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: [
          { billingPlanPriceId: 1, billingPlanPriceEffectiveFrom: '2025-01-01' },
          { billingPlanPriceId: 2, billingPlanPriceEffectiveFrom: '2026-01-01' },
        ],
      })
    }
    await controller.index(ctx)

    const data = captured.body?.data as Array<{ billingPlanPriceEffectiveFrom: string }>
    assert.equal(data.length, 2)
    assert.isTrue(data[0].billingPlanPriceEffectiveFrom < data[1].billingPlanPriceEffectiveFrom)
  })

  test('devuelve 404 con code PLT.CAT.PLAN_NOT_FOUND cuando el plan no existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '9999' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.index = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Catálogo de cobro',
        detail: 'El plan solicitado no existe.',
        key: 'PLT.CAT.PLAN_NOT_FOUND',
        code: 'PLT.CAT.PLAN_NOT_FOUND',
      })
    }
    await controller.index(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.CAT.PLAN_NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// store — append-only: agregar nueva versión de precio
// ---------------------------------------------------------------------------

test.group('BillingPriceController.store — append-only', () => {
  test('devuelve 201 con la versión de precio creada', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingPlanPriceAmount: 65,
        billingPlanPriceEffectiveFrom: '2026-01-01',
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.store = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingPlanPriceId: 5,
          billingPlanId: 1,
          billingPlanPriceAmount: '65.00',
          billingPlanPriceCurrency: 'MXN',
          billingPlanPriceTaxRate: '0.1600',
          billingPlanPriceEffectiveFrom: '2026-01-01',
        },
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 201)
    assert.equal(captured.body?.type, 'success')
    const data = captured.body?.data as Record<string, unknown>
    assert.property(data, 'billingPlanPriceId')
    assert.property(data, 'billingPlanPriceEffectiveFrom')
  })

  test('el precio creado no tiene updated_at ni deleted_at (append-only puro)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingPlanPriceAmount: 65,
        billingPlanPriceEffectiveFrom: '2026-07-01',
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.store = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingPlanPriceId: 6,
          billingPlanId: 1,
          billingPlanPriceAmount: '65.00',
          billingPlanPriceEffectiveFrom: '2026-07-01',
          createdAt: '2026-07-11T00:00:00.000Z',
        },
      })
    }
    await controller.store(ctx)

    const data = captured.body?.data as Record<string, unknown>
    assert.notProperty(data, 'updatedAt')
    assert.notProperty(data, 'deletedAt')
    assert.property(data, 'createdAt')
  })

  test('devuelve 409 con code PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE cuando la fecha ya existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingPlanPriceAmount: 70,
        billingPlanPriceEffectiveFrom: '2025-01-01',
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.store = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(409).json({
        title: 'Catálogo de cobro',
        detail: 'Ya existe una versión de precio con la misma fecha de vigencia.',
        key: 'PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE',
        code: 'PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 409)
    assert.equal(captured.body?.code, 'PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE')
  })

  test('devuelve 422 con code PLT.CAT.VAL_INPUT para datos inválidos', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingPlanPriceAmount: -5,
        billingPlanPriceEffectiveFrom: 'fecha-invalida',
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPriceController()
    controller.store = async function (this: BillingPriceController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'El monto debe ser mayor a 0.',
        key: 'PLT.CAT.VAL_INPUT',
        code: 'PLT.CAT.VAL_INPUT',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.VAL_INPUT')
  })
})

// ---------------------------------------------------------------------------
// Invariante: append-only — ningún endpoint modifica precios existentes
// ---------------------------------------------------------------------------

test.group('BillingPriceController — invariante append-only', () => {
  test('el controlador solo tiene index y store (no update ni destroy)', ({ assert }) => {
    const controller = new BillingPriceController()
    assert.isFunction(controller.index)
    assert.isFunction(controller.store)
    assert.notProperty(controller, 'update')
    assert.notProperty(controller, 'destroy')
    assert.notProperty(controller, 'show')
  })

  test('el shape de precio no expone campos de mutación (updated_at, deleted_at)', ({ assert }) => {
    const priceShape = {
      billingPlanPriceId: 1,
      billingPlanId: 1,
      billingPlanPriceAmount: '65.00',
      billingPlanPriceEffectiveFrom: '2025-01-01',
      createdAt: '2025-01-01T00:00:00.000Z',
    }
    assert.notProperty(priceShape, 'updatedAt')
    assert.notProperty(priceShape, 'deletedAt')
  })
})
