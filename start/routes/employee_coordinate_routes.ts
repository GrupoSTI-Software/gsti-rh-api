import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/:employeeId', '#controllers/employee_coordinates_controller.getCoordinates')
  })
  .prefix('/api/get-coordinates')
  .use(middleware.auth())
