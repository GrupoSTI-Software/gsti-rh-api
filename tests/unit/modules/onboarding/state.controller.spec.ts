import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import StateController from '../../../../app/modules/onboarding/state/state.controller.js'
import OnboardingError from '../../../../app/exceptions/onboarding_error.js'
import type { OnboardingErrorKey } from '../../../../app/exceptions/onboarding_error.js'
import type { OnboardingMeDto } from '../../../../app/modules/onboarding/catalog/dto/catalog.dto.js'
import type StateService from '../../../../app/modules/onboarding/state/state.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

function makeHttpContext(options: {
  userId?: number
  body?: Record<string, unknown>
  params?: Record<string, string>
} = {}): { ctx: HttpContext; captured: CapturedResponse } {
  const captured: CapturedResponse = {}

  const response = {
    status(code: number) {
      captured.status = code
      return {
        json(b: Record<string, unknown>) {
          captured.body = b
          return b
        },
      }
    },
  }

  const ctx = {
    auth: { user: { userId: options.userId ?? 100 } },
    request: {
      all() { return options.body ?? {} },
      param(name: string) { return options.params?.[name] ?? '' },
    },
    response,
  } as unknown as HttpContext

  return { ctx, captured }
}

const emptyMeDto: OnboardingMeDto = {
  status: 'pending',
  intent: null,
  availableIntents: [],
  steps: [],
}

function makeSuccessService(): StateService {
  return {
    async getOnboardingMe() { return emptyMeDto },
    async setIntent() { return emptyMeDto },
    async completeStep() { return emptyMeDto },
    async skipStep() { return emptyMeDto },
    async setStatus() { return emptyMeDto },
  } as unknown as StateService
}

function makeErrorService(error: Error): StateService {
  return {
    async getOnboardingMe() { throw error },
    async setIntent() { throw error },
    async completeStep() { throw error },
    async skipStep() { throw error },
    async setStatus() { throw error },
  } as unknown as StateService
}

// ---------------------------------------------------------------------------
// setIntent
// ---------------------------------------------------------------------------
test.group('StateController.setIntent', () => {
  test('devuelve 200 con data cuando la intención es válida', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: { intentSlug: 'attendance' } })

    await new StateController().setIntent(ctx, makeSuccessService())

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isDefined(captured.body?.data)
  })

  test('devuelve 422 con key entrada-invalida si falta intentSlug (validación Vine)', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: {} })

    await new StateController().setIntent(ctx, makeSuccessService())

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.key, 'entrada-invalida')
  })

  test('devuelve 422 con key intencion-de-onboarding-invalida (AC7)', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: { intentSlug: 'no-existe' } })
    const domainError = new OnboardingError(
      'intencion-de-onboarding-invalida',
      'Intención de onboarding inválida',
      'La intención indicada no existe o no está activa.'
    )

    await new StateController().setIntent(ctx, makeErrorService(domainError))

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.key, 'intencion-de-onboarding-invalida')
    assert.isDefined(captured.body?.title)
    assert.isDefined(captured.body?.detail)
  })

  test('devuelve 500 si ocurre un error inesperado', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: { intentSlug: 'attendance' } })

    await new StateController().setIntent(ctx, makeErrorService(new Error('DB error')))

    assert.equal(captured.status, 500)
    assert.equal(captured.body?.type, 'error')
  })
})

// ---------------------------------------------------------------------------
// completeStep
// ---------------------------------------------------------------------------
test.group('StateController.completeStep', () => {
  test('devuelve 200 con data cuando el paso existe en la secuencia', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ params: { stepSlug: 'setup-structure' } })

    await new StateController().completeStep(ctx, makeSuccessService())

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
  })

  test('devuelve 404 con key paso-de-onboarding-no-encontrado (AC6)', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ params: { stepSlug: 'paso-inexistente' } })
    const domainError = new OnboardingError(
      'paso-de-onboarding-no-encontrado',
      'Paso no encontrado',
      'El paso indicado no existe.'
    )

    await new StateController().completeStep(ctx, makeErrorService(domainError))

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.key, 'paso-de-onboarding-no-encontrado')
    assert.equal(captured.body?.type, 'warning')
  })

  test('el userId proviene de auth.user, no del body (anti-IDOR AC8)', async ({ assert }) => {
    let capturedUserId: number | undefined
    const spyService: StateService = {
      async getOnboardingMe(_id: number) { return emptyMeDto },
      async setIntent(_id: number) { return emptyMeDto },
      async completeStep(userId: number) {
        capturedUserId = userId
        return emptyMeDto
      },
      async skipStep(_id: number) { return emptyMeDto },
      async setStatus(_id: number) { return emptyMeDto },
    } as unknown as StateService

    const { ctx } = makeHttpContext({
      userId: 999,
      params: { stepSlug: 'setup-structure' },
      body: { userId: 1234 },
    })
    await new StateController().completeStep(ctx, spyService)

    assert.equal(capturedUserId, 999, 'El service debe recibir userId del auth (999), no del body')
  })
})

// ---------------------------------------------------------------------------
// skipStep
// ---------------------------------------------------------------------------
test.group('StateController.skipStep', () => {
  test('devuelve 200 cuando el paso es omitible y está en la secuencia', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ params: { stepSlug: 'first-employee' } })

    await new StateController().skipStep(ctx, makeSuccessService())

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
  })

  test('devuelve 404 con key paso-de-onboarding-no-encontrado si el slug no existe', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ params: { stepSlug: 'no-existe' } })
    const domainError = new OnboardingError(
      'paso-de-onboarding-no-encontrado',
      'Paso no encontrado',
      'El paso no existe.'
    )

    await new StateController().skipStep(ctx, makeErrorService(domainError))

    assert.equal(captured.status, 404)
    assert.equal(captured.body?.key, 'paso-de-onboarding-no-encontrado')
  })

  test('devuelve 409 con key paso-de-onboarding-no-omitible para pasos no omitibles', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ params: { stepSlug: 'setup-structure' } })
    const domainError = new OnboardingError(
      'paso-de-onboarding-no-omitible',
      'Paso no omitible',
      'Este paso no puede ser omitido.'
    )

    await new StateController().skipStep(ctx, makeErrorService(domainError))

    assert.equal(captured.status, 409)
    assert.equal(captured.body?.key, 'paso-de-onboarding-no-omitible')
  })
})

// ---------------------------------------------------------------------------
// setStatus
// ---------------------------------------------------------------------------
test.group('StateController.setStatus', () => {
  test('devuelve 200 con status dismissed', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: { status: 'dismissed' } })

    await new StateController().setStatus(ctx, makeSuccessService())

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
  })

  test('devuelve 200 con status completed', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: { status: 'completed' } })

    await new StateController().setStatus(ctx, makeSuccessService())

    assert.equal(captured.status, 200)
  })

  test('devuelve 422 con key entrada-invalida si el status es inválido (Vine)', async ({ assert }) => {
    // 'in_progress' no es válido para PUT /me/status (solo dismissed/completed)
    const { ctx, captured } = makeHttpContext({ body: { status: 'in_progress' } })

    await new StateController().setStatus(ctx, makeSuccessService())

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.key, 'entrada-invalida')
  })

  test('devuelve 422 con key entrada-invalida si el body está vacío', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ body: {} })

    await new StateController().setStatus(ctx, makeSuccessService())

    assert.equal(captured.status, 422)
    assert.equal(captured.body?.key, 'entrada-invalida')
  })
})

// ---------------------------------------------------------------------------
// Shape de las respuestas — contrato del API
// ---------------------------------------------------------------------------
test.group('StateController — shape de respuestas (contrato de API)', () => {
  test('todas las respuestas 200 tienen las propiedades type/title/message/data', async ({ assert }) => {
    const controller = new StateController()
    const service = makeSuccessService()

    // setIntent
    const { ctx: ctx1, captured: c1 } = makeHttpContext({ body: { intentSlug: 'attendance' } })
    await controller.setIntent(ctx1, service)
    assert.property(c1.body!, 'type')
    assert.property(c1.body!, 'title')
    assert.property(c1.body!, 'message')
    assert.property(c1.body!, 'data')

    // completeStep
    const { ctx: ctx2, captured: c2 } = makeHttpContext({ params: { stepSlug: 'setup-structure' } })
    await controller.completeStep(ctx2, service)
    assert.property(c2.body!, 'type')
    assert.property(c2.body!, 'title')
    assert.property(c2.body!, 'message')
    assert.property(c2.body!, 'data')

    // skipStep
    const { ctx: ctx3, captured: c3 } = makeHttpContext({ params: { stepSlug: 'first-employee' } })
    await controller.skipStep(ctx3, service)
    assert.property(c3.body!, 'type')
    assert.property(c3.body!, 'data')

    // setStatus
    const { ctx: ctx4, captured: c4 } = makeHttpContext({ body: { status: 'dismissed' } })
    await controller.setStatus(ctx4, service)
    assert.property(c4.body!, 'type')
    assert.property(c4.body!, 'data')
  })

  test('las respuestas de error de dominio tienen type/title/detail/key', async ({ assert }) => {
    const controller = new StateController()
    const errorsToTest: Array<{ key: OnboardingErrorKey; expectedStatus: number }> = [
      { key: 'intencion-de-onboarding-invalida', expectedStatus: 422 },
      { key: 'paso-de-onboarding-no-encontrado', expectedStatus: 404 },
      { key: 'paso-de-onboarding-no-omitible', expectedStatus: 409 },
    ]

    for (const { key, expectedStatus } of errorsToTest) {
      const err = new OnboardingError(key, 'Título test', 'Detalle del error test.')
      const { ctx, captured } = makeHttpContext({
        body: { intentSlug: 'x', status: 'dismissed' },
        params: { stepSlug: 'x' },
      })
      await controller.setIntent(ctx, makeErrorService(err))

      assert.equal(captured.status, expectedStatus, `Status HTTP para '${key}'`)
      assert.property(captured.body!, 'type')
      assert.property(captured.body!, 'title')
      assert.property(captured.body!, 'detail')
      assert.property(captured.body!, 'key')
      assert.equal(captured.body!.key, key)
    }
  })
})
