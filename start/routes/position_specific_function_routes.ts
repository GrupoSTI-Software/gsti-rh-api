import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_specific_function_controller.store')
    router.put('/:positionSpecificFunctionId', '#controllers/position_specific_function_controller.update')
    router.delete('/:positionSpecificFunctionId', '#controllers/position_specific_function_controller.delete')
    router.get('/distinct-names', '#controllers/position_specific_function_controller.getDistinctNames')
    router.get('/distinct-frequencies', '#controllers/position_specific_function_controller.getDistinctFrequencies')
    router.get('/by-position/:positionId', '#controllers/position_specific_function_controller.getByPosition')
  })
  .prefix('/api/position-specific-functions')
  .use(middleware.auth())
  .use(middleware.businessScope())
