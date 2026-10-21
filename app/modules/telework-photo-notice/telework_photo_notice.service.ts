import { sanitizeTeleworkPolicyHtml } from '#helpers/sanitize_telework_policy_content'
import { TELEWORK_PHOTO_NOTICE_PLACEHOLDERS } from '#constants/telework_photo_notice'
import type TeleworkPhotoNotice from '#models/telework_photo_notice'
import TeleworkPhotoNoticeError from './telework_photo_notice.error.js'
import TeleworkPhotoNoticeRepositoryMysql from './telework_photo_notice.repository.mysql.js'
import type { TeleworkPhotoNoticeRepository } from './telework_photo_notice.repository.js'
import type {
  NoticeDraftDto,
  NoticeStateDto,
  NoticeTemplateDto,
  NoticeVersionDto,
} from './dto/telework_photo_notice.dto.js'
import type { TeleworkPhotoNoticeUpdateInput } from './validators/telework_photo_notice_update.validator.js'

/**
 * Dominio de lectura del aviso de privacidad de la evidencia fotográfica del
 * puesto de trabajo (VLRH-H1791306079310): plantilla, estado, ciclo del
 * borrador, historial de versiones con su conteo de acuses y
 * `hasAcknowledgedCurrent`. `publish` llega en la Tarea 3.
 *
 * Misma regla de seguridad que `telework-policy`: `businessUnitId` sale
 * siempre del scope resuelto de la sesión, nunca del payload; si no es un
 * entero positivo, el servicio falla cerrado (`aviso-no-publicado`, 404) sin
 * tocar el repositorio (Review Focus 3). Y nada se borra (C0129 R3, CA-17):
 * lo único descartable es el borrador, por soft delete.
 *
 * Todo texto se sanea con `sanitizeTeleworkPolicyHtml` al guardar y al servir:
 * la plantilla y el borrador viajan CON marcadores; la versión publicada sirve
 * su `rendered_content` ya resuelto.
 */
export default class TeleworkPhotoNoticeService {
  private readonly repository: TeleworkPhotoNoticeRepository

  constructor(repository: TeleworkPhotoNoticeRepository = new TeleworkPhotoNoticeRepositoryMysql()) {
    this.repository = repository
  }

  /**
   * Plantilla base global vigente, con su texto CON marcadores sin resolver y
   * la lista cerrada (`razon_social`). 404 `plantilla-no-encontrada` si aún no
   * está sembrada (CA-01, CA-11).
   */
  async getTemplate(): Promise<NoticeTemplateDto> {
    const template = await this.repository.findTemplateCurrent()
    if (!template) {
      throw new TeleworkPhotoNoticeError('plantilla-no-encontrada')
    }

    return {
      templateId: template.teleworkPhotoNoticeTemplateId,
      version: template.teleworkPhotoNoticeTemplateVersion,
      title: template.teleworkPhotoNoticeTemplateTitle,
      content: sanitizeTeleworkPolicyHtml(template.teleworkPhotoNoticeTemplateContent),
      placeholders: [...TELEWORK_PHOTO_NOTICE_PLACEHOLDERS],
    }
  }

  /**
   * Estado de la empresa: la versión vigente publicada y el borrador vivo,
   * cada uno mapeado a su DTO (pueden convivir tras publicar y volver a abrir
   * un borrador). Nunca consulta la plantilla ni crea nada: una empresa sin
   * aviso responde `{ current: null, draft: null }` con 200 — es el primer
   * request con el que abre la pestaña del BO (Review Focus 4).
   */
  async getState(businessUnitId: number): Promise<NoticeStateDto> {
    this.assertScopeResolved(businessUnitId)

    const draft = await this.repository.findDraftByBusinessUnit(businessUnitId)
    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)

    return {
      current: current
        ? this.buildVersionDto(current, await this.countAcknowledgements(businessUnitId, current))
        : null,
      draft: draft ? this.buildDraftDto(draft) : null,
    }
  }

  /**
   * Abre el borrador de la empresa: si ya hay uno vivo, 409
   * `borrador-ya-existe` (se edita ese, no se apila otro); si no, parte de la
   * última versión publicada (copia su título y su texto CON marcadores y
   * hereda su plantilla) o, en la primera vez, de la plantilla vigente. La
   * versión es siempre `findMaxVersion + 1`, así que descartar un borrador no
   * libera su número (CA-02, CA-10);
   * el `INSERT` se envuelve en `try/catch` y un `ER_DUP_ENTRY` del UNIQUE se
   * traduce a 409 `borrador-ya-existe`, nunca a 500 (CA-09).
   */
  async createDraft(businessUnitId: number, actorUserId: number): Promise<NoticeDraftDto> {
    this.assertScopeResolved(businessUnitId)

    const existingDraft = await this.repository.findDraftByBusinessUnit(businessUnitId)
    if (existingDraft) {
      throw new TeleworkPhotoNoticeError('borrador-ya-existe')
    }

    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)

    let title: string
    let content: string
    let templateId: number | null

    if (current) {
      title = current.teleworkPhotoNoticeTitle
      content = current.teleworkPhotoNoticeContent
      templateId = current.teleworkPhotoNoticeTemplateId
    } else {
      const template = await this.repository.findTemplateCurrent()
      if (!template) {
        throw new TeleworkPhotoNoticeError('plantilla-no-encontrada')
      }
      title = template.teleworkPhotoNoticeTemplateTitle
      content = template.teleworkPhotoNoticeTemplateContent
      templateId = template.teleworkPhotoNoticeTemplateId
    }

    const version = (await this.repository.findMaxVersion(businessUnitId)) + 1

    try {
      const record = await this.repository.createDraft({
        businessUnitId,
        version,
        title,
        content: sanitizeTeleworkPolicyHtml(content),
        templateId,
        createdByUserId: actorUserId,
      })

      return this.buildDraftDto(record)
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new TeleworkPhotoNoticeError('borrador-ya-existe')
      }
      throw error
    }
  }

  /** Guarda título y contenido saneado del borrador vivo. 404 `borrador-no-encontrado` si no hay ninguno. */
  async updateDraft(
    businessUnitId: number,
    input: TeleworkPhotoNoticeUpdateInput,
    actorUserId: number
  ): Promise<NoticeDraftDto> {
    this.assertScopeResolved(businessUnitId)

    const existingDraft = await this.repository.findDraftByBusinessUnit(businessUnitId)
    if (!existingDraft) {
      throw new TeleworkPhotoNoticeError('borrador-no-encontrado')
    }

    const record = await this.repository.updateDraft(
      existingDraft.teleworkPhotoNoticeId,
      businessUnitId,
      {
        title: input.title,
        content: sanitizeTeleworkPolicyHtml(input.content),
        updatedByUserId: actorUserId,
      }
    )

    return this.buildDraftDto(record)
  }

  /**
   * Descarta el borrador (soft delete). 404 `borrador-no-encontrado` si no hay
   * ninguno; jamás publica ni apaga la vigente (CA-17).
   */
  async discardDraft(businessUnitId: number): Promise<void> {
    this.assertScopeResolved(businessUnitId)

    const existingDraft = await this.repository.findDraftByBusinessUnit(businessUnitId)
    if (!existingDraft) {
      throw new TeleworkPhotoNoticeError('borrador-no-encontrado')
    }

    await this.repository.softDeleteDraft(existingDraft.teleworkPhotoNoticeId, businessUnitId)
  }

  /**
   * Historial de versiones publicadas de la empresa, más reciente primero, con
   * el conteo de acuses de cada una. Lista vacía es `[]` con 200, **nunca**
   * 404: la otra empresa —y la que todavía no publica— ve lo mismo que la que
   * no existe (CA-05, CA-12; desviación consciente del molde de
   * `telework-policy`, que ahí sí lanza 404).
   */
  async listVersions(businessUnitId: number): Promise<NoticeVersionDto[]> {
    this.assertScopeResolved(businessUnitId)

    const records = await this.repository.listPublishedVersions(businessUnitId)
    if (records.length === 0) {
      return []
    }

    const counts = await this.repository.countAcknowledgementsByNotice(businessUnitId)

    return records.map((record) =>
      this.buildVersionDto(record, counts.get(record.teleworkPhotoNoticeId) ?? 0)
    )
  }

  /**
   * ¿El colaborador acusó la versión VIGENTE? Responde por la vigente y solo
   * por ella (CA-15): sin ninguna publicada es `false` sin consultar acuses, y
   * el acuse de una versión anterior no cuenta (la consulta va contra el
   * `teleworkPhotoNoticeId` de la vigente). Un `employeeId` inválido lanza
   * cerrado sin tocar el repositorio.
   */
  async hasAcknowledgedCurrent(businessUnitId: number, employeeId: number): Promise<boolean> {
    this.assertScopeResolved(businessUnitId)
    if (!this.isPositiveInteger(employeeId)) {
      throw new TeleworkPhotoNoticeError('aviso-no-publicado')
    }

    const current = await this.repository.findCurrentByBusinessUnit(businessUnitId)
    if (!current) {
      return false
    }

    return this.repository.hasAcknowledgement(
      businessUnitId,
      current.teleworkPhotoNoticeId,
      employeeId
    )
  }

  /** Falla cerrado si el scope no está resuelto (cross-tenant / scope vacío). */
  private assertScopeResolved(businessUnitId: number): void {
    if (!this.isPositiveInteger(businessUnitId)) {
      throw new TeleworkPhotoNoticeError('aviso-no-publicado')
    }
  }

  private isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0
  }

  /** Acuses de una versión concreta, con 0 si el mapa no la trae (versión sin acuses). */
  private async countAcknowledgements(
    businessUnitId: number,
    record: TeleworkPhotoNotice
  ): Promise<number> {
    const counts = await this.repository.countAcknowledgementsByNotice(businessUnitId)
    return counts.get(record.teleworkPhotoNoticeId) ?? 0
  }

  /**
   * `ER_DUP_ENTRY` es el rechazo del UNIQUE de MySQL tal como lo entrega Knex
   * (`error.code`), no un tipo del driver: se inspecciona sin `any`.
   */
  private isDuplicateEntry(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false
    }
    return (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  }

  /**
   * Nombre visible de quién publicó (espejo de `telework-policy`): el nombre
   * de la persona y, si no lo tiene, el correo del usuario; `null` si la fila
   * no está publicada o si el publicador fue eliminado (FK `SET NULL`). Nunca
   * el userId crudo.
   */
  private resolvePublishedByName(record: TeleworkPhotoNotice): string | null {
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

  private buildDraftDto(record: TeleworkPhotoNotice): NoticeDraftDto {
    return {
      status: 'draft',
      teleworkPhotoNoticeId: record.teleworkPhotoNoticeId,
      version: record.teleworkPhotoNoticeVersion,
      title: record.teleworkPhotoNoticeTitle,
      content: sanitizeTeleworkPolicyHtml(record.teleworkPhotoNoticeContent),
      templateId: record.teleworkPhotoNoticeTemplateId,
      updatedAt: record.teleworkPhotoNoticeUpdatedAt
        ? record.teleworkPhotoNoticeUpdatedAt.toISO() ?? ''
        : '',
    }
  }

  /**
   * El `content` que viaja en una versión es el RESUELTO (`rendered_content`),
   * saneado al servir (Review Focus 2); las versiones publicadas nunca
   * exponen el texto con marcadores.
   */
  private buildVersionDto(
    record: TeleworkPhotoNotice,
    acknowledgementsCount: number
  ): NoticeVersionDto {
    return {
      status: 'published',
      teleworkPhotoNoticeId: record.teleworkPhotoNoticeId,
      version: record.teleworkPhotoNoticeVersion,
      title: record.teleworkPhotoNoticeTitle,
      content: sanitizeTeleworkPolicyHtml(
        record.teleworkPhotoNoticeRenderedContent ?? record.teleworkPhotoNoticeContent
      ),
      contentHash: record.teleworkPhotoNoticeContentHash ?? '',
      isCurrent: Boolean(record.teleworkPhotoNoticeIsCurrent),
      publishedAt: record.publishedAt ? record.publishedAt.toISO() ?? '' : '',
      publishedByUserId: record.publishedByUserId ?? null,
      publishedByName: this.resolvePublishedByName(record),
      acknowledgementsCount,
    }
  }
}
