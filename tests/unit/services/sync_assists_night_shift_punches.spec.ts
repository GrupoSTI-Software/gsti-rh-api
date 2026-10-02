import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import SyncAssistsService from '#services/sync_assists_service'
import { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import { AssistInterface } from '../../../app/interfaces/assist_interface.js'

/**
 * Turno que cruza medianoche: la salida de las 06:00 vive en el día
 * siguiente. Se copiaba al turno pero seguía libre en el día siguiente, que
 * podía tomarla como su entrada y la listaba como registro adicional.
 */

type Rules = {
  setNexCalendarDayCheckOuts(
    evaluatedDay: DateTime,
    assistList: AssistDayInterface[],
    checkOutDateTime: DateTime
  ): AssistInterface[]
}

function rules(): Rules {
  return new SyncAssistsService() as unknown as Rules
}

function punch(assistId: number, isoUtc: string): AssistInterface {
  return { assistId, assistPunchTimeUtc: isoUtc, assistUsed: false } as unknown as AssistInterface
}

test.group('SyncAssistsService — salida de un turno nocturno', () => {
  test('marca como usada en el día siguiente la checada que toma como salida', ({ assert }) => {
    // Turno de 22:00 a 06:00 en CDMX: sale 06:05 (12:05Z); a las 14:00 (20:00Z) entra a otro turno.
    const salida = punch(2, '2026-07-23T12:05:00.000Z')
    const otroTurno = punch(3, '2026-07-23T20:00:00.000Z')
    const assistList = [
      { day: '2026-07-23', assist: { assitFlatList: [salida, otroTurno] } },
    ] as unknown as AssistDayInterface[]

    const taken = rules().setNexCalendarDayCheckOuts(
      DateTime.fromISO('2026-07-22'),
      assistList,
      DateTime.fromISO('2026-07-23T11:59:00.000Z')
    )

    assert.deepEqual(
      taken.map((item) => item.assistId),
      [2]
    )
    assert.isTrue(salida.assistUsed)
    assert.isFalse(otroTurno.assistUsed)
  })
})
