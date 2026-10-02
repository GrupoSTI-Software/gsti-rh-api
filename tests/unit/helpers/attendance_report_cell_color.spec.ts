import { test } from '@japa/runner'
import { attendanceStatusCellColor } from '#helpers/attendance_report_cell_color'

test.group('Reporte de asistencia — color de la celda del día', () => {
  test('cada estado calificado tiene su color', ({ assert }) => {
    assert.equal(attendanceStatusCellColor('ontime'), 'FFC6EFCE')
    assert.equal(attendanceStatusCellColor('tolerance'), 'FFB7D8FA')
    assert.equal(attendanceStatusCellColor('delay'), 'FFFFC000')
    assert.equal(attendanceStatusCellColor('fault'), 'FFFFAAA3')
  })

  test('un estado vacío o que el cálculo no califica no se pinta como puntual', ({ assert }) => {
    for (const status of ['', 'exception', null, undefined]) {
      assert.equal(attendanceStatusCellColor(status), 'FFFFFFFF')
    }
  })
})
