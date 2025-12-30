import { BaseSeeder } from '@adonisjs/lucid/seeders'
import WorkDisabilityType from '../../app/models/work_disability_type.js'

export default class extends BaseSeeder {
  async run() {
    const workDisabilityTypes = [
      {
        workDisabilityTypeId: 1,
        workDisabilityTypeName: 'Inicial',
        workDisabilityTypeDescription: 'Se determina por primera vez la enfermedad o el padecimiento que incapacita al trabajador para prestar sus servicios',
        workDisabilityTypeSlug: 'inicial',
        workDisabilityTypeActive: 1,
      },
      {
        workDisabilityTypeId: 2,
        workDisabilityTypeName: 'Subsecuente',
        workDisabilityTypeDescription: 'Cuando sea posterior al certificado inicial, en virtud de que se está certificando la continuación del periodo de incapacidad derivado del padecimiento inicial',
        workDisabilityTypeSlug: 'subsecuente',
        workDisabilityTypeActive: 1,
      },
      {
        workDisabilityTypeId: 3,
        workDisabilityTypeName: 'Recaída',
        workDisabilityTypeDescription: 'Víctima de un riesgo de trabajo, presenta una secuela del siniestro, con posterioridad a haber sido dado de alta para trabajar, ya que requiere atención médica, quirúrgica o rehabilitación',
        workDisabilityTypeSlug: 'recaida',
        workDisabilityTypeActive: 1,
      },
      {
        workDisabilityTypeId: 4,
        workDisabilityTypeName: 'Enlace',
        workDisabilityTypeDescription: 'Se expide cuando la fecha de parto es posterior a la estimada por el Instituto, de ahí que este tipo de incapacidades cubre el inter de esas fechas. Pueden amparar de uno y hasta siete días',
        workDisabilityTypeSlug: 'enlace',
        workDisabilityTypeActive: 1,
      }
    ]

    for (const workDisabilityType of workDisabilityTypes) {
      await WorkDisabilityType.firstOrCreate(
        { workDisabilityTypeId: workDisabilityType.workDisabilityTypeId },
        workDisabilityType,
      )
    }
  }
}
