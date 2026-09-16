import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Vista de plataforma sobre la flota de checadores (spec ADMS 11).
 *
 * Todas protegidas por `auth` + `platformAdmin`, sin scope de tenant: es el
 * unico sitio donde se cruzan empresas. Lo que se ve aqui -- series completas,
 * incidentes sin dueño, equipos de todos -- no lo puede ver el administrador de
 * una empresa por muchos permisos que tenga.
 */
router
  .group(() => {
    router.get(
      '/health',
      '#modules/access-point/platform/platform_devices.controller.health'
    )
    router.get(
      '/quarantine',
      '#modules/access-point/platform/platform_devices.controller.quarantine'
    )
    /**
     * Reclamar: el cliente avisa que ya tiene el aparato y aqui se le asigna.
     * Entra al inventario como `del_cliente`, no como stock de GSTI.
     */
    router.post(
      '/quarantine/:quarantinedDeviceId/claim',
      '#modules/access-point/platform/platform_devices.controller.claim'
    )
    router.post(
      '/quarantine/:quarantinedDeviceId/dismiss',
      '#modules/access-point/platform/platform_devices.controller.dismiss'
    )
    router.post(
      '/quarantine/:quarantinedDeviceId/unlock',
      '#modules/access-point/platform/platform_devices.controller.unlock'
    )
    router.get(
      '/incidents',
      '#modules/access-point/platform/platform_devices.controller.incidents'
    )
    router.get(
      '/retention',
      '#modules/access-point/platform/platform_devices.controller.retention'
    )
  })
  .prefix('/api/platform/devices')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
