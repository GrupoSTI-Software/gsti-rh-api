import { BaseSeeder } from '@adonisjs/lucid/seeders'
import OnboardingFlow from '../../app/models/onboarding_flow.js'
import OnboardingStep from '../../app/models/onboarding_step.js'

/**
 * Siembra los pasos de la rama "vacations" del motor de onboarding.
 *
 * El empleado de demostración lo crea el tronco común (paso first-employee).
 * Si la intención elegida es vacaciones, el wizard le asigna automáticamente
 * una fecha de contratación de 2 años atrás — no es necesario un paso propio.
 *
 * Pasos de esta rama:
 *   1. vacations-tour-policy   → tour por la pantalla de política de vacaciones
 *   2. vacations-tour-calendar → tour por el calendario de vacaciones
 *   3. vacations-tour-employee → tour de cómo añadir vacaciones a un empleado
 *
 * Idempotente: usa updateOrCreate sobre el slug.
 * El paso obsoleto "vacations-create-employee" se desactiva si existiera.
 */
export default class extends BaseSeeder {
  async run() {
    const vacationsFlow = await OnboardingFlow.findBy('onboardingFlowSlug', 'vacations')

    if (!vacationsFlow) {
      console.warn('[Seeder 0039] Flujo "vacations" no encontrado. Ejecuta primero el seeder base.')
      return
    }

    // Desactivar el paso obsoleto de creación de empleado vacations si existe
    await OnboardingStep.query()
      .where('onboarding_step_slug', 'vacations-create-employee')
      .update({ onboarding_step_active: false })

    const branchSteps = [
      {
        slug: 'vacations-tour-policy',
        name: 'Conoce la política de vacaciones',
        description: 'Explora cómo el sistema viene pre-cargado con la política de vacaciones de ley (LFT).',
        order: 1,
        isSkippable: true,
        completionHint: 'vacation.policy.toured',
      },
      {
        slug: 'vacations-tour-calendar',
        name: 'Explora el calendario de vacaciones',
        description: 'Aprende a usar el calendario para ver qué empleados tienen vacaciones en cada fecha.',
        order: 2,
        isSkippable: true,
        completionHint: 'vacation.calendar.toured',
      },
      {
        slug: 'vacations-tour-employee',
        name: 'Agrega vacaciones a tu empleado',
        description: 'Aprende a solicitar y gestionar vacaciones desde la ficha del empleado.',
        order: 3,
        isSkippable: true,
        completionHint: 'vacation.employee.toured',
      },
    ]

    for (const step of branchSteps) {
      await OnboardingStep.updateOrCreate(
        { onboardingStepSlug: step.slug },
        {
          onboardingFlowId: vacationsFlow.onboardingFlowId,
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
