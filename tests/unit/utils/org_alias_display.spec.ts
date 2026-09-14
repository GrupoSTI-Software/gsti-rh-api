import { test } from '@japa/runner'
import { resolveOrgAliasDisplay } from '#utils/org_alias_display'

/**
 * USRH1788466831291 — la etiqueta de las columnas de estructura.
 * Regla 3: alias cuando existe, nombre cuando no hay alias.
 * Regla 2: sin dato, celda vacía y sin texto de relleno.
 */
test.group('Estructura — etiqueta de departamento y puesto (USRH1788466831291)', () => {
  test('con alias capturado devuelve el alias, no el nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('RRHH', 'Recursos Humanos'), 'RRHH')
  })

  test('sin alias devuelve el nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('', 'Recursos Humanos'), 'Recursos Humanos')
  })

  test('con alias nulo en base de datos devuelve el nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay(null, 'Recursos Humanos'), 'Recursos Humanos')
  })

  test('con alias undefined devuelve el nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay(undefined, 'Recursos Humanos'), 'Recursos Humanos')
  })

  test('sin departamento asignado devuelve cadena vacia', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay(undefined, undefined), '')
  })

  test('con registro eliminado que llega nulo devuelve cadena vacia', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay(null, null), '')
  })

  test('con alias y nombre vacios devuelve cadena vacia', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('', ''), '')
  })

  test('con registro soft-deleted devuelve cadena vacia aunque traiga nombre', ({ assert }) => {
    assert.equal(
      resolveOrgAliasDisplay('QA-EST-ALIAS-DEPTO', 'QA Departamento Estructura DELETED', true),
      ''
    )
  })

  test('sin soft-delete sigue mostrando alias o nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('RRHH', 'Recursos Humanos', false), 'RRHH')
    assert.equal(resolveOrgAliasDisplay('', 'Recursos Humanos', false), 'Recursos Humanos')
  })
})
