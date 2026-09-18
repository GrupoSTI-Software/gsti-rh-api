import { BaseSeeder } from '@adonisjs/lucid/seeders'
import MedicalConditionType from '../../app/models/medical_condition_type.js'

/**
 * DATOS DE DESARROLLO. Siembra los tipos de condición médica de la empresa de ejemplo y por eso no corre en producción.
 *
 * Una instalación de producción no tiene empresas propias: los tenants nacen del
 * registro self-service o del alta desde configuración, cada uno con sus roles y
 * su configuración. `GSTI RH` y todo lo que cuelga de ella existen para poder
 * trabajar y correr la suite en local, no para ser el primer cliente.
 *
 * `root` sí se siembra siempre (`0008_user_seeder`): es la cuenta de plataforma
 * y alcanza todas las empresas activas sin necesitar membresía
 * (`BusinessAccessScopeService.getAccessibleIds`).
 */
export default class extends BaseSeeder {
  /** Fuera de producción: es dato de ejemplo, no plataforma. */
  static environment = ['development', 'test']

  async run() {
    const medicalConditionTypes = [
      {
        medicalConditionTypeId: 1,
        medicalConditionTypeName: 'Tipo de sangre',
        medicalConditionTypeDescription: 'Tipo de sangre',
        medicalConditionTypeActive: 1,
        // Catálogo semilla de la unidad principal (ya no es global).
        businessUnitId: 1,
      },
    ]

    for (const medicalConditionType of medicalConditionTypes) {
      const { medicalConditionTypeId, ...medicalConditionTypeData } = medicalConditionType
      await MedicalConditionType.firstOrCreate({ medicalConditionTypeId }, medicalConditionTypeData)
    }
  }
}
