import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Prueba de tenants de plataforma (USRH1789079078169) ──────────────────────
 *   GET  /api/platform/tenant-trials/live               → universo de pruebas vivas
 *   GET  /api/platform/tenant-trials?ids=uuid1,uuid2    → lote
 *   GET  /api/platform/tenant-trials/:businessUnitPublicId → una empresa
 *
 *   `/live` se registra ANTES de `:businessUnitPublicId` (mismo criterio que
 *   `platform_device_discrepancy_routes.ts`: los segmentos literales nunca
 *   compiten con los paramétricos, pero se listan en ese orden por
 *   convención de lectura del archivo).
 *
 *   Todos tras guard platformAdmin (auth + is_platform_admin).
 */
router
  .group(() => {
    router.get('/live', '#controllers/platform_tenant_trial_controller.live')
    router.get('/', '#controllers/platform_tenant_trial_controller.batch')
    router.get('/:businessUnitPublicId', '#controllers/platform_tenant_trial_controller.show')
  })
  .prefix('/api/platform/tenant-trials')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
