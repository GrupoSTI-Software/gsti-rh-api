import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/nom037/telework-policy',
      '#modules/telework-policy/telework_policy.controller.getPolicy'
    )
    router.get(
      '/nom037/telework-policy/template',
      '#modules/telework-policy/telework_policy.controller.getTemplate'
    )
    router.post(
      '/nom037/telework-policy/initialize',
      '#modules/telework-policy/telework_policy.controller.initialize'
    )
    router.put(
      '/nom037/telework-policy',
      '#modules/telework-policy/telework_policy.controller.updateDraft'
    )
    router.delete(
      '/nom037/telework-policy/draft',
      '#modules/telework-policy/telework_policy.controller.discardDraft'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
/**
 * Rutas del módulo NOM-037 (teletrabajo).
 *
 * Archivo creado por USRH1782792802405 (lugar de teletrabajo). El listado
 * 5.1 (USRH1782792802491) agrega aquí sus propias rutas para no duplicar
 * el alta del módulo.
 */
router
  .group(() => {
    router
      .group(() => {
        router.get('/', '#controllers/employee_telework_location_controller.index')
        router.post('/', '#controllers/employee_telework_location_controller.store')
        router.put('/:id', '#controllers/employee_telework_location_controller.update')
        router.delete('/:id', '#controllers/employee_telework_location_controller.destroy')
      })
      .prefix('/nom037/telework-locations')
      .use(middleware.businessScope())

    router
      .group(() => {
        router.get('/', '#controllers/telework_worker_controller.index')
      })
      .prefix('/nom037/telework-workers')
      .use(middleware.businessScope())
  })
  .prefix('/api')
  .use(middleware.auth())
