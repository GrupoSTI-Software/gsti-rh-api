import { BaseSeeder } from '@adonisjs/lucid/seeders'
import OnboardingFlow from '../../app/models/onboarding_flow.js'
import OnboardingStep from '../../app/models/onboarding_step.js'
import OnboardingUserStepProgress from '../../app/models/onboarding_user_step_progress.js'

/**
 * Recorrido único del onboarding (USRH1785438246847, regla 7): la pregunta
 * de intención desaparece; queda una sola secuencia fija para todos.
 *
 * 1. Desactiva los flujos por tema (attendance/vacations/records). NO se
 *    borran: sus FKs SET NULL reescribirían estados de usuarios.
 * 2. Desactiva los pasos del recorrido viejo (comunes y de rama); el motor
 *    degrada limpio ante pasos inactivos.
 * 3. Upsertea los 4 pasos del recorrido único, todos con flow NULL (el motor
 *    opera sin intent: columnas nullable desde la migración 1781200000000).
 * 4. Depura el progreso de pasos desactivados (sin clientes reales,
 *    decisión Fase 1).
 *
 * Idempotente: updateOrCreate por slug; re-ejecutar no duplica.
 */

const LEGACY_FLOW_SLUGS = ['attendance', 'vacations', 'records']

const LEGACY_STEP_SLUGS = [
  'setup-structure',
  'first-employee',
  'try-as-employee',
]

const SINGLE_TOUR_STEPS = [
  {
    slug: 'demo-credentials',
    name: 'Credenciales de prueba de la app',
    description:
      'Recibe la credencial del empleado de práctica para probar la app del empleado desde tu celular.',
    order: 1,
    completionHint: 'demo.credentials.shown',
  },
  {
    slug: 'tour-attendance',
    name: 'Tour de control de asistencia',
    description:
      'Recorre el monitor de asistencias con las checadas del empleado de práctica.',
    order: 2,
    completionHint: 'tour.attendance.done',
  },
  {
    slug: 'tour-vacations',
    name: 'Tour de vacaciones',
    description:
      'Conoce las tarjetas de vacaciones y el calendario con los días del empleado de práctica.',
    order: 3,
    completionHint: 'tour.vacations.done',
  },
  {
    slug: 'tour-records',
    name: 'Tour de expedientes',
    description:
      'Encuentra al empleado de práctica y el acceso a su expediente digital.',
    order: 4,
    completionHint: 'tour.records.done',
  },
]

export default class extends BaseSeeder {
  async run() {
    // 1. Flujos por tema fuera de servicio (se apagan, no se borran).
    await OnboardingFlow.query()
      .whereIn('onboarding_flow_slug', LEGACY_FLOW_SLUGS)
      .update({ onboarding_flow_active: false })

    // 2. Pasos del recorrido viejo: los comunes listados y todos los de rama
    //    (cualquier paso con flow asignado pertenece al esquema por tema).
    await OnboardingStep.query()
      .where((query) => {
        query.whereIn('onboarding_step_slug', LEGACY_STEP_SLUGS)
        query.orWhereNotNull('onboarding_flow_id')
      })
      .whereNotIn('onboarding_step_slug', SINGLE_TOUR_STEPS.map((step) => step.slug))
      .update({ onboarding_step_active: false })

    // 3. Pasos del recorrido único (flow NULL, omitibles).
    for (const step of SINGLE_TOUR_STEPS) {
      await OnboardingStep.updateOrCreate(
        { onboardingStepSlug: step.slug },
        {
          onboardingFlowId: null,
          onboardingStepName: step.name,
          onboardingStepDescription: step.description,
          onboardingStepOrder: step.order,
          onboardingStepIsSkippable: true,
          onboardingStepCompletionHint: step.completionHint,
          onboardingStepActive: true,
        }
      )
    }

    // 4. Progreso de pasos desactivados: se depura (sin clientes reales).
    const inactiveSteps = await OnboardingStep.query()
      .where('onboarding_step_active', false)
      .select('onboarding_step_id')
    if (inactiveSteps.length > 0) {
      await OnboardingUserStepProgress.query()
        .whereIn(
          'onboarding_step_id',
          inactiveSteps.map((step) => step.onboardingStepId)
        )
        .delete()
    }
  }
}
