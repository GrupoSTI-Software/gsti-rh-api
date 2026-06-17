import CatalogRepositoryMysql from '#modules/onboarding/catalog/catalog.repository.mysql'
import StateRepositoryMysql from './state.repository.mysql.js'
import type { CatalogRepository } from '#modules/onboarding/catalog/catalog.repository'
import type { StateRepository } from './state.repository.js'
import type { ResolvedStepInternal } from '#modules/onboarding/catalog/dto/catalog.dto'

/**
 * Service de resolución del flujo aplicable para un usuario.
 *
 * Algoritmo:
 *  1. comunes = pasos activos con onboarding_flow_id IS NULL, ordenados por order.
 *  2. si el usuario eligió intención: rama = pasos activos del flujo elegido.
 *  3. secuenciaAplicable = comunes seguidos de rama (comunes SIEMPRE primero).
 *  4. cruzar con el progreso del usuario para fijar el campo progress de cada paso.
 *
 * No crea ni muta datos de negocio.
 */
export default class ResolveApplicableFlowService {
  private readonly catalogRepository: CatalogRepository
  private readonly stateRepository: StateRepository

  constructor(
    catalogRepository: CatalogRepository = new CatalogRepositoryMysql(),
    stateRepository: StateRepository = new StateRepositoryMysql()
  ) {
    this.catalogRepository = catalogRepository
    this.stateRepository = stateRepository
  }

  /**
   * Devuelve la secuencia aplicable de pasos con su progreso para el usuario.
   *
   * @param userId            Id del usuario autenticado.
   * @param chosenFlowId      Id del flujo elegido (null si no eligió aún o flujo desactivado).
   * @param chosenFlowSlug    Slug del flujo elegido para poblar el campo flowSlug de cada paso de rama.
   */
  async resolve(
    userId: number,
    chosenFlowId: number | null,
    chosenFlowSlug: string | null
  ): Promise<ResolvedStepInternal[]> {
    const [commonSteps, branchSteps, progressList] = await Promise.all([
      this.catalogRepository.listCommonSteps(),
      chosenFlowId ? this.catalogRepository.listBranchSteps(chosenFlowId) : Promise.resolve([]),
      this.stateRepository.listStepProgressForUser(userId),
    ])

    // Mapa rápido: onboarding_step_id → status
    const progressMap = new Map(progressList.map((p) => [p.onboardingStepId, p.status]))

    const commonResolved: ResolvedStepInternal[] = commonSteps.map((step) => ({
      stepId: step.onboardingStepId,
      slug: step.onboardingStepSlug,
      name: step.onboardingStepName,
      flowSlug: null,
      order: step.onboardingStepOrder,
      skippable: step.onboardingStepIsSkippable,
      completionHint: step.onboardingStepCompletionHint,
      progress: progressMap.get(step.onboardingStepId) ?? 'pending',
    }))

    const branchResolved: ResolvedStepInternal[] = branchSteps.map((step) => ({
      stepId: step.onboardingStepId,
      slug: step.onboardingStepSlug,
      name: step.onboardingStepName,
      flowSlug: chosenFlowSlug,
      order: step.onboardingStepOrder,
      skippable: step.onboardingStepIsSkippable,
      completionHint: step.onboardingStepCompletionHint,
      progress: progressMap.get(step.onboardingStepId) ?? 'pending',
    }))

    // Comunes siempre primero, luego la rama elegida
    return [...commonResolved, ...branchResolved]
  }
}
