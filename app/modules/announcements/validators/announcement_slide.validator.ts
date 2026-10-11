import vine from '@vinejs/vine'
import {
  ANNOUNCEMENT_SLIDE_BODY_MAX_LENGTH,
  ANNOUNCEMENT_SLIDE_STATUSES,
  ANNOUNCEMENT_SLIDE_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_SLIDE_TYPES,
} from '../announcements.constants.js'

/** Orden dentro del tipo: entero no negativo con techo holgado. */
const sortOrder = () => vine.number().withoutDecimals().min(0).max(100_000)
const title = () => vine.string().trim().minLength(1).maxLength(ANNOUNCEMENT_SLIDE_TITLE_MAX_LENGTH)
const bodyHtml = () =>
  vine.string().trim().minLength(1).maxLength(ANNOUNCEMENT_SLIDE_BODY_MAX_LENGTH)
/** Forma de la clave; que exista en el catálogo lo valida el service (422 propio). */
const permissionKey = () => vine.string().trim().maxLength(150).nullable()

/** `POST /api/platform/announcement-slides`: nace en borrador. */
export const createAnnouncementSlideValidator = vine.compile(
  vine.object({
    type: vine.enum(ANNOUNCEMENT_SLIDE_TYPES),
    sortOrder: sortOrder().optional(),
    title: title(),
    bodyHtml: bodyHtml(),
    permissionKey: permissionKey().optional(),
  })
)

/** `PUT /api/platform/announcement-slides/:id`: solo lo que llegue se edita. */
export const updateAnnouncementSlideValidator = vine.compile(
  vine.object({
    type: vine.enum(ANNOUNCEMENT_SLIDE_TYPES).optional(),
    sortOrder: sortOrder().optional(),
    title: title().optional(),
    bodyHtml: bodyHtml().optional(),
    permissionKey: permissionKey().optional(),
  })
)

/** `GET /api/platform/announcement-slides?type=&status=` */
export const listAnnouncementSlidesValidator = vine.compile(
  vine.object({
    type: vine.enum(ANNOUNCEMENT_SLIDE_TYPES).optional(),
    status: vine.enum(ANNOUNCEMENT_SLIDE_STATUSES).optional(),
  })
)
