import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_controller.store')
    router.put('/:positionId', '#controllers/position_controller.update')
    router.delete('/:positionId', '#controllers/position_controller.delete')
    router.get('/:positionId', '#controllers/position_controller.show')
    router.get('/', '#controllers/position_controller.get')
    router.get('/get-pdf/:positionId', '#controllers/position_controller.getPdf')
    router.get('/get-excel/:positionId', '#controllers/position_controller.getExcel')
  })
  .prefix('/api/positions')
router
  .group(() => {
    router.post('/assign-shift/:positionId', '#controllers/position_controller.assignShift')
  })
  .prefix('/api/position')
  .use(middleware.auth())
