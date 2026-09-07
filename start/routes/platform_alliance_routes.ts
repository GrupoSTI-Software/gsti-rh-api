import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del registro de alianzas comerciales (USRH1788505941892).
 *
 * Todas protegidas por `auth` + `platformAdmin` en el grupo — dato de
 * plataforma, sin scope de tenant. Prefijo: /api/platform
 *
 *   GET    /api/platform/alliances                  → listado paginado
 *   POST   /api/platform/alliances                  → alta
 *   GET    /api/platform/alliances/:allianceId      → detalle
 *   PATCH  /api/platform/alliances/:allianceId      → corrección (sin estado)
 *   POST   /api/platform/alliances/:allianceId/activate   → reactivar
 *   POST   /api/platform/alliances/:allianceId/deactivate → desactivar
 */
router
  .group(() => {
    router.get('/alliances', '#controllers/alliance_controller.index')
    router.post('/alliances', '#controllers/alliance_controller.store')
    router.get('/alliances/:allianceId', '#controllers/alliance_controller.show')
    router.patch('/alliances/:allianceId', '#controllers/alliance_controller.update')
    router.post('/alliances/:allianceId/activate', '#controllers/alliance_controller.activate')
    router.post('/alliances/:allianceId/deactivate', '#controllers/alliance_controller.deactivate')
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
