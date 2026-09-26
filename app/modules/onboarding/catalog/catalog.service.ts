import CatalogRepositoryMysql from './catalog.repository.mysql.js'
import type { CatalogRepository } from './catalog.repository.js'
import type OnboardingFlow from '#models/onboarding_flow'
import type OnboardingStep from '#models/onboarding_step'

/**
 * Servicio de lectura del catálogo de onboarding.
 * Solo expone datos del catálogo (flujos/pasos); no crea ni muta datos de negocio.
 */
export default class CatalogService {
  private readonly repository: CatalogRepository

  constructor(repository: CatalogRepository = new CatalogRepositoryMysql()) {
    this.repository = repository
  }

  async listActiveFlows(): Promise<OnboardingFlow[]> {
    return this.repository.listActiveFlows()
  }

  async findActiveFlowBySlug(slug: string): Promise<OnboardingFlow | null> {
    return this.repository.findActiveFlowBySlug(slug)
  }

  async findActiveFlowById(id: number): Promise<OnboardingFlow | null> {
    return this.repository.findActiveFlowById(id)
  }

  async listCommonSteps(): Promise<OnboardingStep[]> {
    return this.repository.listCommonSteps()
  }

  async listBranchSteps(flowId: number): Promise<OnboardingStep[]> {
    return this.repository.listBranchSteps(flowId)
  }

  async findActiveStepBySlug(slug: string): Promise<OnboardingStep | null> {
    return this.repository.findActiveStepBySlug(slug)
  }
}
