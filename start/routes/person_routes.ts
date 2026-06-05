import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/person_controller.index')
    router.post('/', '#controllers/person_controller.store')
    router.put('/:personId', '#controllers/person_controller.update')
    router.delete('/:personId', '#controllers/person_controller.delete')
    router.get('/:personId', '#controllers/person_controller.show')
  })
  .prefix('/api/persons')
  .use(middleware.auth())
router
  .group(() => {
    router.get('/:personId', '#controllers/person_controller.getEmployee')
  })
  .prefix('/api/person-get-employee')
  .use(middleware.auth()).use(middleware.businessScope())
router
  .group(() => {
    router.get('/', '#controllers/person_controller.getPlacesOfBirth')
  })
  .prefix('/api/persons-get-places-of-birth')
  .use(middleware.auth())
