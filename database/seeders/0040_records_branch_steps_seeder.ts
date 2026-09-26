import { BaseSeeder } from '@adonisjs/lucid/seeders'
import OnboardingFlow from '../../app/models/onboarding_flow.js'
import OnboardingStep from '../../app/models/onboarding_step.js'

/**
 * Siembra los pasos de la rama "records" del motor de onboarding.
 *
 * El empleado de demostración lo crea el tronco común (paso first-employee).
 * Esta rama solo guía al usuario a abrir el expediente de ese empleado y
 * aprender a subir documentos con fecha de vencimiento.
 *
 * Pasos de esta rama:
 *   1. records-tour-employee → tour de la vista de empleados destacando el
 *                              botón de expedientes y el drawer de subida.
 *
 * Idempotente: usa updateOrCreate sobre el slug.
 */
export default class extends BaseSeeder {
  async run() {
    const recordsFlow = await OnboardingFlow.findBy('onboardingFlowSlug', 'records')

    if (!recordsFlow) {
      console.warn('[Seeder 0040] Flujo "records" no encontrado. Ejecuta primero el seeder base.')
      return
    }

    const branchSteps = [
      {
        slug: 'records-tour-employee',
        name: 'Explora el expediente del empleado',
        description: 'Aprende a subir documentos con fecha de vencimiento y ver las alertas automáticas.',
        order: 1,
        isSkippable: true,
        completionHint: 'records.employee.toured',
      },
    ]

    for (const step of branchSteps) {
      await OnboardingStep.updateOrCreate(
        { onboardingStepSlug: step.slug },
        {
          onboardingFlowId: recordsFlow.onboardingFlowId,
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
