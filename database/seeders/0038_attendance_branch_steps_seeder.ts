import { BaseSeeder } from '@adonisjs/lucid/seeders'
import OnboardingFlow from '../../app/models/onboarding_flow.js'
import OnboardingStep from '../../app/models/onboarding_step.js'

/**
 * Siembra los pasos de la rama "attendance" del motor de onboarding.
 *
 * Pasos:
 *   1. create-shift      → guía al admin a crear su primer turno
 *   2. assign-shift      → asigna el turno al empleado en un día elegido
 *   3. simulate-attendance → genera asistencias simuladas y aterriza en el monitor
 *
 * Idempotente: usa updateOrCreate sobre el slug; reejecutar no duplica.
 */
export default class extends BaseSeeder {
  async run() {
    const attendanceFlow = await OnboardingFlow.findBy('onboardingFlowSlug', 'attendance')

    if (!attendanceFlow) {
      console.warn('[Seeder 0038] Flujo "attendance" no encontrado. Ejecuta primero 0037.')
      return
    }

    const branchSteps = [
      {
        slug: 'create-shift',
        name: 'Crea tu primer turno',
        description: 'Define los horarios y días de descanso de tu primer turno laboral.',
        order: 1,
        isSkippable: false,
        completionHint: 'shift.first.created',
      },
      {
        slug: 'assign-shift',
        name: 'Asigna el turno a tu empleado',
        description: 'Vincula el turno al empleado que creaste y elige el día de inicio.',
        order: 2,
        isSkippable: false,
        completionHint: 'shift.assigned.to.employee',
      },
      {
        slug: 'simulate-attendance',
        name: 'Visualiza la asistencia',
        description: 'Genera datos simulados para el día elegido y explora el monitor de asistencia.',
        order: 3,
        isSkippable: true,
        completionHint: 'attendance.simulated',
      },
    ]

    for (const step of branchSteps) {
      await OnboardingStep.updateOrCreate(
        { onboardingStepSlug: step.slug },
        {
          onboardingFlowId: attendanceFlow.onboardingFlowId,
          onboardingStepName: step.name,
          onboardingStepDescription: step.description,
          onboardingStepOrder: step.order,
          onboardingStepIsSkippable: step.isSkippable,
          onboardingStepCompletionHint: step.completionHint,
          onboardingStepActive: true,
        }
      )
    }
  }
}
