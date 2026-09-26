import type OnboardingFlow from '#models/onboarding_flow'
import type OnboardingStep from '#models/onboarding_step'

/**
 * Contrato del repositorio del catálogo de onboarding.
 * Solo lectura: el catálogo se alimenta por seeder, no por endpoints.
 */
export interface CatalogRepository {
  /** Lista los flujos (intenciones) activos, ordenados por onboarding_flow_order. */
  listActiveFlows(): Promise<OnboardingFlow[]>

  /** Busca un flujo activo por slug (null si no existe o está inactivo/eliminado). */
  findActiveFlowBySlug(slug: string): Promise<OnboardingFlow | null>

  /** Busca un flujo activo por id (null si no existe o está inactivo/eliminado). */
  findActiveFlowById(id: number): Promise<OnboardingFlow | null>

  /** Lista los pasos del tronco común (flow_id IS NULL, activos), ordenados por order. */
  listCommonSteps(): Promise<OnboardingStep[]>

  /** Lista los pasos de una rama (flow_id = flowId, activos), ordenados por order. */
  listBranchSteps(flowId: number): Promise<OnboardingStep[]>

  /** Busca un paso activo por slug (null si no existe, está inactivo o eliminado). */
  findActiveStepBySlug(slug: string): Promise<OnboardingStep | null>
}
