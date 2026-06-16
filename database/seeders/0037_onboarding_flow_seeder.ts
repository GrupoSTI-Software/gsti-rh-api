import { BaseSeeder } from '@adonisjs/lucid/seeders'
import OnboardingFlow from '../../app/models/onboarding_flow.js'
import OnboardingStep from '../../app/models/onboarding_step.js'

/**
 * Siembra el catálogo declarativo del motor de onboarding.
 *
 * Datos sembrados:
 *  1. Tres intenciones (flujos) activas: attendance, vacations, records.
 *  2. Tres pasos del tronco común (onboarding_flow_id = NULL), que aplican
 *     a todo usuario sin importar la intención elegida.
 *
 * Pasos de rama (attendance, vacations, records) NO se siembran aquí;
 * cada esbozo de rama los agrega por upsert con su flow_id.
 *
 * Idempotente: usa updateOrCreate sobre el slug; reejecutar no duplica.
 */
export default class extends BaseSeeder {
  async run() {
    await this.seedFlows()
    await this.seedCommonSteps()
  }

  /** 1. Intenciones disponibles para que el cliente elija su dolor principal. */
  private async seedFlows() {
    const flows = [
      {
        slug: 'attendance',
        name: 'Control de asistencia',
        description: 'Configura el registro de entradas, salidas y turnos de tus empleados.',
        order: 1,
      },
      {
        slug: 'vacations',
        name: 'Vacaciones',
        description: 'Gestiona las solicitudes y aprobaciones de vacaciones de tu equipo.',
        order: 2,
      },
      {
        slug: 'records',
        name: 'Expedientes',
        description: 'Organiza los expedientes digitales y documentos de cada empleado.',
        order: 3,
      },
    ]

    for (const flow of flows) {
      await OnboardingFlow.updateOrCreate(
        { onboardingFlowSlug: flow.slug },
        {
          onboardingFlowName: flow.name,
          onboardingFlowDescription: flow.description,
          onboardingFlowActive: true,
          onboardingFlowOrder: flow.order,
        }
      )
    }
  }

  /** 2. Pasos comunes: aplican a todo usuario, onboarding_flow_id = NULL. */
  private async seedCommonSteps() {
    const commonSteps = [
      {
        slug: 'setup-structure',
        name: 'Configura la estructura de tu empresa',
        description: 'Define departamentos, sucursales y puestos para reflejar cómo está organizada tu empresa.',
        order: 1,
        isSkippable: false,
        completionHint: 'company.structure.ready',
      },
      {
        slug: 'first-employee',
        name: 'Da de alta tu primer empleado',
        description: 'Registra al menos un empleado para empezar a usar las funciones del sistema.',
        order: 2,
        isSkippable: true,
        completionHint: 'employee.first.created',
      },
      {
        slug: 'try-as-employee',
        name: 'Pruébalo como tu empleado',
        description: 'Accede al sistema con la vista del empleado para experimentar el flujo completo.',
        order: 3,
        isSkippable: true,
        completionHint: 'employee.test.access.used',
      },
    ]

    for (const step of commonSteps) {
      await OnboardingStep.updateOrCreate(
        { onboardingStepSlug: step.slug },
        {
          onboardingFlowId: null,
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
