import { test } from '@japa/runner'
import {
  EMPLOYEE_EXCEL_SENSITIVE_HEADERS,
  findSensitiveCategoriesInExcelHeaders,
} from '#constants/employee_excel_sensitive_headers'

test.group('employee_excel_sensitive_headers', () => {
  test('el mapa incluye las 7 cabeceras sensibles incluyendo Salario diario', ({ assert }) => {
    const headers = EMPLOYEE_EXCEL_SENSITIVE_HEADERS.map((e) => e.header)
    assert.includeMembers(headers, [
      'CURP',
      'RFC',
      'NSS',
      'Correo personal',
      'Teléfono Personal',
      'Teléfono contacto emergencia',
      'Salario diario',
    ])
  })

  test('Salario diario activa financiero', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['Salario diario', 'Nombre del empleado'])
    assert.deepEqual(cats, ['financiero'])
  })

  test('archivo sin columnas sensibles devuelve arreglo vacío', ({ assert }) => {
    assert.deepEqual(findSensitiveCategoriesInExcelHeaders(['Nombre del empleado', 'Departamento']), [])
  })

  test('NSS activa identificacion (case-insensitive)', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['nss', 'Nombre del empleado'])
    assert.deepEqual(cats, ['identificacion'])
  })

  test('correo personal y teléfono activan contacto', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['Correo personal', 'Teléfono Personal'])
    assert.includeMembers(cats, ['contacto'])
  })

  test('CURP + correo activan identificacion y contacto', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['CURP', 'Correo personal'])
    assert.includeMembers(cats, ['identificacion', 'contacto'])
  })
})
