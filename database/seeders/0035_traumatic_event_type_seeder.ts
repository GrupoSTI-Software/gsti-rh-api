import TraumaticEventType from '#models/traumatic_event_type'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

/**
 * Catálogo de tipos de acontecimiento traumático severo conforme al numeral 4.1
 * de la NOM-035-STPS-2018 y la Guía I del DOF.
 *
 * `firstOrCreate` por slug → idempotente en re-ejecuciones del seeder.
 * Catálogo global sin tenant: terminología normativa, no configurable por cliente.
 */
export default class extends BaseSeeder {
  async run() {
    const tipos = [
      {
        slug: 'explosion',
        name: 'Explosión',
        description:
          'Estallido súbito ocurrido durante o con motivo del trabajo que causa o pudo causar la muerte o lesiones graves.',
      },
      {
        slug: 'derrumbe',
        name: 'Derrumbe',
        description:
          'Colapso de estructuras, construcciones o materiales durante o con motivo del trabajo, con peligro real para la vida o la integridad física.',
      },
      {
        slug: 'incendio-gran-magnitud',
        name: 'Incendio de gran magnitud',
        description:
          'Incendio de gran magnitud ocurrido durante o con motivo del trabajo que pone en riesgo la vida o la integridad física.',
      },
      {
        slug: 'accidente-grave-mortal',
        name: 'Accidente grave o mortal',
        description:
          'Accidente que tiene como consecuencia la muerte, la pérdida de un miembro o una lesión grave.',
      },
      {
        slug: 'asalto-violencia',
        name: 'Asalto con violencia',
        description:
          'Asalto con uso de violencia sufrido o presenciado durante o con motivo del trabajo.',
      },
      {
        slug: 'secuestro',
        name: 'Secuestro',
        description:
          'Privación ilegal de la libertad del trabajador o de terceros, ocurrida durante o con motivo del trabajo.',
      },
      {
        slug: 'homicidio',
        name: 'Homicidio',
        description:
          'Homicidio o su tentativa ocurrido durante o con motivo del trabajo, sufrido o presenciado por el trabajador.',
      },
      {
        slug: 'amenaza-grave',
        name: 'Amenaza grave contra la vida o la integridad física',
        description:
          'Amenaza recibida durante o con motivo del trabajo que pone en riesgo la vida o la integridad física del trabajador o de otras personas.',
      },
      {
        slug: 'otro-acontecimiento-41',
        name: 'Otro acontecimiento traumático severo',
        description:
          'Cualquier otro acontecimiento ocurrido durante o con motivo del trabajo que ponga en riesgo la vida o la salud, conforme a la cláusula abierta del numeral 4.1.',
      },
    ]

    for (const tipo of tipos) {
      await TraumaticEventType.firstOrCreate(
        { traumaticEventTypeSlug: tipo.slug },
        {
          traumaticEventTypeName: tipo.name,
          traumaticEventTypeDescription: tipo.description,
          traumaticEventTypeActive: 1,
          traumaticEventTypeCreatedAt: DateTime.now(),
        }
      )
    }
  }
}
