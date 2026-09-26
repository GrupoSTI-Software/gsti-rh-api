import db from '@adonisjs/lucid/services/db'
import TeleworkPolicyError from '#exceptions/telework_policy_error'
import { sanitizeTeleworkPolicyComponents } from '#helpers/sanitize_telework_policy_content'
import { TELEWORK_POLICY_COMPONENT_KEYS } from '#constants/telework_policy'
import type TeleworkPolicy from '#models/telework_policy'
import type TeleworkPolicyAcknowledgement from '#models/telework_policy_acknowledgement'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'
import TeleworkWorkerService from '#services/telework_worker_service'
import { computeTeleworkPolicyContentHash } from './telework_policy.hash.js'
import TeleworkPolicyNotificationService from './telework_policy_notification.service.js'
import TeleworkPolicyRepositoryMysql from './telework_policy.repository.mysql.js'
import type { TeleworkPolicyRepository } from './telework_policy.repository.js'
import TeleworkPolicyAcknowledgementRepositoryMysql from './telework_policy_acknowledgement.repository.mysql.js'
import type { TeleworkPolicyAcknowledgementRepository } from './telework_policy_acknowledgement.repository.js'
import type {
  TeleworkPolicyAcknowledgementRowDto,
  TeleworkPolicyAcknowledgementTrackingDto,
  TeleworkPolicyCurrentSummaryDto,
  TeleworkPolicyDiffusionSummaryDto,
  TeleworkPolicyDto,
  TeleworkPolicyPublishResultDto,
  TeleworkPolicyRemindResultDto,
  TeleworkPolicyStateDto,
  TeleworkPolicyTemplateDto,
  TeleworkPolicyVersionDto,
} from './dto/telework_policy.dto.js'
import type { TeleworkPolicyInitializeInput } from './validators/telework_policy_initialize.validator.js'
import type { TeleworkPolicyUpdateInput } from './validators/telework_policy_update.validator.js'

export default class TeleworkPolicyService {
  private readonly repository: TeleworkPolicyRepository
  private readonly acknowledgementRepository: TeleworkPolicyAcknowledgementRepository
  private readonly workerService: TeleworkWorkerService
  private readonly notificationService: TeleworkPolicyNotificationService

  constructor(
    repository: TeleworkPolicyRepository = new TeleworkPolicyRepositoryMysql(),
    acknowledgementRepository: TeleworkPolicyAcknowledgementRepository = new TeleworkPolicyAcknowledgementRepositoryMysql(),
    workerService: TeleworkWorkerService = new TeleworkWorkerService(),
    notificationService: TeleworkPolicyNotificationService = new TeleworkPolicyNotificationService()
  ) {
    this.repository = repository
    this.acknowledgementRepository = acknowledgementRepository
    this.workerService = workerService
    this.notificationService = notificationService
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
   *
   * `current` (NUEVO, USRH1783547655377): resumen de la versión vigente
   * publicada, aparte de `policy` — así conviven borrador y vigente tras
   * publicar y abrir un nuevo borrador (regla de negocio 12) sin encadenar
   * un segundo request desde el BO.
   */
  async getPolicy(businessUnitId: number): Promise<TeleworkPolicyStateDto> {
    this.assertScopeResolved(businessUnitId)

    const record = await this.repository.findActiveByBusinessUnit(businessUnitId)
    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)

    return {
      exists: !!record,
      policy: record ? this.buildDto(record) : null,
      current: current ? this.buildCurrentSummaryDto(current) : null,
    }
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

  /**
   * Publica el borrador (USRH1783547655377, reglas de negocio 1, 2, 3, 13):
   * valida completitud de los 12 componentes, congela una versión inmutable
   * con su sello de contenido, la vuelve vigente (apagando la anterior en la
   * misma transacción) y, POST-COMMIT, difunde por correo al conjunto del
   * listado 5.1 con bitácora. Un fallo de correo nunca revierte la
   * publicación (regla de negocio 5).
   */
  async publish(businessUnitId: number, actorUserId: number): Promise<TeleworkPolicyPublishResultDto> {
    this.assertScopeResolved(businessUnitId)

    const published = await db.transaction(async (trx) => {
      const draft = await this.repository.findActiveByBusinessUnitForUpdate(businessUnitId, trx)
      if (!draft) {
        throw new TeleworkPolicyError('politica-inexistente')
      }
      if (draft.teleworkPolicyStatus !== 'draft') {
        throw new TeleworkPolicyError('politica-publicada-inmutable')
      }

      // Defensivo: el set de 12 `key` guardado no debería poder desalinearse
      // (ya se validó al guardar el borrador), pero se revalida antes de
      // publicar por si el registro se originó de otra vía.
      this.assertExactStructure(draft.teleworkPolicyComponents)
      this.assertComponentsComplete(draft.teleworkPolicyComponents)

      const contentHash = computeTeleworkPolicyContentHash(
        draft.teleworkPolicyTitle,
        draft.teleworkPolicyComponents
      )

      const vigenteActual = await this.repository.findCurrentByBusinessUnitForUpdate(
        businessUnitId,
        trx
      )
      if (vigenteActual) {
        await this.repository.clearCurrentFlag(vigenteActual.teleworkPolicyId, trx)
      }

      return this.repository.markAsPublished(
        draft.teleworkPolicyId,
        { publishedByUserId: actorUserId, contentHash },
        trx
      )
    })

    // POST-COMMIT: la difusión jamás revierte la publicación ni corre dentro
    // del lock (reglas de negocio 3 y 5).
    const recipients = await this.workerService.listAllForNotification([businessUnitId])
    const diffusion = await this.notificationService.send(
      published,
      recipients,
      'publication',
      actorUserId
    )

    return { policy: this.buildDto(published), diffusion }
  }

  /**
   * Nuevo borrador partiendo de la última versión publicada (regla de
   * negocio 12): nunca de hoja en blanco. 409 si ya hay un borrador activo
   * (se edita ese, no se apila otro); 404 `sin-version-vigente` si la
   * empresa tuvo algo (p. ej. un borrador descartado) pero nunca publicó, o
   * `politica-inexistente` si nunca tuvo absolutamente nada.
   */
  async createDraftFromLatest(
    businessUnitId: number,
    actorUserId: number
  ): Promise<TeleworkPolicyDto> {
    this.assertScopeResolved(businessUnitId)

    const active = await this.repository.findActiveByBusinessUnit(businessUnitId)
    if (active && active.teleworkPolicyStatus === 'draft') {
      throw new TeleworkPolicyError('borrador-ya-existe')
    }

    const maxVersion = await this.repository.findMaxVersion(businessUnitId)
    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)
    if (!current) {
      throw new TeleworkPolicyError(maxVersion > 0 ? 'sin-version-vigente' : 'politica-inexistente')
    }

    const components = sanitizeTeleworkPolicyComponents(
      current.teleworkPolicyComponents.map((component) => ({ ...component }))
    )

    const record = await this.repository.createDraft({
      businessUnitId,
      version: maxVersion + 1,
      title: current.teleworkPolicyTitle,
      components,
      createdByUserId: actorUserId,
    })

    return this.buildDto(record)
  }

  /** Historial de versiones de la empresa, más reciente primero (regla de negocio 2, 9). */
  async listVersions(businessUnitId: number): Promise<TeleworkPolicyVersionDto[]> {
    this.assertScopeResolved(businessUnitId)

    const records = await this.repository.listVersions(businessUnitId)
    if (records.length === 0) {
      throw new TeleworkPolicyError('politica-inexistente')
    }

    return records.map((record) => this.buildVersionDto(record))
  }

  /**
   * Seguimiento de acuses (regla de negocio 6, 7, 10, 11): conjunto 5.1 vs
   * acuses, calculado AL VUELO (no snapshot) — las altas posteriores a la
   * publicación aparecen pendientes solas. Nunca escribe acuses (solo
   * lectura); sin vigente publicada responde 200 con `hasCurrentVersion:
   * false` (no es error, el BO invita a publicar primero).
   */
  async getAcknowledgementTracking(
    businessUnitId: number
  ): Promise<TeleworkPolicyAcknowledgementTrackingDto> {
    this.assertScopeResolved(businessUnitId)

    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)
    if (!current) {
      return {
        hasCurrentVersion: false,
        currentVersion: null,
        publishedAt: null,
        summary: { total: 0, acknowledged: 0, outdated: 0, pending: 0, withoutEmail: 0 },
        workers: [],
      }
    }

    const [workers, acknowledgements] = await Promise.all([
      this.workerService.listAllForNotification([businessUnitId]),
      this.acknowledgementRepository.listByBusinessUnit(businessUnitId),
    ])

    const latestAckByEmployee = this.buildLatestAckByEmployee(acknowledgements)

    const rows: TeleworkPolicyAcknowledgementRowDto[] = []
    let acknowledged = 0
    let outdated = 0
    let pending = 0
    let withoutEmail = 0

    for (const worker of workers) {
      const hasEmail = worker.email.trim() !== ''
      if (!hasEmail) {
        withoutEmail += 1
      }

      const ack = latestAckByEmployee.get(worker.employeeId)
      if (!ack) {
        pending += 1
        rows.push({
          employeeId: worker.employeeId,
          employeeCode: worker.employeeCode,
          fullName: worker.fullName,
          position: worker.position,
          status: 'pending',
          acknowledgedVersion: null,
          acknowledgedAt: null,
          hasEmail,
        })
        continue
      }

      const acknowledgedVersion = ack.policy.teleworkPolicyVersion
      const isOutdated = acknowledgedVersion < current.teleworkPolicyVersion
      if (isOutdated) {
        outdated += 1
      } else {
        acknowledged += 1
      }

      rows.push({
        employeeId: worker.employeeId,
        employeeCode: worker.employeeCode,
        fullName: worker.fullName,
        position: worker.position,
        status: isOutdated ? 'outdated' : 'acknowledged',
        acknowledgedVersion,
        acknowledgedAt: ack.teleworkPolicyAcknowledgementAcknowledgedAt.toISO(),
        hasEmail,
      })
    }

    return {
      hasCurrentVersion: true,
      currentVersion: current.teleworkPolicyVersion,
      publishedAt: current.publishedAt ? current.publishedAt.toISO() : null,
      summary: {
        total: workers.length,
        acknowledged,
        outdated,
        pending,
        withoutEmail,
      },
      workers: rows,
    }
  }

  /**
   * Recordatorio a pendientes (regla de negocio 4, 10): masivo sin
   * `employeeIds` (todos los `outdated` + `pending` de la vigente),
   * selectivo con `employeeIds` (se intersecta con los pendientes reales —
   * jamás se envía a quien ya acusó la vigente ni a alguien fuera del
   * conjunto 5.1; ids ajenos se ignoran en silencio). 0 pendientes es 200
   * idempotente, no error.
   */
  async remindPending(
    businessUnitId: number,
    actorUserId: number,
    employeeIds?: number[]
  ): Promise<TeleworkPolicyRemindResultDto> {
    this.assertScopeResolved(businessUnitId)

    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)
    if (!current) {
      throw new TeleworkPolicyError('sin-version-vigente')
    }

    const tracking = await this.getAcknowledgementTracking(businessUnitId)
    const pendingEmployeeIds = new Set(
      tracking.workers
        .filter((worker) => worker.status === 'outdated' || worker.status === 'pending')
        .map((worker) => worker.employeeId)
    )
    const pendingTotal = pendingEmployeeIds.size

    const targetIds =
      employeeIds && employeeIds.length > 0
        ? employeeIds.filter((employeeId) => pendingEmployeeIds.has(employeeId))
        : [...pendingEmployeeIds]

    if (targetIds.length === 0) {
      return { pendingTotal, total: 0, sent: 0, failed: 0, skipped: 0 }
    }

    const targetIdSet = new Set(targetIds)
    const recipients = await this.workerService.listAllForNotification([businessUnitId])
    const targetRecipients = recipients.filter((recipient) => targetIdSet.has(recipient.employeeId))

    const diffusion = await this.notificationService.send(
      current,
      targetRecipients,
      'reminder',
      actorUserId
    )

    return { pendingTotal, ...diffusion }
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

  /**
   * Regla de negocio 13: no se publica con alguno de los 12 componentes sin
   * contenido escrito (la sección exista pero vacía no cuenta). Reusa la
   * misma regla de vacío que `buildDto` (`missingComponentKeys`), pero aquí
   * bloquea en vez de solo señalar.
   */
  private assertComponentsComplete(components: TeleworkPolicyComponent[]): void {
    const missingKeys = components
      .filter((component) => !component.body || component.body.trim() === '')
      .map((component) => component.key)

    if (missingKeys.length > 0) {
      throw new TeleworkPolicyError('politica-incompleta-para-publicar', undefined, {
        missingKeys,
        duplicatedKeys: [],
        unexpectedKeys: [],
      })
    }
  }

  /** Reduce los acuses a "el de mayor versión por empleado" (regla de negocio 7, 9: el histórico no se toca). */
  private buildLatestAckByEmployee(
    acknowledgements: TeleworkPolicyAcknowledgement[]
  ): Map<number, TeleworkPolicyAcknowledgement> {
    const latestByEmployee = new Map<number, TeleworkPolicyAcknowledgement>()
    for (const acknowledgement of acknowledgements) {
      const existing = latestByEmployee.get(acknowledgement.employeeId)
      if (!existing || acknowledgement.policy.teleworkPolicyVersion > existing.policy.teleworkPolicyVersion) {
        latestByEmployee.set(acknowledgement.employeeId, acknowledgement)
      }
    }
    return latestByEmployee
  }

  private defaultTitle(): string {
    return 'Política de Teletrabajo'
  }

  /**
   * Nombre visible de quién publicó (espejo `legal_document.buildPublishedByDto`):
   * nunca el userId crudo. `null` si la fila es un borrador (no publicada) o
   * si el usuario publicador fue eliminado (FK `SET NULL`).
   */
  private resolvePublishedByName(record: TeleworkPolicy): string | null {
    const user = record.publisher
    if (!user) {
      return null
    }

    const person = user.person
    const fullName = person
      ? [person.personFirstname, person.personLastname, person.personSecondLastname]
          .filter(Boolean)
          .join(' ')
          .trim()
      : ''

    return fullName || user.userEmail
  }

  private buildCurrentSummaryDto(record: TeleworkPolicy): TeleworkPolicyCurrentSummaryDto {
    return {
      id: record.teleworkPolicyId,
      version: record.teleworkPolicyVersion,
      publishedAt: record.publishedAt ? record.publishedAt.toISO() ?? '' : '',
      publishedByName: this.resolvePublishedByName(record),
      contentHash: record.teleworkPolicyContentHash ?? '',
    }
  }

  private buildVersionDto(record: TeleworkPolicy): TeleworkPolicyVersionDto {
    return {
      id: record.teleworkPolicyId,
      version: record.teleworkPolicyVersion,
      status: record.teleworkPolicyStatus,
      isCurrent: record.teleworkPolicyIsCurrent,
      publishedAt: record.publishedAt ? record.publishedAt.toISO() : null,
      publishedByName: this.resolvePublishedByName(record),
      contentHash: record.teleworkPolicyContentHash,
      createdAt: record.teleworkPolicyCreatedAt.toISO() ?? '',
    }
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
      contentHash: record.teleworkPolicyContentHash,
      publishedAt: record.publishedAt ? record.publishedAt.toISO() : null,
      publishedByName: this.resolvePublishedByName(record),
      createdAt: record.teleworkPolicyCreatedAt.toISO() ?? '',
      updatedAt: record.teleworkPolicyUpdatedAt.toISO() ?? '',
      createdByUserId: record.createdByUserId,
      updatedByUserId: record.updatedByUserId,
    }
  }
}

export type { TeleworkPolicyDiffusionSummaryDto }
