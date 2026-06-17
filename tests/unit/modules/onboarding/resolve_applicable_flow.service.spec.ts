import { test } from '@japa/runner'
import ResolveApplicableFlowService from '../../../../app/modules/onboarding/state/resolve_applicable_flow.service.js'
import type { CatalogRepository } from '../../../../app/modules/onboarding/catalog/catalog.repository.js'
import type { StateRepository } from '../../../../app/modules/onboarding/state/state.repository.js'
import type OnboardingFlow from '../../../../app/models/onboarding_flow.js'
import type OnboardingStep from '../../../../app/models/onboarding_step.js'
import type OnboardingUserState from '../../../../app/models/onboarding_user_state.js'
import type OnboardingUserStepProgress from '../../../../app/models/onboarding_user_step_progress.js'

// ---------------------------------------------------------------------------
// Factories de datos de prueba
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<Record<string, unknown>> = {}): OnboardingStep {
  return {
    onboardingStepId: 1,
    onboardingFlowId: null,
    onboardingStepSlug: 'setup-structure',
    onboardingStepName: 'Configura la estructura de tu empresa',
    onboardingStepDescription: null,
    onboardingStepOrder: 1,
    onboardingStepIsSkippable: false,
    onboardingStepCompletionHint: 'company.structure.ready',
    onboardingStepActive: true,
    ...overrides,
  } as unknown as OnboardingStep
}

function makeProgress(stepId: number, status: 'completed' | 'skipped'): OnboardingUserStepProgress {
  return {
    onboardingUserStepProgressId: 1,
    userId: 100,
    onboardingStepId: stepId,
    status,
  } as unknown as OnboardingUserStepProgress
}

function makeCatalogRepo(opts: {
  commonSteps?: OnboardingStep[]
  branchSteps?: OnboardingStep[]
} = {}): CatalogRepository {
  return {
    async listActiveFlows() { return [] as OnboardingFlow[] },
    async findActiveFlowBySlug(_slug) { return null },
    async findActiveFlowById(_id) { return null },
    async listCommonSteps() { return opts.commonSteps ?? [] },
    async listBranchSteps(_flowId) { return opts.branchSteps ?? [] },
    async findActiveStepBySlug(_slug) { return null },
  }
}

function makeStateRepo(progressList: OnboardingUserStepProgress[] = []): StateRepository {
  return {
    async findOrCreateUserState(userId) {
      return { userId, onboardingFlowId: null } as unknown as OnboardingUserState
    },
    async updateUserState(state, attrs) {
      Object.assign(state, attrs)
      return state
    },
    async upsertStepProgress(_userId, stepId, status) {
      return makeProgress(stepId, status)
    },
    async listStepProgressForUser(_userId) { return progressList },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.group('ResolveApplicableFlowService — composición del flujo aplicable', () => {
  // AC1 — Sin intención: solo pasos comunes
  test('sin intención elegida devuelve únicamente los pasos comunes', async ({ assert }) => {
    const commonSteps = [
      makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure', onboardingStepOrder: 1 }),
      makeStep({ onboardingStepId: 2, onboardingStepSlug: 'first-employee', onboardingStepOrder: 2, onboardingStepIsSkippable: true }),
    ]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps }),
      makeStateRepo()
    )

    const result = await service.resolve(100, null, null)

    assert.lengthOf(result, 2)
    assert.equal(result[0].slug, 'setup-structure')
    assert.equal(result[1].slug, 'first-employee')
  })

  // AC2 — Con intención: comunes primero, luego rama
  test('con intención elegida devuelve comunes seguidos de los pasos de rama', async ({ assert }) => {
    const commonSteps = [
      makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure', onboardingStepOrder: 1 }),
    ]
    const branchSteps = [
      makeStep({
        onboardingStepId: 10,
        onboardingFlowId: 5,
        onboardingStepSlug: 'attendance-shift',
        onboardingStepOrder: 1,
        onboardingStepIsSkippable: true,
      }),
    ]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps, branchSteps }),
      makeStateRepo()
    )

    const result = await service.resolve(100, 5, 'attendance')

    assert.lengthOf(result, 2)
    assert.equal(result[0].slug, 'setup-structure')
    assert.equal(result[1].slug, 'attendance-shift')
  })

  // Comunes SIEMPRE primero (orden garantizado)
  test('los pasos comunes siempre anteceden a los pasos de rama', async ({ assert }) => {
    const commonSteps = [
      makeStep({ onboardingStepId: 1, onboardingStepSlug: 'c1', onboardingStepOrder: 1 }),
      makeStep({ onboardingStepId: 2, onboardingStepSlug: 'c2', onboardingStepOrder: 2 }),
    ]
    const branchSteps = [
      makeStep({ onboardingStepId: 10, onboardingStepSlug: 'b1', onboardingStepOrder: 1, onboardingFlowId: 3 }),
      makeStep({ onboardingStepId: 11, onboardingStepSlug: 'b2', onboardingStepOrder: 2, onboardingFlowId: 3 }),
    ]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps, branchSteps }),
      makeStateRepo()
    )

    const result = await service.resolve(100, 3, 'vacations')

    assert.deepEqual(
      result.map(s => s.slug),
      ['c1', 'c2', 'b1', 'b2']
    )
  })

  // flowSlug null para comunes, slug del flujo para rama
  test('los pasos comunes tienen flowSlug null y los de rama tienen el slug del flujo', async ({ assert }) => {
    const commonSteps = [makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure' })]
    const branchSteps = [
      makeStep({ onboardingStepId: 10, onboardingStepSlug: 'branch-step', onboardingFlowId: 1 }),
    ]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps, branchSteps }),
      makeStateRepo()
    )

    const result = await service.resolve(100, 1, 'attendance')

    assert.isNull(result[0].flowSlug)
    assert.equal(result[1].flowSlug, 'attendance')
  })

  // Progress pending cuando no hay entradas de progreso
  test('todos los pasos tienen progress pending cuando el usuario no ha avanzado', async ({ assert }) => {
    const commonSteps = [
      makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure' }),
      makeStep({ onboardingStepId: 2, onboardingStepSlug: 'first-employee', onboardingStepIsSkippable: true }),
    ]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps }),
      makeStateRepo([])
    )

    const result = await service.resolve(100, null, null)

    assert.isTrue(result.every(s => s.progress === 'pending'))
  })

  // Cruce correcto con el progreso existente
  test('cruza correctamente el progreso: completed, skipped y pending', async ({ assert }) => {
    const step1 = makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure' })
    const step2 = makeStep({ onboardingStepId: 2, onboardingStepSlug: 'first-employee', onboardingStepIsSkippable: true })
    const step3 = makeStep({ onboardingStepId: 3, onboardingStepSlug: 'try-as-employee', onboardingStepIsSkippable: true })

    const progressList = [
      makeProgress(1, 'completed'),
      makeProgress(2, 'skipped'),
    ]

    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps: [step1, step2, step3] }),
      makeStateRepo(progressList)
    )

    const result = await service.resolve(100, null, null)

    assert.equal(result[0].progress, 'completed')
    assert.equal(result[1].progress, 'skipped')
    assert.equal(result[2].progress, 'pending')
  })

  // Sin pasos comunes ni intención → secuencia vacía
  test('devuelve secuencia vacía si no hay pasos comunes ni intención', async ({ assert }) => {
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps: [], branchSteps: [] }),
      makeStateRepo()
    )

    const result = await service.resolve(100, null, null)

    assert.deepEqual(result, [])
  })

  // Con intención pero sin pasos de rama → solo comunes
  test('con intención elegida pero sin pasos de rama devuelve solo los comunes', async ({ assert }) => {
    const commonSteps = [makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure' })]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps, branchSteps: [] }),
      makeStateRepo()
    )

    const result = await service.resolve(100, 7, 'records')

    assert.lengthOf(result, 1)
    assert.equal(result[0].slug, 'setup-structure')
  })

  // El step incluye su stepId interno (para upsert de progreso)
  test('cada paso resuelto expone stepId con el id de la BD', async ({ assert }) => {
    const step = makeStep({ onboardingStepId: 42, onboardingStepSlug: 'setup-structure' })
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps: [step] }),
      makeStateRepo()
    )

    const result = await service.resolve(100, null, null)

    assert.equal(result[0].stepId, 42)
  })

  // Progreso de un paso huérfano (paso de rama no elegida) no contamina la secuencia
  test('el progreso de un paso de otra rama no afecta la secuencia aplicable', async ({ assert }) => {
    const commonSteps = [makeStep({ onboardingStepId: 1, onboardingStepSlug: 'setup-structure' })]
    // Progreso de un paso que NO está en la secuencia (step_id 99 de otra rama)
    const progressList = [makeProgress(99, 'completed')]
    const service = new ResolveApplicableFlowService(
      makeCatalogRepo({ commonSteps }),
      makeStateRepo(progressList)
    )

    const result = await service.resolve(100, null, null)

    // El paso id=1 no tiene progreso; el progreso del id=99 se ignora
    assert.equal(result[0].progress, 'pending')
  })
})
