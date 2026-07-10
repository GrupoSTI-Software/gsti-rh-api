import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_bonus_controller.index')
    router.post('/', '#controllers/employee_bonus_controller.store')
    router.get('/concepts/:employeeId', '#controllers/employee_bonus_controller.concepts')
    router.get('/:employeeBonusId', '#controllers/employee_bonus_controller.show')
    router.put('/:employeeBonusId', '#controllers/employee_bonus_controller.update')
    router.delete('/:employeeBonusId', '#controllers/employee_bonus_controller.delete')
  })
  .prefix('/api/employee-bonuses')
  .use(middleware.auth())
  .use(middleware.businessScope())
