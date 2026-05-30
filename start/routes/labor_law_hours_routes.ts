import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * @deprecated DEPRECADO (EPIC-08-12). Rutas `/api/labor-law-hours` reemplazadas por el marco
 * legal centralizado en `working_time_rules`. Se mantienen por compatibilidad temporal.
 * Pendiente de eliminación (responsable: Wilvardo Ramírez Colunga).
 */
router
  .group(() => {
    router.get('/', '#controllers/labor_law_hours_controller.index').use(middleware.auth())
    router.get('/active', '#controllers/labor_law_hours_controller.getActive').use(middleware.auth())
    router.post('/', '#controllers/labor_law_hours_controller.store').use(middleware.auth())
    router.put('/:laborLawHoursId', '#controllers/labor_law_hours_controller.update').use(middleware.auth())
    router.delete('/:laborLawHoursId', '#controllers/labor_law_hours_controller.delete').use(middleware.auth())
    router.get('/:laborLawHoursId', '#controllers/labor_law_hours_controller.show').use(middleware.auth())
  })
  .prefix('/api/labor-law-hours')

