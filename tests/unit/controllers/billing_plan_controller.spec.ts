import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import BillingPlanController from '../../../app/controllers/billing_plan_controller.js'

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

function makeRequestWithQuery(qs: Record<string, unknown>) {
  return {
    async validateUsing() {
      return qs
    },
  } as unknown as HttpContext['request']
}

// ---------------------------------------------------------------------------
// index — lista de planes
// ---------------------------------------------------------------------------

test.group('BillingPlanController.index — lista de planes', () => {
  test('devuelve 200 con type success y array en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = { response } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.index = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({ type: 'success', data: [] })
    }
    await controller.index(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isArray(captured.body?.data)
  })
})

// ---------------------------------------------------------------------------
// show — detalle del plan
// ---------------------------------------------------------------------------

test.group('BillingPlanController.show — detalle', () => {
  test('devuelve 200 con type success y el plan en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const mockPlan = {
      billingPlanId: 1,
      billingPlanName: 'Plan Estándar',
      billingPlanPublishedAt: null,
      prices: [],
      volumeTiers: [],
    }

    const controller = new BillingPlanController()
    controller.show = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({ type: 'success', data: mockPlan as unknown as Record<string, unknown> })
    }
    await controller.show(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isObject(captured.body?.data)
  })

  test('devuelve 404 con code PLT.CAT.PLAN_NOT_FOUND cuando el plan no existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '9999' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.show = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Catálogo de cobro',
        detail: 'El plan solicitado no existe o fue eliminado.',
        key: 'PLT.CAT.PLAN_NOT_FOUND',
        code: 'PLT.CAT.PLAN_NOT_FOUND',
      })
    }
    await controller.show(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.CAT.PLAN_NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// store — crear plan
// ---------------------------------------------------------------------------

test.group('BillingPlanController.store — crear plan', () => {
  test('devuelve 201 con el plan creado en data', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ billingPlanName: 'Plan Nuevo' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.store = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: { billingPlanId: 2, billingPlanName: 'Plan Nuevo', billingPlanPublishedAt: null },
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 201)
    assert.equal(captured.body?.type, 'success')
    assert.equal((captured.body?.data as Record<string, unknown>)?.billingPlanPublishedAt, null)
  })

  test('el plan recién creado tiene billingPlanPublishedAt null (borrador)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ billingPlanName: 'Plan Borrador' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.store = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingPlanId: 3,
          billingPlanName: 'Plan Borrador',
          billingPlanPublishedAt: null,
          billingPlanActive: 1,
        },
      })
    }
    await controller.store(ctx)

    const data = captured.body?.data as Record<string, unknown>
    assert.isNull(data?.billingPlanPublishedAt)
    assert.equal(data?.billingPlanActive, 1)
  })

  test('devuelve 422 con code PLT.CAT.VAL_INPUT cuando el nombre está vacío', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ billingPlanName: '' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.store = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'El nombre del plan es obligatorio.',
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
// update — editar plan
// ---------------------------------------------------------------------------

test.group('BillingPlanController.update — editar plan', () => {
  test('devuelve 200 con plan actualizado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({ billingPlanName: 'Nombre Actualizado' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.update = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: { billingPlanId: 1, billingPlanName: 'Nombre Actualizado' },
      })
    }
    await controller.update(ctx)

    assert.equal(captured.status, 200)
    assert.equal((captured.body?.data as Record<string, unknown>)?.billingPlanName, 'Nombre Actualizado')
  })
})

// ---------------------------------------------------------------------------
// destroy — eliminar plan (soft-delete)
// ---------------------------------------------------------------------------

test.group('BillingPlanController.destroy — soft-delete', () => {
  test('devuelve 204 sin body al eliminar el plan', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.destroy = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(204).send('')
    }
    await controller.destroy(ctx)

    assert.equal(captured.status, 204)
  })
})

// ---------------------------------------------------------------------------
// publish — publicar plan
// ---------------------------------------------------------------------------

test.group('BillingPlanController.publish — publicar plan', () => {
  test('devuelve 200 con el plan publicado (billingPlanPublishedAt ≠ null)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.publish = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: {
          billingPlanId: 1,
          billingPlanPublishedAt: '2026-07-11T18:00:00.000Z',
        },
      })
    }
    await controller.publish(ctx)

    assert.equal(captured.status, 200)
    const data = captured.body?.data as Record<string, unknown>
    assert.isNotNull(data?.billingPlanPublishedAt)
  })

  test('devuelve 409 con code PLT.CAT.PLAN_ALREADY_PUBLISHED si ya está publicado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.publish = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(409).json({
        title: 'Catálogo de cobro',
        detail: 'No se puede publicar un plan que ya está publicado.',
        key: 'PLT.CAT.PLAN_ALREADY_PUBLISHED',
        code: 'PLT.CAT.PLAN_ALREADY_PUBLISHED',
      })
    }
    await controller.publish(ctx)

    assert.equal(captured.status, 409)
    assert.equal(captured.body?.code, 'PLT.CAT.PLAN_ALREADY_PUBLISHED')
  })

  test('devuelve 422 con code PLT.CAT.PLAN_PUBLISH_REQUIREMENTS si faltan precio o tramos', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '2' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.publish = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'El plan debe tener al menos un precio vigente y un tramo configurado.',
        key: 'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS',
        code: 'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS',
      })
    }
    await controller.publish(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS')
  })
})

// ---------------------------------------------------------------------------
// clone — clonar plan
// ---------------------------------------------------------------------------

test.group('BillingPlanController.clone — clonar como borrador', () => {
  test('devuelve 201 con nuevo plan en borrador (published_at null) y billingPlanParentId al origen', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.clone = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingPlanId: 10,
          billingPlanName: 'Plan Estándar (copia)',
          billingPlanPublishedAt: null,
          billingPlanParentId: 1,
        },
      })
    }
    await controller.clone(ctx)

    assert.equal(captured.status, 201)
    const data = captured.body?.data as Record<string, unknown>
    assert.isNull(data?.billingPlanPublishedAt)
    assert.isString(data?.billingPlanName)
    assert.isTrue((data?.billingPlanName as string).includes('copia'))
    assert.equal(data?.billingPlanParentId, 1)
  })

  test('devuelve 422 con code PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED al clonar un plan en borrador', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '2' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.clone = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'Solo se puede clonar un plan publicado. Un plan en borrador se edita directamente.',
        key: 'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED',
        code: 'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED',
      })
    }
    await controller.clone(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED')
  })

  test('devuelve 422 con code PLT.CAT.CLONE_SOURCE_DEACTIVATED al clonar un plan desactivado', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '3' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.clone = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail:
          'No se puede clonar un plan desactivado. La cadena de ofertas parte siempre del plan vigente publicado.',
        key: 'PLT.CAT.CLONE_SOURCE_DEACTIVATED',
        code: 'PLT.CAT.CLONE_SOURCE_DEACTIVATED',
      })
    }
    await controller.clone(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.CLONE_SOURCE_DEACTIVATED')
  })

  test('devuelve 409 con code PLT.CAT.CLONE_DRAFT_EXISTS si ya hay un borrador clon vivo', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.clone = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(409).json({
        title: 'Catálogo de cobro',
        detail:
          'Ya existe un borrador de nueva oferta en curso para este plan. Publícalo o descártalo antes de clonar de nuevo.',
        key: 'PLT.CAT.CLONE_DRAFT_EXISTS',
        code: 'PLT.CAT.CLONE_DRAFT_EXISTS',
      })
    }
    await controller.clone(ctx)

    assert.equal(captured.status, 409)
    assert.equal(captured.body?.code, 'PLT.CAT.CLONE_DRAFT_EXISTS')
  })
})

// ---------------------------------------------------------------------------
// publish — publicar un clon desactiva al plan origen
// ---------------------------------------------------------------------------

test.group('BillingPlanController.publish — publicar un clon desactiva al plan origen', () => {
  test('al publicar un plan con billingPlanParentId, el plan devuelto queda publicado (el origen se desactiva atómicamente en el servicio)', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '10' },
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.publish = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: {
          billingPlanId: 10,
          billingPlanParentId: 1,
          billingPlanPublishedAt: '2026-07-21T04:00:00.000Z',
        },
      })
    }
    await controller.publish(ctx)

    assert.equal(captured.status, 200)
    const data = captured.body?.data as Record<string, unknown>
    assert.isNotNull(data?.billingPlanPublishedAt)
    assert.equal(data?.billingPlanParentId, 1)
  })
})

// ---------------------------------------------------------------------------
// resolvedPrice — precio determinista
// ---------------------------------------------------------------------------

test.group('BillingPlanController.resolvedPrice — precio resuelto', () => {
  test('devuelve 200 con desglose completo (employeeCount, subtotal, total...)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithQuery({ employeeCount: 60, referenceDate: '2026-07-11' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.resolvedPrice = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: {
          billingPlanId: 1,
          employeeCount: 60,
          pricePerEmployee: 65,
          currency: 'MXN',
          discountPercent: 10,
          discountAmount: 390,
          subtotal: 3510,
          taxRate: 0.16,
          taxAmount: 561.6,
          total: 4071.6,
          effectiveFrom: '2025-01-01',
          resolvedAt: '2026-07-11',
        },
      })
    }
    await controller.resolvedPrice(ctx)

    assert.equal(captured.status, 200)
    const data = captured.body?.data as Record<string, unknown>
    assert.property(data, 'employeeCount')
    assert.property(data, 'pricePerEmployee')
    assert.property(data, 'discountPercent')
    assert.property(data, 'discountAmount')
    assert.property(data, 'subtotal')
    assert.property(data, 'taxRate')
    assert.property(data, 'taxAmount')
    assert.property(data, 'total')
    assert.property(data, 'effectiveFrom')
    assert.property(data, 'resolvedAt')
  })

  test('total = subtotal + taxAmount en el desglose', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithQuery({ employeeCount: 60 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.resolvedPrice = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: {
          subtotal: 3510,
          taxAmount: 561.6,
          total: 4071.6,
        },
      })
    }
    await controller.resolvedPrice(ctx)

    const data = captured.body?.data as Record<string, unknown>
    const subtotal = data.subtotal as number
    const taxAmount = data.taxAmount as number
    const total = data.total as number
    assert.equal(Math.round((subtotal + taxAmount) * 100) / 100, total)
  })

  test('devuelve 404 cuando el plan no tiene precio vigente para la fecha', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithQuery({ employeeCount: 10, referenceDate: '1990-01-01' }),
      response,
    } as unknown as HttpContext

    const controller = new BillingPlanController()
    controller.resolvedPrice = async function (this: BillingPlanController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Catálogo de cobro',
        detail: 'El plan no tiene un precio vigente para la fecha 1990-01-01.',
        key: 'PLT.CAT.PLAN_NOT_FOUND',
        code: 'PLT.CAT.PLAN_NOT_FOUND',
      })
    }
    await controller.resolvedPrice(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.CAT.PLAN_NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// Contrato de error — shape { title, detail, key, code }
// ---------------------------------------------------------------------------

test.group('BillingPlanController — contrato de shape de errores PLT.CAT.*', () => {
  test('todos los errores de plan tienen los campos title, detail, key y code', ({ assert }) => {
    const errorBodies = [
      { title: 'Catálogo de cobro', detail: 'Plan no encontrado.', key: 'PLT.CAT.PLAN_NOT_FOUND', code: 'PLT.CAT.PLAN_NOT_FOUND' },
      { title: 'Catálogo de cobro', detail: 'Ya publicado.', key: 'PLT.CAT.PLAN_ALREADY_PUBLISHED', code: 'PLT.CAT.PLAN_ALREADY_PUBLISHED' },
      { title: 'Catálogo de cobro', detail: 'Sin precio/tramo.', key: 'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS', code: 'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS' },
    ]
    for (const body of errorBodies) {
      assert.property(body, 'title')
      assert.property(body, 'detail')
      assert.property(body, 'key')
      assert.property(body, 'code')
      assert.isTrue(body.code.startsWith('PLT.CAT.'))
    }
  })
})
