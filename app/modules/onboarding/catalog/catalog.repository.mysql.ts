import OnboardingFlow from '#models/onboarding_flow'
import OnboardingStep from '#models/onboarding_step'
import type { CatalogRepository } from './catalog.repository.js'

/** Implementación Lucid/MySQL del repositorio del catálogo de onboarding. */
export default class CatalogRepositoryMysql implements CatalogRepository {
  async listActiveFlows(): Promise<OnboardingFlow[]> {
    return OnboardingFlow.query()
      .whereNull('onboarding_flow_deleted_at')
      .where('onboarding_flow_active', true)
      .orderBy('onboarding_flow_order', 'asc')
  }

  async findActiveFlowBySlug(slug: string): Promise<OnboardingFlow | null> {
    return OnboardingFlow.query()
      .whereNull('onboarding_flow_deleted_at')
      .where('onboarding_flow_active', true)
      .where('onboarding_flow_slug', slug)
      .first()
  }

  async findActiveFlowById(id: number): Promise<OnboardingFlow | null> {
    return OnboardingFlow.query()
      .whereNull('onboarding_flow_deleted_at')
      .where('onboarding_flow_active', true)
      .where('onboarding_flow_id', id)
      .first()
  }

  async listCommonSteps(): Promise<OnboardingStep[]> {
    return OnboardingStep.query()
      .whereNull('onboarding_step_deleted_at')
      .where('onboarding_step_active', true)
      .whereNull('onboarding_flow_id')
      .orderBy('onboarding_step_order', 'asc')
  }

  async listBranchSteps(flowId: number): Promise<OnboardingStep[]> {
    return OnboardingStep.query()
      .whereNull('onboarding_step_deleted_at')
      .where('onboarding_step_active', true)
      .where('onboarding_flow_id', flowId)
      .orderBy('onboarding_step_order', 'asc')
  }

  async findActiveStepBySlug(slug: string): Promise<OnboardingStep | null> {
    return OnboardingStep.query()
      .whereNull('onboarding_step_deleted_at')
      .where('onboarding_step_active', true)
      .where('onboarding_step_slug', slug)
      .first()
  }
}
