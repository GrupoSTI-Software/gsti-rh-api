import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Lectura pública de la versión vigente de un documento legal.
 *
 * Solo GET /current permanece aquí: es consumida por el backoffice y la app del
 * empleado para mostrar y pedir la aceptación del documento vigente.
 *
 * La gestión (histórico, detalle, crear borrador, editar, publicar) se movió a
 * start/routes/platform_legal_document_routes.ts, bajo el grupo de plataforma
 * [auth({ guards: ['api'] }), middleware de plataforma] (USRH1790610965394).
 */
router
  .group(() => {
    router.get('/current', '#modules/legal-documents/legal_document.controller.getCurrent')
  })
  .prefix('/api/legal-documents')
  .use(middleware.auth())
