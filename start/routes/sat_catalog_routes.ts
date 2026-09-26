import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Catálogos fiscales del SAT bajo `/api/billing/sat-catalogs` (USRH1786737531063).
 *
 * Archivo separado del perfil fiscal del tenant: contenido global, solo `auth()`
 * — sin `businessScope` ni guard de dueño de cuenta.
 */
router
  .group(() => {
    router.get('/sat-catalogs', '#controllers/sat_catalog_controller.index')
  })
  .prefix('/api/billing')
  .use(middleware.auth())
