import { test } from '@japa/runner'
import Employee from '#models/employee'
import { applyVisibleDepartmentsScope } from '#helpers/apply_visible_departments_scope'

/**
 * USRH1788466831247 — el criterio con el que quien ve toda la plantilla
 * recorta por departamento. Se verifica el SQL que compila, sin BD: lo que
 * importa es la forma exacta de la cláusula (regla 5: agrupada, en AND con
 * el resto; regla 8: la lista sigue mandando para quien sí tiene
 * departamento).
 */
test.group('Alcance — departamento visible o sin departamento (USRH1788466831247)', () => {
  test('con departamentos, agrega IN (...) OR IS NULL entre paréntesis', ({ assert }) => {
    const query = Employee.query().where('business_unit_id', 7)
    applyVisibleDepartmentsScope(query, [1, 2])

    assert.equal(
      query.toQuery(),
      'select * from `employees` where `business_unit_id` = 7 and (`department_id` in (1, 2) or `department_id` is null)'
    )
  })

  test('sin departamentos (empresa nueva), la lista no se vacía: queda solo IS NULL', ({
    assert,
  }) => {
    const query = Employee.query().where('business_unit_id', 7)
    applyVisibleDepartmentsScope(query, [])

    assert.equal(
      query.toQuery(),
      'select * from `employees` where `business_unit_id` = 7 and (1 = 0 or `department_id` is null)'
    )
  })

  test('no toca el puesto ni ninguna otra columna', ({ assert }) => {
    const query = Employee.query()
    applyVisibleDepartmentsScope(query, [3])

    assert.notInclude(query.toQuery(), 'position_id')
    assert.equal(
      query.toQuery(),
      'select * from `employees` where (`department_id` in (3) or `department_id` is null)'
    )
  })
})
