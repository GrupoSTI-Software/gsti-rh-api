import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_controller.store')
    router.put('/:positionId', '#controllers/position_controller.update')
    router.delete('/:positionId', '#controllers/position_controller.delete')
    router.get('/', '#controllers/position_controller.get')
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())

router
  .group(() => {
    router.get('/:positionId', '#controllers/position_controller.show')
    router.get('/get-pdf/:positionId', '#controllers/position_controller.getPdf')
    router.get('/get-excel/:positionId', '#controllers/position_controller.getExcel')
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())

router
  .group(() => {
    router.patch('/:positionId/move', '#controllers/position_controller.move')
  })
  .prefix('/api/positions')
  .use(middleware.auth())
router
  .group(() => {
    router.post('/assign-shift/:positionId', '#controllers/position_controller.assignShift')
  })
  .prefix('/api/position')
  .use(middleware.auth())
