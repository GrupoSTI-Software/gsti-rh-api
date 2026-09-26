import { test } from '@japa/runner'
import StateService from '../../../../app/modules/onboarding/state/state.service.js'
import type { StateRepository } from '../../../../app/modules/onboarding/state/state.repository.js'
import type { ResolvedStepInternal } from '../../../../app/modules/onboarding/catalog/dto/catalog.dto.js'
import type OnboardingFlow from '../../../../app/models/onboarding_flow.js'
import type OnboardingStep from '../../../../app/models/onboarding_step.js'
import type OnboardingUserState from '../../../../app/models/onboarding_user_state.js'
import type OnboardingUserStepProgress from '../../../../app/models/onboarding_user_step_progress.js'
import type CatalogService from '../../../../app/modules/onboarding/catalog/catalog.service.js'
import type ResolveApplicableFlowService from '../../../../app/modules/onboarding/state/resolve_applicable_flow.service.js'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeFlow(overrides: Partial<Record<string, unknown>> = {}): OnboardingFlow {
  return {
    onboardingFlowId: 1,
    onboardingFlowSlug: 'attendance',
    onboardingFlowName: 'Control de asistencia',
    onboardingFlowDescription: null,
    onboardingFlowActive: true,
    onboardingFlowOrder: 1,
    ...overrides,
  } as unknown as OnboardingFlow
}

function makeUserState(overrides: Partial<Record<string, unknown>> = {}): OnboardingUserState {
  const base = {
    onboardingUserStateId: 1,
    userId: 100,
    onboardingFlowId: null,
    onboardingUserStateIntentSlug: null,
    onboardingUserStateStatus: 'pending',
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
  return {
    ...base,
    merge(attrs: Record<string, unknown>) { Object.assign(this, attrs) },
    save() { return Promise.resolve() },
  } as unknown as OnboardingUserState
}

function makeUserStepProgress(stepId: number, status: 'completed' | 'skipped'): OnboardingUserStepProgress {
  return {
    onboardingUserStepProgressId: 1,
    userId: 100,
    onboardingStepId: stepId,
    status,
  } as unknown as OnboardingUserStepProgress
}

function makeResolvedStep(overrides: Partial<ResolvedStepInternal> = {}): ResolvedStepInternal {
  return {
    stepId: 1,
    slug: 'setup-structure',
    name: 'Configura la estructura de tu empresa',
    flowSlug: null,
    order: 1,
    skippable: false,
    completionHint: 'company.structure.ready',
    progress: 'pending',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mocks de dependencias
// ---------------------------------------------------------------------------

function makeStatefulStateRepo(initial?: Partial<Record<string, unknown>>) {
  let currentState = makeUserState(initial)
  const progressMap = new Map<number, OnboardingUserStepProgress>()
  let upsertCalls: Array<{ userId: number; stepId: number; status: string }> = []

  const repo: StateRepository = {
    async findOrCreateUserState(userId) {
      return { ...currentState, userId } as unknown as OnboardingUserState
    },
    async updateUserState(state, attrs) {
      Object.assign(state, attrs)
      currentState = { ...currentState, ...(attrs as Record<string, unknown>) } as unknown as OnboardingUserState
      return state
    },
    async upsertStepProgress(userId, stepId, status) {
      upsertCalls.push({ userId, stepId, status })
      const entry = makeUserStepProgress(stepId, status)
      progressMap.set(stepId, { ...entry, userId })
      return progressMap.get(stepId)!
    },
    async listStepProgressForUser(_userId) {
      return Array.from(progressMap.values()) as OnboardingUserStepProgress[]
    },
  }

  return {
    repo,
    getState: () => currentState,
    getUpsertCalls: () => upsertCalls,
    resetUpsertCalls: () => { upsertCalls = [] },
  }
}

function makeCatalogServiceMock(overrides: Partial<{
  flows: OnboardingFlow[]
  flowBySlug: OnboardingFlow | null
  flowById: OnboardingFlow | null
  stepBySlug: OnboardingStep | null
}> = {}) {
  return {
    async listActiveFlows() { return overrides.flows ?? [makeFlow()] },
    async findActiveFlowBySlug(_slug: string) {
      return overrides.flowBySlug !== undefined ? overrides.flowBySlug : makeFlow()
    },
    async findActiveFlowById(_id: number) {
      return overrides.flowById !== undefined ? overrides.flowById : makeFlow()
    },
    async listCommonSteps() { return [] as OnboardingStep[] },
    async listBranchSteps(_id: number) { return [] as OnboardingStep[] },
    async findActiveStepBySlug(_slug: string) { return overrides.stepBySlug ?? null },
  } as unknown as CatalogService
}

function makeResolveServiceMock(steps: ResolvedStepInternal[] = []) {
  return {
    async resolve(_userId: number, _flowId: number | null, _flowSlug: string | null) {
      return steps
    },
  } as unknown as ResolveApplicableFlowService
}

/** Captura un error lanzado por una función async y lo retorna. */
async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return err
  }
}

// ---------------------------------------------------------------------------
// AC1 — GET /me: nuevo usuario (sin intención, sin progreso)
// ---------------------------------------------------------------------------
test.group('StateService.getOnboardingMe — AC1: panorama inicial', () => {
  test('devuelve status pending, intent null y solo pasos comunes para un usuario nuevo', async ({ assert }) => {
    const flows = [
      makeFlow(),
      makeFlow({ onboardingFlowId: 2, onboardingFlowSlug: 'vacations', onboardingFlowOrder: 2 }),
    ]
    const catalogMock = makeCatalogServiceMock({ flows, flowById: null })
    const { repo } = makeStatefulStateRepo()
    const resolveMock = makeResolveServiceMock([
      makeResolvedStep({ stepId: 1, slug: 'setup-structure', flowSlug: null, progress: 'pending' }),
    ])

    const service = new StateService(catalogMock, repo, resolveMock)
    const result = await service.getOnboardingMe(100)

    assert.equal(result.status, 'pending')
    assert.isNull(result.intent)
    assert.lengthOf(result.availableIntents, 2)
    assert.equal(result.availableIntents[0].slug, 'attendance')
    assert.lengthOf(result.steps, 1)
    assert.equal(result.steps[0].slug, 'setup-structure')
    assert.equal(result.steps[0].progress, 'pending')
  })

  test('crea el estado de onboarding en pending si el usuario no tiene uno todavía', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null })
    const { repo } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    const result = await service.getOnboardingMe(100)

    assert.equal(result.status, 'pending')
  })

  test('availableIntents se devuelven ordenadas por order del catálogo', async ({ assert }) => {
    const flows = [
      makeFlow({ onboardingFlowId: 1, onboardingFlowSlug: 'attendance', onboardingFlowOrder: 1 }),
      makeFlow({ onboardingFlowId: 2, onboardingFlowSlug: 'vacations', onboardingFlowOrder: 2 }),
      makeFlow({ onboardingFlowId: 3, onboardingFlowSlug: 'records', onboardingFlowOrder: 3 }),
    ]
    const catalogMock = makeCatalogServiceMock({ flows, flowById: null })
    const { repo } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    const result = await service.getOnboardingMe(100)

    assert.deepEqual(result.availableIntents.map(i => i.slug), ['attendance', 'vacations', 'records'])
  })
})

// ---------------------------------------------------------------------------
// AC2 — setIntent: elige intención
// ---------------------------------------------------------------------------
test.group('StateService.setIntent — AC2: elegir intención', () => {
  test('guarda la intención y transiciona status a in_progress', async ({ assert }) => {
    const flow = makeFlow({ onboardingFlowId: 1, onboardingFlowSlug: 'attendance' })
    const catalogMock = makeCatalogServiceMock({ flowBySlug: flow, flowById: flow, flows: [flow] })
    const { repo, getState } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    const result = await service.setIntent(100, 'attendance')

    assert.equal(result.intent, 'attendance')
    assert.equal(result.status, 'in_progress')
    assert.equal(getState().onboardingUserStateIntentSlug, 'attendance')
    assert.equal((getState() as any).onboardingFlowId, 1)
  })

  test('lanza OnboardingError intencion-de-onboarding-invalida si el slug no existe (AC7)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowBySlug: null })
    const { repo } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    const thrown = await catchAsync(() => service.setIntent(100, 'no-existe'))

    assert.isDefined(thrown, 'Debe lanzar un error')
    assert.equal((thrown as any).key, 'intencion-de-onboarding-invalida')
    assert.equal((thrown as any).name, 'OnboardingError')
  })

  test('lanza OnboardingError intencion-de-onboarding-invalida si el flujo está desactivado', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowBySlug: null })
    const { repo } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    const thrown = await catchAsync(() => service.setIntent(100, 'attendance'))

    assert.equal((thrown as any).key, 'intencion-de-onboarding-invalida')
  })

  test('GET posterior devuelve pasos comunes + pasos de la rama elegida', async ({ assert }) => {
    const flow = makeFlow({ onboardingFlowId: 1, onboardingFlowSlug: 'attendance' })
    const catalogMock = makeCatalogServiceMock({ flowBySlug: flow, flowById: flow, flows: [flow] })
    const { repo } = makeStatefulStateRepo()
    const stepsWithBranch: ResolvedStepInternal[] = [
      makeResolvedStep({ stepId: 1, slug: 'setup-structure', flowSlug: null }),
      makeResolvedStep({ stepId: 10, slug: 'attendance-shift', flowSlug: 'attendance', order: 1 }),
    ]

    const service = new StateService(catalogMock, repo, makeResolveServiceMock(stepsWithBranch))
    const result = await service.setIntent(100, 'attendance')

    assert.lengthOf(result.steps, 2)
    assert.isNull(result.steps[0].flowSlug)
    assert.equal(result.steps[1].flowSlug, 'attendance')
  })
})

// ---------------------------------------------------------------------------
// AC3 — completeStep: completar paso (idempotente)
// ---------------------------------------------------------------------------
test.group('StateService.completeStep — AC3: completar paso', () => {
  test('llama upsertStepProgress con status completed para un paso en la secuencia', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getUpsertCalls } = makeStatefulStateRepo()
    const resolvedStep = makeResolvedStep({ stepId: 42, slug: 'setup-structure' })

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([resolvedStep]))
    await service.completeStep(100, 'setup-structure')

    const calls = getUpsertCalls()
    assert.lengthOf(calls, 1)
    assert.equal(calls[0].stepId, 42)
    assert.equal(calls[0].status, 'completed')
  })

  test('el panorama GET refleja el paso como completed', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()
    const resolvedStep = makeResolvedStep({ stepId: 1, slug: 'setup-structure', progress: 'completed' })

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([resolvedStep]))
    const result = await service.completeStep(100, 'setup-structure')

    assert.equal(result.steps[0].progress, 'completed')
  })

  test('idempotencia: llamar completeStep dos veces no lanza error (AC3)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getUpsertCalls } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([makeResolvedStep()]))
    await service.completeStep(100, 'setup-structure')
    await service.completeStep(100, 'setup-structure')

    // Llamó dos veces al upsert; la BD garantiza unicidad vía UNIQUE constraint
    assert.equal(getUpsertCalls().length, 2)
    assert.isTrue(getUpsertCalls().every(c => c.status === 'completed'))
  })

  test('lanza paso-de-onboarding-no-encontrado si el slug no está en la secuencia (AC6)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()
    const resolveMock = makeResolveServiceMock([makeResolvedStep({ slug: 'setup-structure' })])

    const service = new StateService(catalogMock, repo, resolveMock)
    const thrown = await catchAsync(() => service.completeStep(100, 'otro-paso'))

    assert.isDefined(thrown)
    assert.equal((thrown as any).key, 'paso-de-onboarding-no-encontrado')
  })

  test('no persiste nada si el paso no está en la secuencia (AC6)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getUpsertCalls } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([]))
    await catchAsync(() => service.completeStep(100, 'paso-inexistente'))

    assert.isEmpty(getUpsertCalls())
  })
})

// ---------------------------------------------------------------------------
// AC4 — skipStep: omitir paso
// ---------------------------------------------------------------------------
test.group('StateService.skipStep — AC4: omitir paso', () => {
  test('llama upsertStepProgress con status skipped para un paso omitible', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getUpsertCalls } = makeStatefulStateRepo()
    const skippable = makeResolvedStep({ stepId: 2, slug: 'first-employee', skippable: true })

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([skippable]))
    await service.skipStep(100, 'first-employee')

    assert.lengthOf(getUpsertCalls(), 1)
    assert.equal(getUpsertCalls()[0].status, 'skipped')
  })

  test('el panorama GET refleja el paso como skipped y la secuencia continúa', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()
    const steps: ResolvedStepInternal[] = [
      makeResolvedStep({ stepId: 1, slug: 'setup-structure', progress: 'pending' }),
      makeResolvedStep({ stepId: 2, slug: 'first-employee', skippable: true, progress: 'skipped', order: 2 }),
    ]

    const service = new StateService(catalogMock, repo, makeResolveServiceMock(steps))
    const result = await service.skipStep(100, 'first-employee')

    assert.lengthOf(result.steps, 2)
    assert.equal(result.steps[1].progress, 'skipped')
  })

  test('lanza paso-de-onboarding-no-omitible para un paso no omitible (AC6)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()
    const nonSkippable = makeResolvedStep({ slug: 'setup-structure', skippable: false })

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([nonSkippable]))
    const thrown = await catchAsync(() => service.skipStep(100, 'setup-structure'))

    assert.equal((thrown as any).key, 'paso-de-onboarding-no-omitible')
  })

  test('lanza paso-de-onboarding-no-encontrado si el slug no está en la secuencia', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([]))
    const thrown = await catchAsync(() => service.skipStep(100, 'no-existe'))

    assert.equal((thrown as any).key, 'paso-de-onboarding-no-encontrado')
  })

  test('idempotencia: omitir dos veces el mismo paso no lanza error', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()
    const skippable = makeResolvedStep({ slug: 'first-employee', skippable: true })

    const service = new StateService(catalogMock, repo, makeResolveServiceMock([skippable]))

    const err1 = await catchAsync(() => service.skipStep(100, 'first-employee'))
    const err2 = await catchAsync(() => service.skipStep(100, 'first-employee'))

    assert.isUndefined(err1, 'Primera llamada no debe lanzar error')
    assert.isUndefined(err2, 'Segunda llamada tampoco debe lanzar error (idempotente)')
  })
})

// ---------------------------------------------------------------------------
// AC5 — setStatus: fijar status global
// ---------------------------------------------------------------------------
test.group('StateService.setStatus — AC5: status global', () => {
  test('setStatus dismissed actualiza el status', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getState } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    await service.setStatus(100, 'dismissed')

    assert.equal(getState().onboardingUserStateStatus, 'dismissed')
  })

  test('setStatus dismissed conserva el progreso existente de los pasos (AC5)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getUpsertCalls, getState } = makeStatefulStateRepo()
    const steps = [makeResolvedStep({ stepId: 1, slug: 'setup-structure', progress: 'completed' })]

    const service = new StateService(catalogMock, repo, makeResolveServiceMock(steps))

    await service.completeStep(100, 'setup-structure')
    await service.setStatus(100, 'dismissed')

    // El upsert de progreso se llamó una sola vez (para el complete, no para el dismissed)
    assert.equal(getUpsertCalls().filter(c => c.status === 'completed').length, 1)
    assert.equal(getState().onboardingUserStateStatus, 'dismissed')
  })

  test('setStatus completed actualiza el status a completed', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getState } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    await service.setStatus(100, 'completed')

    assert.equal(getState().onboardingUserStateStatus, 'completed')
  })

  test('setStatus completed fija completedAt', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo, getState } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    await service.setStatus(100, 'completed')

    assert.isNotNull((getState() as any).completedAt)
  })

  test('setStatus dismissed es reversible: se puede volver a in_progress eligiendo intención', async ({ assert }) => {
    const flow = makeFlow()
    const catalogMock = makeCatalogServiceMock({ flowById: flow, flowBySlug: flow, flows: [flow] })
    const { repo, getState } = makeStatefulStateRepo()

    const service = new StateService(catalogMock, repo, makeResolveServiceMock())
    await service.setStatus(100, 'dismissed')
    assert.equal(getState().onboardingUserStateStatus, 'dismissed')

    await service.setIntent(100, 'attendance')
    assert.equal(getState().onboardingUserStateStatus, 'in_progress')
  })
})

// ---------------------------------------------------------------------------
// Ciclo de vida — Vigencia padre-hijo
// ---------------------------------------------------------------------------
test.group('StateService — Ciclo de vida y vigencia padre-hijo', () => {
  test('si el flujo elegido se desactiva, getOnboardingMe degrada a solo pasos comunes', async ({ assert }) => {
    // findActiveFlowById retorna null → flujo desactivado
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo({
      onboardingFlowId: 1,
      onboardingUserStateIntentSlug: 'attendance',
      onboardingUserStateStatus: 'in_progress',
    })
    const commonOnly = [makeResolvedStep({ slug: 'setup-structure', flowSlug: null })]

    const service = new StateService(catalogMock, repo, makeResolveServiceMock(commonOnly))
    const result = await service.getOnboardingMe(100)

    assert.isTrue(result.steps.every(s => s.flowSlug === null))
  })

  test('complete sobre paso de una rama no elegida devuelve error 404 (AC6)', async ({ assert }) => {
    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const { repo } = makeStatefulStateRepo()
    const resolveMock = makeResolveServiceMock([makeResolvedStep({ slug: 'setup-structure' })])

    const service = new StateService(catalogMock, repo, resolveMock)
    const thrown = await catchAsync(() => service.completeStep(100, 'attendance-shift'))

    assert.equal((thrown as any).key, 'paso-de-onboarding-no-encontrado')
  })
})

// ---------------------------------------------------------------------------
// AC8 — Aislamiento por userId (anti-IDOR)
// ---------------------------------------------------------------------------
test.group('StateService — Aislamiento anti-IDOR', () => {
  test('todas las operaciones usan el userId recibido como parámetro', async ({ assert }) => {
    const observedUserIds: number[] = []

    const spyRepo: StateRepository = {
      async findOrCreateUserState(userId) {
        observedUserIds.push(userId)
        return makeUserState({ userId })
      },
      async updateUserState(state, attrs) { Object.assign(state, attrs); return state },
      async upsertStepProgress(userId, stepId, status) {
        observedUserIds.push(userId)
        return makeUserStepProgress(stepId, status)
      },
      async listStepProgressForUser(userId) { observedUserIds.push(userId); return [] },
    }
    const flow = makeFlow()
    const catalogMock = makeCatalogServiceMock({ flowById: null, flowBySlug: flow, flows: [flow] })

    const service = new StateService(catalogMock, spyRepo, makeResolveServiceMock())
    await service.getOnboardingMe(777)
    await service.setStatus(777, 'dismissed')

    assert.isTrue(
      observedUserIds.every(id => id === 777),
      `Todas las llamadas al repo deben usar userId=777; recibidos: ${observedUserIds}`
    )
  })

  test('dos usuarios distintos operan sobre estados independientes', async ({ assert }) => {
    const stateMap = new Map<number, OnboardingUserState>()

    const sharedRepo: StateRepository = {
      async findOrCreateUserState(userId) {
        if (!stateMap.has(userId)) {
          stateMap.set(userId, makeUserState({ userId, onboardingUserStateId: userId }))
        }
        return stateMap.get(userId)!
      },
      async updateUserState(state, attrs) { Object.assign(state, attrs); return state },
      async upsertStepProgress(_userId, stepId, status) { return makeUserStepProgress(stepId, status) },
      async listStepProgressForUser(_userId) { return [] },
    }

    const catalogMock = makeCatalogServiceMock({ flowById: null, flows: [] })
    const service = new StateService(catalogMock, sharedRepo, makeResolveServiceMock())

    await service.setStatus(100, 'dismissed')
    await service.setStatus(200, 'completed')

    assert.equal(stateMap.get(100)?.onboardingUserStateStatus, 'dismissed')
    assert.equal(stateMap.get(200)?.onboardingUserStateStatus, 'completed')
  })
})
