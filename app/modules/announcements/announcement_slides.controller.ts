import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { errors as vineErrors } from '@vinejs/vine'
import { FileIntakeError } from '#exceptions/file_intake_error'
import { ANNOUNCEMENTS_ERROR_KEYS } from './announcements.constants.js'
import { AnnouncementsError } from './announcements.error.js'
import AnnouncementSlidesService from './announcement_slides.service.js'
import {
  createAnnouncementSlideValidator,
  listAnnouncementSlidesValidator,
  updateAnnouncementSlideValidator,
} from './validators/announcement_slide.validator.js'

/** Campos que reprobaron la validación, para que la consola marque el formulario. */
function failedFields(error: InstanceType<typeof vineErrors.E_VALIDATION_ERROR>): string[] {
  const messages = error.messages as Array<{ field?: string }>
  return [...new Set(messages.map((m) => m.field).filter((f): f is string => Boolean(f)))]
}

/**
 * Administración de los slides del deck de anuncios desde la consola de plataforma.
 *
 *   GET  /api/platform/announcement-slides?type=&status=  — listado
 *   GET  /api/platform/announcement-slides/:id            — detalle
 *   POST /api/platform/announcement-slides                — crear (borrador)
 *   PUT  /api/platform/announcement-slides/:id            — editar contenido
 *   POST /api/platform/announcement-slides/:id/publish    — publicar
 *   POST /api/platform/announcement-slides/:id/archive    — archivar
 *   POST /api/platform/announcement-slides/:id/banner     — subir banner (multipart `banner`)
 *
 * Seguridad: igual que documentos legales de plataforma. Los handlers solo se
 * registran bajo `start/routes/platform_announcement_slide_routes.ts`, con
 * `[auth({ guards: ['api'] }), platformAdmin()]`: `is_platform_admin = 1` y token de
 * la consola (`origin = 'platform'`). Owner, root de tenant y cualquier token de
 * BO/app caen en 403 antes de llegar aquí.
 */
@inject()
export default class AnnouncementSlidesController {
  constructor(private readonly service: AnnouncementSlidesService) {}

  /**
   * @swagger
   * /api/platform/announcement-slides:
   *   get:
   *     summary: Listar slides del deck de anuncios (plataforma)
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     parameters:
   *       - in: query
   *         name: type
   *         schema: { type: string, enum: [onboarding, feature] }
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [draft, published, archived] }
   *     responses:
   *       200:
   *         description: Slides por tipo, orden e id
   *       401:
   *         description: Sin autenticación
   *       403:
   *         description: No es sesión de la consola de plataforma (`AUTH.PLATFORM.FORBIDDEN`)
   *       422:
   *         description: Filtro inválido (`datos-invalidos`)
   */
  async index(ctx: HttpContext) {
    try {
      const filters = await listAnnouncementSlidesValidator.validate(ctx.request.qs())
      return this.ok(ctx, 'announcement_slides_list_success', 'Slides obtenidos correctamente.', {
        slides: await this.service.list(filters),
      })
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/platform/announcement-slides/{id}:
   *   get:
   *     summary: Detalle de un slide (plataforma)
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Slide
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Slides de anuncios
   *               message: Slide obtenido correctamente.
   *               data:
   *                 id: 1
   *                 type: onboarding
   *                 sortOrder: 1
   *                 status: published
   *                 publishedAt: "2026-10-11T16:00:00.000Z"
   *                 title: Te damos la bienvenida a Valanserh
   *                 bodyHtml: "<p>...</p>"
   *                 bannerPath: valanserh/announcement-slides/abc.jpg
   *                 bannerUrl: "https://...?X-Amz-Signature=..."
   *                 permissionKey: null
   *                 createdAt: "2026-10-11T16:00:00.000Z"
   *                 updatedAt: "2026-10-11T16:00:00.000Z"
   *       404:
   *         description: No existe (`slide-inexistente`)
   */
  async show(ctx: HttpContext) {
    try {
      const data = await this.service.getById(Number(ctx.params.id))
      return this.ok(ctx, 'announcement_slides_show_success', 'Slide obtenido correctamente.', data)
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/platform/announcement-slides:
   *   post:
   *     summary: Crear un slide en borrador (plataforma)
   *     description: |
   *       El HTML de `bodyHtml` se sanea al guardar (p, br, strong, em, u, ul, ol, li y
   *       a con href http/https/mailto; los enlaces salen con rel="noopener noreferrer"
   *       target="_blank"). `permissionKey` es `modulo:permiso` del catálogo o null.
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [type, title, bodyHtml]
   *             properties:
   *               type: { type: string, enum: [onboarding, feature] }
   *               sortOrder: { type: integer, minimum: 0, default: 0 }
   *               title: { type: string, maxLength: 120 }
   *               bodyHtml: { type: string }
   *               permissionKey: { type: string, nullable: true, example: "employees:read" }
   *     responses:
   *       201:
   *         description: Slide creado en borrador
   *       422:
   *         description: Datos inválidos (`datos-invalidos`), permiso inexistente (`permiso-inexistente`) o cuerpo vacío tras sanear (`cuerpo-vacio`)
   */
  async store(ctx: HttpContext) {
    try {
      const input = await ctx.request.validateUsing(createAnnouncementSlideValidator)
      const data = await this.service.create({
        type: input.type,
        sortOrder: input.sortOrder ?? 0,
        title: input.title,
        bodyHtml: input.bodyHtml,
        permissionKey: input.permissionKey ?? null,
      })
      return this.ok(
        ctx,
        'announcement_slides_create_success',
        'Slide creado correctamente.',
        data,
        201
      )
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/platform/announcement-slides/{id}:
   *   put:
   *     summary: Editar un slide (plataforma)
   *     description: |
   *       Edita solo los campos enviados. Se permite sobre slides publicados y no cambia
   *       `publishedAt`. Mismas reglas de saneo y de permiso que al crear.
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Slide actualizado
   *       404:
   *         description: No existe (`slide-inexistente`)
   *       422:
   *         description: Datos inválidos, permiso inexistente o cuerpo vacío
   */
  async update(ctx: HttpContext) {
    try {
      const input = await ctx.request.validateUsing(updateAnnouncementSlideValidator)
      const data = await this.service.update(Number(ctx.params.id), input)
      return this.ok(
        ctx,
        'announcement_slides_update_success',
        'Slide actualizado correctamente.',
        data
      )
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/platform/announcement-slides/{id}/publish:
   *   post:
   *     summary: Publicar un slide (plataforma)
   *     description: |
   *       `status = published`. `publishedAt` se fija con la hora del servidor solo si
   *       era null; republicar un slide archivado conserva su fecha original.
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Slide publicado
   *       404:
   *         description: No existe (`slide-inexistente`)
   */
  async publish(ctx: HttpContext) {
    try {
      const data = await this.service.publish(Number(ctx.params.id))
      return this.ok(
        ctx,
        'announcement_slides_publish_success',
        'Slide publicado correctamente.',
        data
      )
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/platform/announcement-slides/{id}/archive:
   *   post:
   *     summary: Archivar un slide (plataforma)
   *     description: "`status = archived`. No se borra nada y `publishedAt` se conserva."
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Slide archivado
   *       404:
   *         description: No existe (`slide-inexistente`)
   */
  async archive(ctx: HttpContext) {
    try {
      const data = await this.service.archive(Number(ctx.params.id))
      return this.ok(
        ctx,
        'announcement_slides_archive_success',
        'Slide archivado correctamente.',
        data
      )
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/platform/announcement-slides/{id}/banner:
   *   post:
   *     summary: Subir el banner de un slide (plataforma)
   *     description: |
   *       Multipart con el campo `banner`: JPG, PNG o WebP de hasta 2 MB (validado por
   *       contenido, re-encodeado). Se guarda privado en S3 y reemplaza la llave del
   *       slide; el objeto anterior no se borra.
   *     security:
   *       - bearerAuth: []
   *     tags: [PlatformAnnouncementSlides]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [banner]
   *             properties:
   *               banner: { type: string, format: binary }
   *     responses:
   *       200:
   *         description: Banner guardado; la respuesta trae `bannerUrl` firmada
   *       404:
   *         description: No existe (`slide-inexistente`)
   *       422:
   *         description: Archivo ausente, de tipo no permitido o mayor a 2 MB
   */
  async uploadBanner(ctx: HttpContext) {
    try {
      const data = await this.service.uploadBanner(
        Number(ctx.params.id),
        ctx.request.file('banner')
      )
      return this.ok(
        ctx,
        'announcement_slides_banner_success',
        'Banner guardado correctamente.',
        data
      )
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  private ok(
    ctx: HttpContext,
    messageKey: string,
    fallbackMessage: string,
    data: unknown,
    status = 200
  ) {
    const { response, i18n } = ctx
    return response.status(status).json({
      type: 'success',
      title: i18n.t('announcement_slides_title', undefined, 'Slides de anuncios'),
      message: i18n.t(messageKey, undefined, fallbackMessage),
      data,
    })
  }

  /** Contrato de error del repo: `type/title/message/detail/key`. */
  private respondError(ctx: HttpContext, error: unknown) {
    const { response, i18n } = ctx

    if (error instanceof AnnouncementsError) {
      const detail = i18n.t(`${error.i18nPrefix}_detail`, undefined, error.fallbackDetail)
      return response.status(error.httpStatus).json({
        type: 'error',
        title: i18n.t(`${error.i18nPrefix}_title`, undefined, error.fallbackTitle),
        message: detail,
        detail,
        key: error.key,
        data: null,
      })
    }

    if (error instanceof FileIntakeError) {
      return response.status(error.status).json({
        type: 'error',
        title: error.title,
        message: error.detail,
        detail: error.detail,
        key: error.key,
        data: null,
      })
    }

    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      const detail = i18n.t(
        'announcements_invalid_input_detail',
        undefined,
        'Revisa los campos marcados: faltan o no tienen un valor permitido.'
      )
      return response.status(422).json({
        type: 'error',
        title: i18n.t('announcements_invalid_input_title', undefined, 'Datos inválidos'),
        message: detail,
        detail,
        key: ANNOUNCEMENTS_ERROR_KEYS.INVALID_INPUT,
        data: { fields: failedFields(error) },
      })
    }

    logger.error({ err: error }, 'Slides de anuncios: error inesperado')
    const detail = i18n.t(
      'announcement_slides_unexpected_error_detail',
      undefined,
      'Ocurrió un error inesperado al procesar los slides de anuncios.'
    )
    return response.status(500).json({
      type: 'error',
      title: i18n.t('announcements_unexpected_error_title', undefined, 'Error inesperado'),
      message: detail,
      detail,
      key: ANNOUNCEMENTS_ERROR_KEYS.UNEXPECTED,
      data: null,
    })
  }
}
