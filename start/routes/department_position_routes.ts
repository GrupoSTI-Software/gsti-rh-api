import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/department_position_controller.store')
    router.put('/:departmentPositionId', '#controllers/department_position_controller.update')
    router.delete('/:departmentPositionId', '#controllers/department_position_controller.delete')
    router.delete(
      '/:departmentId/:positionId',
      '#controllers/department_position_controller.deleteRelation'
    )
    router.get('/:departmentPositionId', '#controllers/department_position_controller.show')
  })
  .prefix('/api/departments-positions')
  .use(middleware.auth())
  .use(middleware.businessScope())
