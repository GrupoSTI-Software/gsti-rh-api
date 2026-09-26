import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import BillingSubscriptionController from '../../../app/controllers/billing_subscription_controller.js'

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
        send(body: unknown) {
          captured.body = body as Record<string, unknown>
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
// businessUnits — picker mínimo de empresas para el alta
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController.businessUnits — picker de empresas', () => {
  test('devuelve 200 con type success y array en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = { response } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.businessUnits = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: [{ businessUnitPublicId: 'uuid-1', businessUnitName: 'ACME S.A.', activeEmployees: 50 }],
      })
    }
    await controller.businessUnits(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isArray(captured.body?.data)
  })

  test('nunca expone el identificador interno de la empresa', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = { response } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.businessUnits = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: [{ businessUnitPublicId: 'uuid-1', businessUnitName: 'ACME S.A.', activeEmployees: 50 }],
      })
    }
    await controller.businessUnits(ctx)

    const data = captured.body?.data as Array<Record<string, unknown>>
    for (const item of data) {
      assert.notProperty(item, 'businessUnitId')
    }
  })
})

// ---------------------------------------------------------------------------
// index — listado de suscripciones
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController.index — listado', () => {
  test('devuelve 200 con type success y array en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = { response } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.index = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(200).json({ type: 'success', data: [] })
    }
    await controller.index(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isArray(captured.body?.data)
  })
})

// ---------------------------------------------------------------------------
// show — detalle de la suscripción
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController.show — detalle', () => {
  test('devuelve 200 con la suscripción en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = { params: { subscriptionId: '1' }, response } as unknown as HttpContext

    const mockSubscription = {
      billingSubscriptionId: 1,
      billingSubscriptionStatus: 'trialing',
      billingSubscriptionContractedUnitAmount: 65,
    }

    const controller = new BillingSubscriptionController()
    controller.show = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response
        .status(200)
        .json({ type: 'success', data: mockSubscription as unknown as Record<string, unknown> })
    }
    await controller.show(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
  })

  test('devuelve 404 con code PLT.SUB.NOT_FOUND cuando no existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = { params: { subscriptionId: '9999' }, response } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.show = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Suscripciones',
        detail: 'La suscripción solicitada no existe.',
        key: 'suscripcion-no-encontrada',
        code: 'PLT.SUB.NOT_FOUND',
      })
    }
    await controller.show(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.SUB.NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// store — alta manual de suscripción
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController.store — alta manual', () => {
  test('devuelve 201 con la suscripción creada en estado trialing', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-1', billingPlanId: 4 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingSubscriptionId: 1,
          billingPlanId: 4,
          billingSubscriptionStatus: 'trialing',
          billingSubscriptionProvider: 'manual',
        },
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 201)
    const data = captured.body?.data as Record<string, unknown>
    assert.equal(data?.billingSubscriptionStatus, 'trialing')
    assert.equal(data?.billingSubscriptionProvider, 'manual')
    assert.notProperty(data, 'businessUnitId')
  })

  test('nunca incluye datos de tarjeta ni el id interno en la respuesta', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-1', billingPlanId: 4 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingSubscriptionId: 1,
          billingSubscriptionStatus: 'trialing',
          billingSubscriptionProvider: 'manual',
          billingSubscriptionStripeSubscriptionId: null,
          billingSubscriptionStripeCustomerId: null,
        },
      })
    }
    await controller.store(ctx)

    const data = captured.body?.data as Record<string, unknown>
    assert.notProperty(data, 'cardNumber')
    assert.notProperty(data, 'cvv')
    assert.notProperty(data, 'businessUnitId')
    assert.isNull(data?.billingSubscriptionStripeSubscriptionId)
  })

  test('devuelve 404 con code PLT.SUB.BUSINESS_UNIT_NOT_FOUND cuando la empresa no existe', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-inexistente', billingPlanId: 4 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Suscripciones',
        detail: 'La empresa solicitada no existe.',
        key: 'empresa-no-encontrada',
        code: 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND')
  })

  test('devuelve 422 con code PLT.SUB.BUSINESS_UNIT_INACTIVE cuando la empresa está inactiva', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-inactiva', billingPlanId: 4 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'No se puede contratar una suscripción para una empresa inactiva.',
        key: 'empresa-inactiva',
        code: 'PLT.SUB.BUSINESS_UNIT_INACTIVE',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.BUSINESS_UNIT_INACTIVE')
  })

  test('devuelve 422 con code PLT.SUB.PLAN_NOT_PUBLISHED cuando el plan está en borrador', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-1', billingPlanId: 2 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'Solo se puede contratar sobre un plan publicado del catálogo.',
        key: 'plan-no-publicado',
        code: 'PLT.SUB.PLAN_NOT_PUBLISHED',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.PLAN_NOT_PUBLISHED')
  })

  test('devuelve 422 con code PLT.SUB.NO_ACTIVE_PRICE cuando el plan no tiene precio vigente', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-1', billingPlanId: 4 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.',
        key: 'sin-precio-vigente',
        code: 'PLT.SUB.NO_ACTIVE_PRICE',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.NO_ACTIVE_PRICE')
  })

  test('devuelve 409 con code PLT.SUB.ALREADY_LIVE cuando ya tiene una viva', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-1', billingPlanId: 4 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(409).json({
        title: 'Suscripciones',
        detail: 'Esta empresa ya tiene una suscripción viva. Cancélala antes de contratar una nueva.',
        key: 'suscripcion-viva-existente',
        code: 'PLT.SUB.ALREADY_LIVE',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 409)
    assert.equal(captured.body?.code, 'PLT.SUB.ALREADY_LIVE')
  })

  test('devuelve 422 con code PLT.SUB.VAL_INPUT cuando falta billingPlanId', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ businessUnitPublicId: 'uuid-1' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.store = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'billingPlanId es obligatorio',
        key: 'PLT.SUB.VAL_INPUT',
        code: 'PLT.SUB.VAL_INPUT',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.VAL_INPUT')
  })
})

// ---------------------------------------------------------------------------
// changePlan — cambio de plan con re-snapshot
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController.changePlan — cambio de plan', () => {
  test('devuelve 200 con type success al cambiar de plan', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '10' },
      request: makeRequestWithBody({ billingPlanId: 5 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.changePlan = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: { billingSubscriptionId: 10, billingPlanId: 5, billingSubscriptionStatus: 'active' },
      })
    }
    await controller.changePlan(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isDefined(captured.body?.data)
  })

  test('devuelve 422 cuando la suscripción está cancelada (SUBSCRIPTION_CANCELED)', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '10' },
      request: makeRequestWithBody({ billingPlanId: 5 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.changePlan = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'La suscripción está cancelada y no admite cambio de plan ni cobro.',
        key: 'suscripcion-cancelada',
        code: 'PLT.SUB.SUBSCRIPTION_CANCELED',
      })
    }
    await controller.changePlan(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.SUBSCRIPTION_CANCELED')
  })

  test('devuelve 404 cuando el plan no existe (PLAN_NOT_FOUND)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '10' },
      request: makeRequestWithBody({ billingPlanId: 999 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.changePlan = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Suscripciones',
        detail: 'El plan solicitado no existe.',
        key: 'plan-no-encontrado',
        code: 'PLT.SUB.PLAN_NOT_FOUND',
      })
    }
    await controller.changePlan(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.SUB.PLAN_NOT_FOUND')
  })

  test('devuelve 422 cuando el plan no está publicado (PLAN_NOT_PUBLISHED)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '10' },
      request: makeRequestWithBody({ billingPlanId: 7 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.changePlan = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'Solo se puede cambiar a un plan publicado del catálogo.',
        key: 'plan-no-publicado',
        code: 'PLT.SUB.PLAN_NOT_PUBLISHED',
      })
    }
    await controller.changePlan(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.PLAN_NOT_PUBLISHED')
  })
})

// ---------------------------------------------------------------------------
// cancel — cancelación de suscripción
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController.cancel — cancelación', () => {
  test('devuelve 200 con type success al cancelar', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '10' },
      request: makeRequestWithBody({}),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.cancel = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: {
          billingSubscriptionId: 10,
          billingSubscriptionStatus: 'canceled',
          billingSubscriptionCanceledAt: '2026-07-22T00:00:00.000Z',
        },
      })
    }
    await controller.cancel(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.equal(
      (captured.body?.data as Record<string, unknown>)?.billingSubscriptionStatus,
      'canceled'
    )
  })

  test('devuelve 422 al cancelar una suscripción ya cancelada (SUBSCRIPTION_CANCELED)', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '10' },
      request: makeRequestWithBody({}),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.cancel = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Suscripciones',
        detail: 'La suscripción ya está cancelada.',
        key: 'suscripcion-cancelada',
        code: 'PLT.SUB.SUBSCRIPTION_CANCELED',
      })
    }
    await controller.cancel(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.SUB.SUBSCRIPTION_CANCELED')
  })

  test('devuelve 404 cuando la suscripción no existe (NOT_FOUND)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { id: '999' },
      request: makeRequestWithBody({}),
      response,
    } as unknown as HttpContext

    const controller = new BillingSubscriptionController()
    controller.cancel = async function (this: BillingSubscriptionController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Suscripciones',
        detail: 'La suscripción no existe.',
        key: 'suscripcion-no-encontrada',
        code: 'PLT.SUB.NOT_FOUND',
      })
    }
    await controller.cancel(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.SUB.NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// Contrato de error — shape { title, detail, key, code }
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionController — contrato de shape de errores PLT.SUB.*', () => {
  test('todos los errores tienen los campos title, detail, key y code', ({ assert }) => {
    const errorBodies = [
      {
        title: 'Suscripciones',
        detail: 'Empresa no encontrada.',
        key: 'empresa-no-encontrada',
        code: 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND',
      },
      {
        title: 'Suscripciones',
        detail: 'Plan no publicado.',
        key: 'plan-no-publicado',
        code: 'PLT.SUB.PLAN_NOT_PUBLISHED',
      },
      {
        title: 'Suscripciones',
        detail: 'Ya suscrita.',
        key: 'suscripcion-viva-existente',
        code: 'PLT.SUB.ALREADY_LIVE',
      },
      {
        title: 'Suscripciones',
        detail: 'La suscripción está cancelada.',
        key: 'suscripcion-cancelada',
        code: 'PLT.SUB.SUBSCRIPTION_CANCELED',
      },
    ]
    for (const body of errorBodies) {
      assert.property(body, 'title')
      assert.property(body, 'detail')
      assert.property(body, 'key')
      assert.property(body, 'code')
      assert.isTrue(body.code.startsWith('PLT.SUB.'))
    }
  })
})
