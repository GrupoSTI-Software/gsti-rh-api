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
    // USRH1783547655377 — publicar/difundir la política y seguimiento de acuses.
    router.post(
      '/nom037/telework-policy/publish',
      '#modules/telework-policy/telework_policy.controller.publish'
    )
    router.post(
      '/nom037/telework-policy/draft',
      '#modules/telework-policy/telework_policy.controller.createDraftFromLatest'
    )
    router.get(
      '/nom037/telework-policy/versions',
      '#modules/telework-policy/telework_policy.controller.listVersions'
    )
    router.get(
      '/nom037/telework-policy/acknowledgements',
      '#modules/telework-policy/telework_policy.controller.getAcknowledgementTracking'
    )
    router.post(
      '/nom037/telework-policy/remind-pending',
      '#modules/telework-policy/telework_policy.controller.remindPending'
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

// VLRH-H1791306074375 — ajustes de teletrabajo por empresa (singleton por
// empresa, empresa resuelta del header `X-Business-Unit-Id`). Grupo al final
// para no tocar el montaje de los grupos existentes. Sin ruta DELETE.
router
  .group(() => {
    router.get(
      '/nom037/telework-settings',
      '#controllers/telework_compliance_setting_controller.show'
    )
    router.put(
      '/nom037/telework-settings',
      '#controllers/telework_compliance_setting_controller.update'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())

// VLRH-H1790812613870 — lista de verificación de condiciones del lugar de
// teletrabajo (NOM-037): catálogo de puntos, historial por teletrabajador y
// registro de la visita de la Comisión. Permiso en el controller. Sin fotos
// (VLRH-H1791311161420) y sin ruta de borrado (nada se elimina).
router
  .group(() => {
    router.get(
      '/nom037/telework-checklists/items',
      '#modules/telework-checklist/telework_checklist.controller.listItems'
    )
    router.get(
      '/nom037/telework-checklists/employees/:employeeId',
      '#modules/telework-checklist/telework_checklist.controller.listByEmployee'
    ).where('employeeId', router.matchers.number())
    router.get(
      '/nom037/telework-checklists/:applicationId',
      '#modules/telework-checklist/telework_checklist.controller.detail'
    ).where('applicationId', router.matchers.number())
    router.post(
      '/nom037/telework-checklists',
      '#modules/telework-checklist/telework_checklist.controller.registerVisit'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
