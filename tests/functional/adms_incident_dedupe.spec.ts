import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AdmsIncident from '#models/adms_incident'
import BusinessUnit from '#models/business_unit'
import IncidentService from '#modules/adms/raw/incident.service'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { TenantContext } from '#utils/tenant_context'

const STAMP = `${Date.now()}`
const SERIAL = `TEST-INC-${STAMP}`
const VENTANA_MINUTOS = 24 * 60

/**
 * La deduplicacion tiene que sobrevivir a que alguien atienda el incidente.
 *
 * Con un equipo que sale por dos enlaces, mirar solo los incidentes abiertos
 * hacia que el canal levantara otro al segundo de resolverlo: el boton de
 * "es mi aparato, liberalo" no servia de nada y los biometricos nunca salian.
 */
test.group('ADMS deduplicacion de incidentes', (group) => {
  let accessPoint: AccessPoint
  let businessUnitId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const unit = await BusinessUnit.query().whereNull('business_unit_deleted_at').firstOrFail()
      businessUnitId = unit.businessUnitId

      accessPoint = new AccessPoint()
      accessPoint.accessPointName = `Checador ${SERIAL}`
      accessPoint.businessUnitId = businessUnitId
      accessPoint.accessPointActive = 1
      accessPoint.accessPointSerialNumber = SERIAL
      accessPoint.accessPointStatus = 0
      await accessPoint.save()
    }, 'fixture de deduplicacion')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de deduplicacion')
  })

  async function registrar(now: DateTime) {
    const service = new IncidentService()
    return TenantContext.run([businessUnitId], () =>
      service.record(
        {
          kind: ADMS_INCIDENT_KIND.IP_ANOMALY,
          severity: 'warning',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'Misma serie desde dos IP en pocos minutos',
          detail: 'Prueba de deduplicacion',
          key: 'anomalia-de-ip',
          serial: SERIAL,
          accessPointId: accessPoint.accessPointId,
          businessUnitId,
          now,
        },
        { dedupeMinutes: VENTANA_MINUTOS }
      )
    )
  }

  test('atender un incidente no reabre la puerta a uno nuevo en la ventana', async ({ assert }) => {
    const inicio = DateTime.utc()

    assert.equal(await registrar(inicio), 'created')
    assert.equal(await registrar(inicio.plus({ seconds: 5 })), 'deduped')

    // Alguien dice que el aparato es suyo y da el aviso por atendido.
    const service = new IncidentService()
    await TenantContext.run([businessUnitId], () =>
      service.resolveResolvedCause(
        ADMS_INCIDENT_KIND.IP_ANOMALY,
        accessPoint.accessPointId,
        inicio.plus({ seconds: 10 })
      )
    )

    // La misma causa vuelve a presentarse: antes esto levantaba otro al
    // instante y dejaba el boton de liberar sin efecto.
    assert.equal(await registrar(inicio.plus({ seconds: 15 })), 'deduped')

    const total = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', ADMS_INCIDENT_KIND.IP_ANOMALY)
          .count('* as total'),
      'conteo de incidentes'
    )
    assert.equal(total[0].$extras.total, 1)
  })

  test('pasada la ventana, la causa que persiste vuelve a avisar', async ({ assert }) => {
    const despues = DateTime.utc().plus({ minutes: VENTANA_MINUTOS + 1 })

    assert.equal(await registrar(despues), 'created')
  })
})
