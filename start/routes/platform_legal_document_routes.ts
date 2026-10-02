import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de gestión de documentos legales versionados desde la consola de plataforma
 * (USRH1790610965394).
 *
 * Todas protegidas por `auth` + `platformAdmin` — dato global de plataforma,
 * sin scope de tenant. Prefijo: /api/platform/legal-documents
 *
 *   GET  /api/platform/legal-documents?type=&status=      → histórico de versiones
 *   GET  /api/platform/legal-documents/:id                → detalle de una versión
 *   POST /api/platform/legal-documents                    → crear borrador
 *   PUT  /api/platform/legal-documents/:id                → editar borrador
 *   POST /api/platform/legal-documents/:id/publish        → publicar borrador
 *
 * La lectura de la versión vigente (GET /api/legal-documents/current) NO está aquí:
 * es consumida por el backoffice y la app del empleado y permanece en
 * app/modules/legal-documents/legal_document.routes.ts con solo middleware.auth().
 *
 * Seguridad: el guard `platformAdmin` exige `isPlatformAdmin = 1` y token con
 * `origin = 'platform'` (emitido solo por POST /api/platform/auth/login). Owner,
 * root de tenant, super-administrador y cualquier usuario con token de BO/app
 * caen en 403 antes de llegar al controller. Los handlers de gestión del controller
 * solo se registran bajo este grupo; sin él responden 404.
 *
 * Ref: USRH1790610965394. Habilitado por: USRH1790610965408 (consultar),
 * USRH1790610965422 (redactar y publicar), USRH1790610965436 (retiro BO).
 */
router
  .group(() => {
    router.get('/', '#modules/legal-documents/legal_document.controller.listByType')
    router.get('/:id', '#modules/legal-documents/legal_document.controller.getById')
    router.post('/', '#modules/legal-documents/legal_document.controller.createDraft')
    router.put('/:id', '#modules/legal-documents/legal_document.controller.updateDraft')
    router.post('/:id/publish', '#modules/legal-documents/legal_document.controller.publish')
  })
  .prefix('/api/platform/legal-documents')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
