import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Tablero de discrepancias entre el inventario de plataforma y los puntos de
 * acceso de los tenants (USRH1787195527841 · §11 del spec).
 *
 * Prefijo literal /api/platform/devices/discrepancies — hermano de /models,
 * /units y /assignments (C-3 del set): ninguna ruta paramétrica cuelga de
 * la raíz /api/platform/devices, así que este segmento nunca colisiona.
 *
 * Todas protegidas por `auth` + `platformAdmin`. Sin `businessScope` (el
 * endpoint cruza empresas a propósito, declarado y auditado en el servicio).
 *
 *   GET /api/platform/devices/discrepancies → index
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_device_discrepancy_controller.index')
  })
  .prefix('/api/platform/devices/discrepancies')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
