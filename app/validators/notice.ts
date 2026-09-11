import vine from '@vinejs/vine'
import {
  NOTICE_AUDIENCE_VALUES,
  NOTICE_SEND_MODE_VALUES,
  NOTICE_SUBJECT_MAX_LENGTH,
  NOTICE_TYPE_VALUES,
} from '#constants/notice'

/**
 * Cuerpo común del alta y la edición de un aviso.
 *
 * `noticeDescription` es opcional aquí porque solo aplica al tipo texto; la
 * regla "texto exige mensaje, imagen y PDF exigen archivo" vive en el servicio
 * (`verifyInfo`), igual que el tope de caracteres, que se mide sobre el texto
 * plano y no sobre el HTML.
 *
 * `departmentId` y `positionId` son el criterio del público `department`; para
 * `company` y `manual` el servicio los ignora. `recipientEmployeeIds` solo
 * cuenta para `manual`: los otros dos públicos se resuelven en el servidor.
 */
const noticeBodySchema = {
  noticeSubject: vine.string().trim().minLength(1).maxLength(NOTICE_SUBJECT_MAX_LENGTH),
  noticeDescription: vine.string().trim().optional(),
  noticeType: vine.enum(NOTICE_TYPE_VALUES).optional(),
  noticeAudience: vine.enum(NOTICE_AUDIENCE_VALUES).optional(),
  departmentId: vine.number().positive().nullable().optional(),
  positionId: vine.number().positive().nullable().optional(),
  noticeSendMode: vine.enum(NOTICE_SEND_MODE_VALUES).optional(),
  noticeScheduledAt: vine.string().trim().optional(),
  recipientEmployeeIds: vine.array(vine.number()).optional(),
}

export const createNoticeValidator = vine.compile(vine.object(noticeBodySchema))

export const updateNoticeValidator = vine.compile(
  vine.object({
    ...noticeBodySchema,
    filesDeleted: vine.array(vine.number()).optional(),
  })
)

/** Reenvío: opcionalmente solo a quienes no han confirmado lectura. */
export const sendNoticeValidator = vine.compile(
  vine.object({
    onlyUnread: vine.boolean().optional(),
  })
)
