import { DateTime } from 'luxon'
import OnboardingError from '#exceptions/onboarding_error'
import CatalogService from '#modules/onboarding/catalog/catalog.service'
import StateRepositoryMysql from './state.repository.mysql.js'
import ResolveApplicableFlowService from './resolve_applicable_flow.service.js'
import type { StateRepository } from './state.repository.js'
import type { OnboardingMeDto, AvailableIntentDto, ApplicableStepDto, ResolvedStepInternal } from '#modules/onboarding/catalog/dto/catalog.dto'
import type OnboardingFlow from '#models/onboarding_flow'
import type OnboardingUserState from '#models/onboarding_user_state'

/**
 * Servicio principal del motor de onboarding.
 * Orquesta el catálogo, el estado del usuario y la resolución del flujo aplicable.
 *
 * Aislamiento: todas las operaciones reciben userId desde auth.user.userId.
 * El motor nunca acepta un userId del cliente (anti-IDOR).
 */
export default class StateService {
  private readonly catalogService: CatalogService
  private readonly stateRepository: StateRepository
  private readonly resolveApplicableFlow: ResolveApplicableFlowService

  constructor(
    catalogService: CatalogService = new CatalogService(),
    stateRepository: StateRepository = new StateRepositoryMysql(),
    resolveApplicableFlow: ResolveApplicableFlowService = new ResolveApplicableFlowService()
  ) {
    this.catalogService = catalogService
    this.stateRepository = stateRepository
    this.resolveApplicableFlow = resolveApplicableFlow
  }

  /** GET /me — devuelve el panorama completo del onboarding del usuario. */
  async getOnboardingMe(userId: number): Promise<OnboardingMeDto> {
    const [flows, state] = await Promise.all([
      this.catalogService.listActiveFlows(),
      this.stateRepository.findOrCreateUserState(userId),
    ])

    // Si el flujo elegido fue desactivado, degradar a solo pasos comunes
    const effectiveFlowId = await this.resolveEffectiveFlowId(state)
    const effectiveFlowSlug =
      effectiveFlowId !== null ? state.onboardingUserStateIntentSlug : null

    const steps = await this.resolveApplicableFlow.resolve(
      userId,
      effectiveFlowId,
      effectiveFlowSlug
    )

    return this.buildDto(flows, state, steps)
  }

  /** PUT /me/intent — elige o cambia la intención del usuario. */
  async setIntent(userId: number, intentSlug: string): Promise<OnboardingMeDto> {
    const flow = await this.catalogService.findActiveFlowBySlug(intentSlug)
    if (!flow) {
      throw new OnboardingError(
        'intencion-de-onboarding-invalida',
        'Intención de onboarding inválida',
        'La intención indicada no existe o no está activa.'
      )
    }

    const state = await this.stateRepository.findOrCreateUserState(userId)
    await this.stateRepository.updateUserState(state, {
      onboardingFlowId: flow.onboardingFlowId,
      onboardingUserStateIntentSlug: flow.onboardingFlowSlug,
      onboardingUserStateStatus: 'in_progress',
      startedAt: state.startedAt ?? DateTime.now(),
    } as Partial<OnboardingUserState>)

    return this.getOnboardingMe(userId)
  }

  /** POST /me/steps/:stepSlug/complete — marca un paso como completado (idempotente). */
  async completeStep(userId: number, stepSlug: string): Promise<OnboardingMeDto> {
    const resolvedStep = await this.findApplicableStep(userId, stepSlug)
    await this.stateRepository.upsertStepProgress(userId, resolvedStep.stepId, 'completed')
    return this.getOnboardingMe(userId)
  }

  /** POST /me/steps/:stepSlug/skip — omite un paso omitible (idempotente). */
  async skipStep(userId: number, stepSlug: string): Promise<OnboardingMeDto> {
    const resolvedStep = await this.findApplicableStep(userId, stepSlug)

    if (!resolvedStep.skippable) {
      throw new OnboardingError(
        'paso-de-onboarding-no-omitible',
        'Paso no omitible',
        'Este paso no puede ser omitido.'
      )
    }

    await this.stateRepository.upsertStepProgress(userId, resolvedStep.stepId, 'skipped')
    return this.getOnboardingMe(userId)
  }

  /** PUT /me/status — fija el status global (dismissed | completed). */
  async setStatus(
    userId: number,
    status: 'dismissed' | 'completed'
  ): Promise<OnboardingMeDto> {
    const state = await this.stateRepository.findOrCreateUserState(userId)

    const updates: Partial<OnboardingUserState> = {
      onboardingUserStateStatus: status,
    } as Partial<OnboardingUserState>

    if (status === 'completed') {
      (updates as any).completedAt = DateTime.now()
    }

    await this.stateRepository.updateUserState(state, updates)
    return this.getOnboardingMe(userId)
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Busca el paso por slug dentro de la secuencia aplicable del usuario.
   * Lanza 404 si el paso no existe, está inactivo o pertenece a una rama no elegida.
   */
  private async findApplicableStep(
    userId: number,
    stepSlug: string
  ): Promise<ResolvedStepInternal> {
    const state = await this.stateRepository.findOrCreateUserState(userId)
    const effectiveFlowId = await this.resolveEffectiveFlowId(state)
    const effectiveFlowSlug =
      effectiveFlowId !== null ? state.onboardingUserStateIntentSlug : null

    const steps = await this.resolveApplicableFlow.resolve(userId, effectiveFlowId, effectiveFlowSlug)
    const target = steps.find((s) => s.slug === stepSlug)

    if (!target) {
      throw new OnboardingError(
        'paso-de-onboarding-no-encontrado',
        'Paso no encontrado',
        'El paso indicado no existe, está inactivo o no pertenece al flujo del usuario.'
      )
    }

    return target
  }

  /**
   * Devuelve el flowId efectivo:
   * - null si el usuario no eligió intención.
   * - null si el flujo elegido fue desactivado (degrada a solo comunes).
   * - el flowId del estado si el flujo sigue activo.
   */
  private async resolveEffectiveFlowId(
    state: OnboardingUserState
  ): Promise<number | null> {
    if (!state.onboardingFlowId) {
      return null
    }
    const flow = await this.catalogService.findActiveFlowById(state.onboardingFlowId)
    return flow ? flow.onboardingFlowId : null
  }

  /** Compone el DTO de panorama a partir de datos ya resueltos. */
  private buildDto(
    flows: OnboardingFlow[],
    state: OnboardingUserState,
    steps: ResolvedStepInternal[]
  ): OnboardingMeDto {
    const availableIntents: AvailableIntentDto[] = flows.map((f) => ({
      slug: f.onboardingFlowSlug,
      name: f.onboardingFlowName,
      order: f.onboardingFlowOrder,
    }))

    const publicSteps: ApplicableStepDto[] = steps.map(({ stepId: _stepId, ...rest }) => rest)

    return {
      status: state.onboardingUserStateStatus,
      intent: state.onboardingUserStateIntentSlug,
      availableIntents,
      steps: publicSteps,
    }
  }
}
