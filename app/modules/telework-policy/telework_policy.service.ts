import TeleworkPolicyError from '#exceptions/telework_policy_error'
import { sanitizeTeleworkPolicyComponents } from '#helpers/sanitize_telework_policy_content'
import { TELEWORK_POLICY_COMPONENT_KEYS } from '#constants/telework_policy'
import type TeleworkPolicy from '#models/telework_policy'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'
import TeleworkPolicyRepositoryMysql from './telework_policy.repository.mysql.js'
import type { TeleworkPolicyRepository } from './telework_policy.repository.js'
import type {
  TeleworkPolicyDto,
  TeleworkPolicyStateDto,
  TeleworkPolicyTemplateDto,
} from './dto/telework_policy.dto.js'
import type { TeleworkPolicyInitializeInput } from './validators/telework_policy_initialize.validator.js'
import type { TeleworkPolicyUpdateInput } from './validators/telework_policy_update.validator.js'

export default class TeleworkPolicyService {
  private readonly repository: TeleworkPolicyRepository

  constructor(repository: TeleworkPolicyRepository = new TeleworkPolicyRepositoryMysql()) {
    this.repository = repository
  }

  /** Plantilla base global vigente (para previsualizar / partir de plantilla). 404 si aún no está sembrada. */
  async getTemplate(): Promise<TeleworkPolicyTemplateDto> {
    const template = await this.repository.findTemplateCurrent()
    if (!template) {
      throw new TeleworkPolicyError('politica-inexistente')
    }
    return {
      version: template.teleworkPolicyTemplateVersion,
      components: template.teleworkPolicyTemplateComponents,
      isCurrent: template.teleworkPolicyTemplateIsCurrent,
    }
  }

  /**
   * Estado actual de la política de la empresa (regla de negocio 2, 7). Si no
   * hay fila activa, `exists: false` sin crear nada — dispara el selector
   * cero/plantilla en el BO (patrón "default virtual" de `retention_policy`).
   */
  async getPolicy(businessUnitId: number): Promise<TeleworkPolicyStateDto> {
    this.assertScopeResolved(businessUnitId)

    const record = await this.repository.findActiveByBusinessUnit(businessUnitId)
    if (!record) {
      return { exists: false, policy: null }
    }
    return { exists: true, policy: this.buildDto(record) }
  }

  /**
   * Inicializa el borrador la primera vez (regla de negocio 3): copia la
   * plantilla base (`mode: 'template'`) o arranca en blanco con el título del
   * sistema y `body` vacío (`mode: 'blank'`). Elección única — si ya existe
   * una fila activa para la empresa, 409 `politica-ya-existe`.
   */
  async initialize(
    businessUnitId: number,
    input: TeleworkPolicyInitializeInput,
    actorUserId: number
  ): Promise<TeleworkPolicyDto> {
    this.assertScopeResolved(businessUnitId)

    const existing = await this.repository.findActiveByBusinessUnit(businessUnitId)
    if (existing) {
      throw new TeleworkPolicyError('politica-ya-existe')
    }

    const template = await this.repository.findTemplateCurrent()
    if (!template) {
      throw new TeleworkPolicyError('politica-inexistente')
    }

    const components: TeleworkPolicyComponent[] =
      input.mode === 'template'
        ? template.teleworkPolicyTemplateComponents.map((component) => ({ ...component }))
        : template.teleworkPolicyTemplateComponents.map((component) => ({
            ...component,
            body: '',
          }))

    const nextVersion = (await this.repository.findMaxVersion(businessUnitId)) + 1

    const record = await this.repository.createDraft({
      businessUnitId,
      version: nextVersion,
      title: this.defaultTitle(),
      components: sanitizeTeleworkPolicyComponents(components),
      createdByUserId: actorUserId,
    })

    return this.buildDto(record)
  }

  /**
   * Edita el borrador (regla de negocio 5, 6): guarda aunque falte contenido;
   * señala qué componentes siguen vacíos en la respuesta. La estructura de 12
   * `key` exactos es obligatoria (regla 4) — 422 si no calza.
   */
  async updateDraft(
    businessUnitId: number,
    input: TeleworkPolicyUpdateInput,
    actorUserId: number
  ): Promise<TeleworkPolicyDto> {
    this.assertScopeResolved(businessUnitId)

    const existing = await this.repository.findActiveByBusinessUnit(businessUnitId)
    if (!existing) {
      throw new TeleworkPolicyError('politica-inexistente')
    }
    if (existing.teleworkPolicyStatus !== 'draft') {
      throw new TeleworkPolicyError('politica-publicada-inmutable')
    }

    this.assertExactStructure(input.components)

    const systemFieldsByKey = new Map(
      existing.teleworkPolicyComponents.map((component) => [component.key, component])
    )
    const components: TeleworkPolicyComponent[] = input.components.map((incoming) => {
      const systemFields = systemFieldsByKey.get(incoming.key)
      return {
        key: incoming.key,
        clause: systemFields?.clause ?? '',
        title: incoming.title,
        body: incoming.body ?? '',
        required: systemFields?.required ?? true,
        order: systemFields?.order ?? 0,
      }
    })

    const record = await this.repository.updateDraft(existing.teleworkPolicyId, {
      title: input.title,
      components: sanitizeTeleworkPolicyComponents(components),
      updatedByUserId: actorUserId,
    })

    return this.buildDto(record)
  }

  /** Descarta el borrador (soft delete). 409 si ya está publicado (defensa a futuro). */
  async discardDraft(businessUnitId: number): Promise<void> {
    this.assertScopeResolved(businessUnitId)

    const existing = await this.repository.findActiveByBusinessUnit(businessUnitId)
    if (!existing) {
      throw new TeleworkPolicyError('politica-inexistente')
    }
    if (existing.teleworkPolicyStatus !== 'draft') {
      throw new TeleworkPolicyError('politica-publicada-inmutable')
    }

    await this.repository.softDeleteDraft(existing.teleworkPolicyId)
  }

  /** Falla cerrado si el scope no está resuelto (cross-tenant / scope vacío). */
  private assertScopeResolved(businessUnitId: number): void {
    if (!businessUnitId || businessUnitId <= 0) {
      throw new TeleworkPolicyError('politica-inexistente')
    }
  }

  /**
   * Regla de negocio 4: el `components` del request debe traer exactamente
   * los 12 `key` esperados (`5_2_a`..`5_2_l`), sin duplicados, sin faltantes,
   * sin extra. No expresable en Vine (Vine solo valida forma, no el set).
   */
  private assertExactStructure(components: Array<{ key: string }>): void {
    const receivedKeys = components.map((component) => component.key)
    const uniqueKeys = new Set(receivedKeys)
    const expectedKeys = new Set<string>(TELEWORK_POLICY_COMPONENT_KEYS)

    const hasDuplicates = uniqueKeys.size !== receivedKeys.length
    const matchesExpectedSet =
      uniqueKeys.size === expectedKeys.size &&
      [...uniqueKeys].every((key) => expectedKeys.has(key))

    if (hasDuplicates || !matchesExpectedSet) {
      const seen = new Set<string>()
      const duplicatedKeys = [...new Set(receivedKeys.filter((key) => {
        const isRepeated = seen.has(key)
        seen.add(key)
        return isRepeated
      }))]
      const missingKeys = TELEWORK_POLICY_COMPONENT_KEYS.filter((key) => !uniqueKeys.has(key))
      const unexpectedKeys = [...uniqueKeys].filter((key) => !expectedKeys.has(key))

      throw new TeleworkPolicyError('estructura-componentes-invalida', undefined, {
        missingKeys,
        duplicatedKeys,
        unexpectedKeys,
      })
    }
  }

  private defaultTitle(): string {
    return 'Política de Teletrabajo'
  }

  private buildDto(record: TeleworkPolicy): TeleworkPolicyDto {
    const missingComponentKeys = record.teleworkPolicyComponents
      .filter((component) => !component.body || component.body.trim() === '')
      .map((component) => component.key)

    return {
      id: record.teleworkPolicyId,
      businessUnitId: record.businessUnitId,
      version: record.teleworkPolicyVersion,
      title: record.teleworkPolicyTitle,
      components: record.teleworkPolicyComponents,
      status: record.teleworkPolicyStatus,
      isCurrent: record.teleworkPolicyIsCurrent,
      missingComponentKeys,
      createdAt: record.teleworkPolicyCreatedAt.toISO() ?? '',
      updatedAt: record.teleworkPolicyUpdatedAt.toISO() ?? '',
      createdByUserId: record.createdByUserId,
      updatedByUserId: record.updatedByUserId,
    }
  }
}
