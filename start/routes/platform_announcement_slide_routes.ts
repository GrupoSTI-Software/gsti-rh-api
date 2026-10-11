import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Administración de los slides del deck de anuncios del Backoffice desde la consola
 * de plataforma. Mismo patrón que `platform_legal_document_routes.ts`.
 *
 * Todas protegidas por `auth` + `platformAdmin` — catálogo global de plataforma,
 * sin scope de tenant. Prefijo: /api/platform/announcement-slides
 *
 *   GET  /api/platform/announcement-slides?type=&status=  → listado
 *   GET  /api/platform/announcement-slides/:id            → detalle
 *   POST /api/platform/announcement-slides                → crear (borrador)
 *   PUT  /api/platform/announcement-slides/:id            → editar
 *   POST /api/platform/announcement-slides/:id/publish    → publicar
 *   POST /api/platform/announcement-slides/:id/archive    → archivar
 *   POST /api/platform/announcement-slides/:id/banner     → subir banner (multipart)
 *
 * El deck que consume el BO (GET /api/announcements/me/deck) NO está aquí: vive en
 * app/modules/announcements/announcements.routes.ts con solo middleware.auth().
 *
 * Seguridad: el guard `platformAdmin` exige `isPlatformAdmin = 1` y token con
 * `origin = 'platform'` (emitido solo por POST /api/platform/auth/login). Owner, root
 * de tenant y cualquier usuario con token de BO/app caen en 403 antes del controller.
 */
router
  .group(() => {
    router.get('/', '#modules/announcements/announcement_slides.controller.index')
    router
      .get('/:id', '#modules/announcements/announcement_slides.controller.show')
      .where('id', router.matchers.number())
    router.post('/', '#modules/announcements/announcement_slides.controller.store')
    router
      .put('/:id', '#modules/announcements/announcement_slides.controller.update')
      .where('id', router.matchers.number())
    router
      .post('/:id/publish', '#modules/announcements/announcement_slides.controller.publish')
      .where('id', router.matchers.number())
    router
      .post('/:id/archive', '#modules/announcements/announcement_slides.controller.archive')
      .where('id', router.matchers.number())
    router
      .post('/:id/banner', '#modules/announcements/announcement_slides.controller.uploadBanner')
      .where('id', router.matchers.number())
  })
  .prefix('/api/platform/announcement-slides')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
