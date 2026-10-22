/**
 * DTO públicos del aviso de privacidad de la evidencia fotográfica del puesto
 * de trabajo (VLRH-H1791306079310, §11).
 *
 * Unión discriminada por `status`: el borrador (`NoticeDraftDto`) y cada
 * versión publicada (`NoticeVersionDto`) nunca comparten forma, así que el BO
 * y la app distinguen con el discriminante sin mirar el status HTTP.
 *
 * El `content` que viaja en el borrador y en la versión ya salió saneado del
 * servicio; el de la versión es el **resuelto** (`rendered_content`, con los
 * marcadores sustituidos al publicar).
 */

/** Forma administrativa del borrador vivo de la empresa (editor del BO). */
export type NoticeDraftDto = {
  status: 'draft'
  teleworkPhotoNoticeId: number
  version: number
  title: string
  content: string
  templateId: number | null
  updatedAt: string
}

/** Versión publicada e inmutable, con su conteo de acuses (nunca el userId crudo: `publishedByName`). */
export type NoticeVersionDto = {
  status: 'published'
  teleworkPhotoNoticeId: number
  version: number
  title: string
  content: string // resuelto y saneado
  contentHash: string
  isCurrent: boolean
  publishedAt: string
  publishedByUserId: number | null
  publishedByName: string | null
  acknowledgementsCount: number
}

/** Estado de la empresa: la vigente y el borrador conviven (regla de negocio 12); ambos pueden ser `null`. */
export type NoticeStateDto = { current: NoticeVersionDto | null; draft: NoticeDraftDto | null }

/** Plantilla base global vigente, con su texto `content` CON marcadores sin resolver y la lista cerrada. */
export type NoticeTemplateDto = {
  templateId: number
  version: string
  title: string
  content: string // con marcadores, saneado
  placeholders: string[]
}
