import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { errors as vineErrors } from '@vinejs/vine'
import { ANNOUNCEMENTS_ERROR_KEYS } from './announcements.constants.js'
import { AnnouncementsError } from './announcements.error.js'
import AnnouncementsService from './announcements.service.js'
import AnnouncementDeckService from './announcement_deck.service.js'
import { updateLastSeenValidator } from './validators/update_last_seen.validator.js'

/**
 * Marca de agua de anuncios de producto del usuario autenticado (overlay de
 * bienvenida y tours del Backoffice).
 *
 *   GET /api/announcements/me      — marca vigente (`null` si no hay).
 *   PUT /api/announcements/me      — crea o avanza la marca; nunca retrocede.
 *   GET /api/announcements/me/deck — slides que le tocan al usuario.
 *
 * Seguridad: middleware.auth(), sin businessScope (la marca es personal del
 * usuario). El userId siempre sale de auth.user.userId (anti-IDOR).
 */
@inject()
export default class AnnouncementsController {
  constructor(
    private readonly service: AnnouncementsService,
    private readonly deckService: AnnouncementDeckService
  ) {}

  /**
   * @swagger
   * /api/announcements/me:
   *   get:
   *     summary: Fecha del último anuncio de producto que vio el usuario
   *     description: |
   *       Devuelve la marca de agua del usuario autenticado. Si nunca ha registrado
   *       una, `lastSeenAt` es `null`. No crea registro.
   *     security:
   *       - bearerAuth: []
   *     tags: [Announcements]
   *     responses:
   *       200:
   *         description: Marca vigente
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Anuncios
   *               message: Marca de anuncios obtenida correctamente.
   *               data:
   *                 lastSeenAt: "2026-10-11T16:00:00.000Z"
   *       401:
   *         description: Access token ausente, inválido o expirado
   */
  async show(ctx: HttpContext) {
    const { auth, response, i18n } = ctx
    try {
      const data = await this.service.getState(auth.user!.userId)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('announcements_title', undefined, 'Anuncios'),
        message: i18n.t(
          'announcements_show_success',
          undefined,
          'Marca de anuncios obtenida correctamente.'
        ),
        data,
      })
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/announcements/me:
   *   put:
   *     summary: Registra la fecha del último anuncio de producto visto
   *     description: |
   *       Crea o avanza la marca del usuario autenticado. Nunca retrocede: si la
   *       fecha enviada es menor o igual a la guardada, se conserva la guardada y se
   *       responde 200 con el valor vigente. Rechaza fechas más de 5 minutos en el
   *       futuro.
   *     security:
   *       - bearerAuth: []
   *     tags: [Announcements]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [lastSeenAt]
   *             properties:
   *               lastSeenAt:
   *                 type: string
   *                 format: date-time
   *                 example: "2026-10-11T16:00:00.000Z"
   *                 description: "ISO 8601 con zona horaria (Z u offset)."
   *     responses:
   *       200:
   *         description: Marca vigente tras el registro
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Anuncios
   *               message: Marca de anuncios actualizada correctamente.
   *               data:
   *                 lastSeenAt: "2026-10-11T16:00:00.000Z"
   *       422:
   *         description: Fecha inválida (`fecha-invalida`) o en el futuro (`fecha-en-el-futuro`)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Fecha en el futuro
   *               message: La fecha del último anuncio visto no puede estar en el futuro.
   *               detail: La fecha del último anuncio visto no puede estar en el futuro.
   *               key: fecha-en-el-futuro
   *               data: null
   *       401:
   *         description: Access token ausente, inválido o expirado
   */
  async update(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      const { lastSeenAt } = await request.validateUsing(updateLastSeenValidator)
      const data = await this.service.markSeen(auth.user!.userId, lastSeenAt)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('announcements_title', undefined, 'Anuncios'),
        message: i18n.t(
          'announcements_update_success',
          undefined,
          'Marca de anuncios actualizada correctamente.'
        ),
        data,
      })
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/announcements/me/deck:
   *   get:
   *     summary: Slides de anuncios que le tocan al usuario
   *     description: |
   *       Sin marca (primer ingreso): slides de bienvenida (`onboarding`) por orden.
   *       Con marca: novedades (`feature`) publicadas después de la marca, de la más
   *       antigua a la más reciente. Solo publicados, filtrados por los permisos del
   *       usuario (root y owner ven todos) y con tope de 5.
   *
   *       `latestPublishedAt` es la publicación más reciente de TODOS los slides
   *       publicados, sin filtrar por tipo ni permiso: el BO la manda en el PUT al
   *       cerrar el deck. `lastSeenAt` es la marca vigente del usuario.
   *
   *       `bannerUrl` es una URL firmada de lectura (vigencia de 1 hora), lista para
   *       `<img src>` sin header de auth; `null` si el slide no tiene banner.
   *     security:
   *       - bearerAuth: []
   *     tags: [Announcements]
   *     responses:
   *       200:
   *         description: Deck del usuario
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Anuncios
   *               message: Anuncios obtenidos correctamente.
   *               data:
   *                 slides:
   *                   - id: 1
   *                     type: onboarding
   *                     title: Te damos la bienvenida a Valanserh
   *                     bodyHtml: "<p>Todo lo que necesitas...</p>"
   *                     bannerUrl: "https://bucket.example/valanserh/announcement-slides/a.jpg?X-Amz-Signature=..."
   *                 latestPublishedAt: "2026-10-11T16:00:00.000Z"
   *                 lastSeenAt: null
   *       401:
   *         description: Access token ausente, inválido o expirado
   */
  async deck(ctx: HttpContext) {
    const { auth, response, i18n } = ctx
    try {
      const data = await this.deckService.getDeck(auth.user!)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('announcements_title', undefined, 'Anuncios'),
        message: i18n.t(
          'announcements_deck_success',
          undefined,
          'Anuncios obtenidos correctamente.'
        ),
        data,
      })
    } catch (error) {
      return this.respondError(ctx, error)
    }
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

    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      const detail = i18n.t(
        'announcements_invalid_date_detail',
        undefined,
        'La fecha debe ser una fecha y hora ISO 8601 con zona horaria.'
      )
      return response.status(422).json({
        type: 'error',
        title: i18n.t('announcements_invalid_date_title', undefined, 'Fecha inválida'),
        message: detail,
        detail,
        key: ANNOUNCEMENTS_ERROR_KEYS.INVALID_DATE,
        data: null,
      })
    }

    logger.error({ err: error }, 'Marca de anuncios: error inesperado')
    const detail = i18n.t(
      'announcements_unexpected_error_detail',
      undefined,
      'Ocurrió un error inesperado al procesar la marca de anuncios.'
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
