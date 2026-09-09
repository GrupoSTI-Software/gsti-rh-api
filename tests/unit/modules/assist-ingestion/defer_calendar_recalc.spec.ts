import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AssistIngestionService from '#modules/assist-ingestion/assist_ingestion.service'
import type { AssistIngestionRepository } from '#modules/assist-ingestion/assist_ingestion.repository'
import type {
  CalendarRecalcJob,
  CalendarRecalcRepository,
} from '#modules/assist-ingestion/calendar-recalc/calendar_recalc.repository'
import type {
  AssistIngestionItem,
  AssistIngestionPersisted,
  AssistIngestionRecord,
} from '#modules/assist-ingestion/dto/assist_ingestion.dto'
import type Assist from '#models/assist'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'

const PUNCH = DateTime.fromISO('2026-08-12T14:53:23Z', { zone: 'utc' })

/**
 * El canal del checador no puede recalcular calendarios dentro de la peticion:
 * con `deferCalendarRecalc` el trabajo se encola y la entrega responde igual.
 */
test.group('Ingesta con recalculo diferido', (group) => {
  let employee: Employee

  group.setup(async () => {
    employee = await TenantContext.runUnscoped(
      () =>
        Employee.query()
          .whereNull('employee_deleted_at')
          .whereNotNull('business_unit_id')
          .firstOrFail(),
      'fixture de recalculo diferido'
    )
  })

  function makeService(records: AssistIngestionRecord[]) {
    const enqueued: CalendarRecalcJob[] = []
    const repository: AssistIngestionRepository = {
      async ingestMany(incoming) {
        records.push(...incoming)
        return incoming.map<AssistIngestionPersisted>((record) => ({
          index: record.index,
          outcome: 'inserted',
          assist: {
            assistEmpId: record.employeeId,
            businessUnitId: record.businessUnitId,
            assistPunchTimeUtc: record.punchTimeUtc,
          } as unknown as Assist,
        }))
      },
    }
    const calendarRecalc: CalendarRecalcRepository = {
      async enqueue(jobs) {
        enqueued.push(...jobs)
      },
    }
    return { service: new AssistIngestionService(repository, calendarRecalc), enqueued }
  }

  function itemFor(): AssistIngestionItem {
    return {
      subject: {
        kind: 'employeeCode',
        employeeCode: String(employee.employeeCode),
        businessUnitId: employee.businessUnitId as number,
      },
      assistType: null,
      punchTimeUtc: PUNCH,
      geo: { latitude: null, longitude: null, precision: null },
      origin: ASSIST_ORIGIN.ADMS,
      createdByUserId: null,
      terminalSn: 'TEST-ADMS-DEFER',
      terminalAlias: 'Checador de prueba',
      verifyMethod: 15,
      clientRef: null,
    }
  }

  test('con la opcion activa se encola el rango y no se recalcula en linea', async ({ assert }) => {
    const records: AssistIngestionRecord[] = []
    const { service, enqueued } = makeService(records)
    const result = await TenantContext.run([employee.businessUnitId as number], () =>
      service.ingest([itemFor()], { deferCalendarRecalc: true })
    )
    assert.equal(result.summary.inserted, 1)
    assert.lengthOf(enqueued, 1)
    assert.equal(enqueued[0].employeeId, employee.employeeId)
    assert.equal(enqueued[0].businessUnitId, employee.businessUnitId)
    // Bordes: un dia antes y uno despues del marcaje, en la zona de negocio.
    assert.equal(enqueued[0].from.toFormat('yyyy-MM-dd'), '2026-08-11')
    assert.equal(enqueued[0].to.toFormat('yyyy-MM-dd'), '2026-08-13')
  })

  test('el alias y el metodo de verificacion llegan al registro', async ({ assert }) => {
    const records: AssistIngestionRecord[] = []
    const { service } = makeService(records)
    await TenantContext.run([employee.businessUnitId as number], () =>
      service.ingest([itemFor()], { deferCalendarRecalc: true })
    )
    assert.lengthOf(records, 1)
    assert.equal(records[0].terminalAlias, 'Checador de prueba')
    assert.equal(records[0].verifyMethod, 15)
    assert.equal(records[0].origin, 'adms')
  })

  test('sin la opcion no se encola nada: el camino de siempre no cambia', async ({ assert }) => {
    const records: AssistIngestionRecord[] = []
    const { service, enqueued } = makeService(records)
    // El recalculo directo toca la base; basta con comprobar que no encola.
    await TenantContext.run([employee.businessUnitId as number], async () => {
      try {
        await service.ingest([itemFor()])
      } catch {
        // El recalculo real puede fallar sin fixture de calendario; no importa aqui.
      }
    })
    assert.lengthOf(enqueued, 0)
  })
})
