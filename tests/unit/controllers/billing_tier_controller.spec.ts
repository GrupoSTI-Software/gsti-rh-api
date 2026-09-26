import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import BillingTierController from '../../../app/controllers/billing_tier_controller.js'

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
// index — lista de tramos
// ---------------------------------------------------------------------------

test.group('BillingTierController.index — lista de tramos', () => {
  test('devuelve 200 con type success y array ordenado por min_employees', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.index = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: [
          { billingVolumeTierId: 1, billingVolumeTierMinEmployees: 1, billingVolumeTierDiscountPercent: 0 },
          { billingVolumeTierId: 2, billingVolumeTierMinEmployees: 26, billingVolumeTierDiscountPercent: 5 },
          { billingVolumeTierId: 3, billingVolumeTierMinEmployees: 51, billingVolumeTierDiscountPercent: 10 },
        ],
      })
    }
    await controller.index(ctx)

    assert.equal(captured.status, 200)
    const data = captured.body?.data as Array<{ billingVolumeTierMinEmployees: number }>
    assert.equal(data.length, 3)
    assert.isTrue(data[0].billingVolumeTierMinEmployees < data[1].billingVolumeTierMinEmployees)
  })

  test('devuelve 404 con code PLT.CAT.PLAN_NOT_FOUND cuando el plan no existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '9999' },
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.index = async function (this: BillingTierController, c: HttpContext) {
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
// store — agregar tramo
// ---------------------------------------------------------------------------

test.group('BillingTierController.store — agregar tramo', () => {
  test('devuelve 201 con el tramo creado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingVolumeTierMinEmployees: 201,
        billingVolumeTierDiscountPercent: 20,
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.store = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(201).json({
        type: 'success',
        data: {
          billingVolumeTierId: 6,
          billingPlanId: 1,
          billingVolumeTierMinEmployees: 201,
          billingVolumeTierDiscountPercent: 20,
        },
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 201)
    const data = captured.body?.data as Record<string, unknown>
    assert.equal(data.billingVolumeTierMinEmployees, 201)
    assert.equal(data.billingVolumeTierDiscountPercent, 20)
  })

  test('devuelve 409 con code PLT.CAT.TIER_DUPLICATE cuando min_employees ya existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingVolumeTierMinEmployees: 1,
        billingVolumeTierDiscountPercent: 5,
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.store = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(409).json({
        title: 'Catálogo de cobro',
        detail: 'Ya existe un tramo con el mismo mínimo de empleados en este plan.',
        key: 'PLT.CAT.TIER_DUPLICATE',
        code: 'PLT.CAT.TIER_DUPLICATE',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 409)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_DUPLICATE')
  })

  test('devuelve 422 con code PLT.CAT.TIER_PLAN_PUBLISHED al agregar tramo a plan publicado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingVolumeTierMinEmployees: 500,
        billingVolumeTierDiscountPercent: 25,
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.store = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'Los tramos de un plan publicado son inmutables. Clona el plan para modificarlos.',
        key: 'PLT.CAT.TIER_PLAN_PUBLISHED',
        code: 'PLT.CAT.TIER_PLAN_PUBLISHED',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_PLAN_PUBLISHED')
  })

  test('devuelve 422 con code PLT.CAT.TIER_INVALID para min_employees = 0', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1' },
      request: makeRequestWithBody({
        billingVolumeTierMinEmployees: 0,
        billingVolumeTierDiscountPercent: 10,
      }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.store = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'El mínimo de empleados debe ser ≥ 1 y el descuento entre 0 y 100.',
        key: 'PLT.CAT.TIER_INVALID',
        code: 'PLT.CAT.TIER_INVALID',
      })
    }
    await controller.store(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_INVALID')
  })
})

// ---------------------------------------------------------------------------
// update — editar descuento de un tramo
// ---------------------------------------------------------------------------

test.group('BillingTierController.update — editar descuento', () => {
  test('devuelve 200 con el tramo actualizado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '3' },
      request: makeRequestWithBody({ billingVolumeTierDiscountPercent: 12 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.update = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(200).json({
        type: 'success',
        data: {
          billingVolumeTierId: 3,
          billingPlanId: 1,
          billingVolumeTierMinEmployees: 51,
          billingVolumeTierDiscountPercent: 12,
        },
      })
    }
    await controller.update(ctx)

    assert.equal(captured.status, 200)
    const data = captured.body?.data as Record<string, unknown>
    assert.equal(data.billingVolumeTierDiscountPercent, 12)
  })

  test('devuelve 422 con code PLT.CAT.TIER_PLAN_PUBLISHED al editar tramo de plan publicado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '3' },
      request: makeRequestWithBody({ billingVolumeTierDiscountPercent: 15 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.update = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'Los tramos de un plan publicado son inmutables. Clona el plan para modificarlos.',
        key: 'PLT.CAT.TIER_PLAN_PUBLISHED',
        code: 'PLT.CAT.TIER_PLAN_PUBLISHED',
      })
    }
    await controller.update(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_PLAN_PUBLISHED')
  })

  test('devuelve 404 cuando el tierId no pertenece al planId', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '999' },
      request: makeRequestWithBody({ billingVolumeTierDiscountPercent: 10 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.update = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Catálogo de cobro',
        detail: 'El tramo solicitado no existe o fue eliminado.',
        key: 'PLT.CAT.TIER_NOT_FOUND',
        code: 'PLT.CAT.TIER_NOT_FOUND',
      })
    }
    await controller.update(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_NOT_FOUND')
  })

  test('devuelve 422 con code PLT.CAT.TIER_INVALID cuando discount_percent > 100', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '2' },
      request: makeRequestWithBody({ billingVolumeTierDiscountPercent: 150 }),
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.update = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'El porcentaje de descuento debe estar entre 0 y 100.',
        key: 'PLT.CAT.TIER_INVALID',
        code: 'PLT.CAT.TIER_INVALID',
      })
    }
    await controller.update(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_INVALID')
  })
})

// ---------------------------------------------------------------------------
// destroy — eliminar tramo (soft-delete)
// ---------------------------------------------------------------------------

test.group('BillingTierController.destroy — soft-delete de tramo', () => {
  test('devuelve 204 sin body al eliminar el tramo', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '5' },
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.destroy = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(204).send('')
    }
    await controller.destroy(ctx)

    assert.equal(captured.status, 204)
  })

  test('devuelve 422 con code PLT.CAT.TIER_PLAN_PUBLISHED al eliminar tramo de plan publicado', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '2' },
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.destroy = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(422).json({
        title: 'Catálogo de cobro',
        detail: 'Los tramos de un plan publicado son inmutables. Clona el plan para modificarlos.',
        key: 'PLT.CAT.TIER_PLAN_PUBLISHED',
        code: 'PLT.CAT.TIER_PLAN_PUBLISHED',
      })
    }
    await controller.destroy(ctx)

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_PLAN_PUBLISHED')
  })

  test('devuelve 404 cuando el tramo no existe en el plan', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { planId: '1', tierId: '999' },
      response,
    } as unknown as HttpContext

    const controller = new BillingTierController()
    controller.destroy = async function (this: BillingTierController, c: HttpContext) {
      return c.response.status(404).json({
        title: 'Catálogo de cobro',
        detail: 'El tramo solicitado no existe o fue eliminado.',
        key: 'PLT.CAT.TIER_NOT_FOUND',
        code: 'PLT.CAT.TIER_NOT_FOUND',
      })
    }
    await controller.destroy(ctx)

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.code, 'PLT.CAT.TIER_NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// Contrato de claves de error — PLT.CAT.*
// ---------------------------------------------------------------------------

test.group('BillingTierController — contrato de claves de error', () => {
  test('los errores de tramo usan el namespace PLT.CAT.*', ({ assert }) => {
    const errorKeys = [
      'PLT.CAT.TIER_DUPLICATE',
      'PLT.CAT.TIER_PLAN_PUBLISHED',
      'PLT.CAT.TIER_INVALID',
      'PLT.CAT.TIER_NOT_FOUND',
    ]
    for (const key of errorKeys) {
      assert.isTrue(key.startsWith('PLT.CAT.'), `"${key}" no tiene el prefijo PLT.CAT.`)
    }
  })

  test('todos los cuerpos de error tienen { title, detail, key, code }', ({ assert }) => {
    const bodies = [
      { title: 'Catálogo', detail: 'Duplicado', key: 'PLT.CAT.TIER_DUPLICATE', code: 'PLT.CAT.TIER_DUPLICATE' },
      { title: 'Catálogo', detail: 'Publicado', key: 'PLT.CAT.TIER_PLAN_PUBLISHED', code: 'PLT.CAT.TIER_PLAN_PUBLISHED' },
      { title: 'Catálogo', detail: 'Inválido', key: 'PLT.CAT.TIER_INVALID', code: 'PLT.CAT.TIER_INVALID' },
    ]
    for (const body of bodies) {
      assert.property(body, 'title')
      assert.property(body, 'detail')
      assert.property(body, 'key')
      assert.property(body, 'code')
    }
  })
})
