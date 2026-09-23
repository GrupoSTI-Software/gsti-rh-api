import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .post(
    '/api/onboarding/me/simulate-attendance',
    '#modules/onboarding/simulate_attendance/simulate_attendance.controller.create'
  )
  .use(middleware.auth())
