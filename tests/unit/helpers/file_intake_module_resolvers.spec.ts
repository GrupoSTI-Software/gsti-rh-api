import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveEmployeeOffboardingApiError } from '../../../app/helpers/employee_offboarding_api_error.js'
import { FileIntakeError } from '../../../app/exceptions/file_intake_error.js'
import { FILE_INTAKE_ERROR_CODES } from '../../../app/constants/file_intake_error_codes.js'

/**
 * El registro del rechazo en el manejador global no basta.
 *
 * Los módulos que traen su propio resolver atrapan el error antes de que llegue
 * allí y lo tratan como fallo no clasificado: el usuario recibía un 500
 * genérico sin enterarse de que su archivo fue rechazado ni por qué. El primer
 * arreglo se validó contra el manejador global, que era justo el camino que
 * esos módulos no toman.
 */

/** i18n mínimo: los resolvers solo piden `formatMessage`. */
const i18nFake = {
  formatMessage: (key: string) => key,
} as unknown as Parameters<typeof resolveEmployeeOffboardingApiError>[1]

function rechazoDeArchivo(): FileIntakeError {
  return new FileIntakeError({
    title: 'Archivo no aceptado',
    detail: 'El contenido del archivo no corresponde a PDF.',
    key: 'contenido-no-corresponde',
    errorCode: FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID,
  })
}

test.group('Resolvers de módulo — rechazo de archivos', () => {
  test('el resolver de offboarding devuelve 422 con el triplete, no 500', ({ assert }) => {
    const resuelto = resolveEmployeeOffboardingApiError(rechazoDeArchivo(), i18nFake)

    assert.equal(resuelto.status, 422, 'debe conservar el 422, no degradar a 500')
    assert.equal(resuelto.title, 'Archivo no aceptado')
    assert.equal(resuelto.detail, 'El contenido del archivo no corresponde a PDF.')
    assert.equal(resuelto.key, 'contenido-no-corresponde')
    assert.equal(resuelto.code, FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID)
  })

  test('un error ajeno sigue resolviéndose como siempre', ({ assert }) => {
    const resuelto = resolveEmployeeOffboardingApiError(new Error('algo se rompió'), i18nFake)

    assert.notEqual(resuelto.status, 422, 'no debe confundirse con un rechazo de archivo')
  })

  test('los controladores con resolver propio conocen el rechazo de archivos', async ({
    assert,
  }) => {
    // Cada uno de estos participa en una subida y trae su propio `respondError`,
    // que sin esta rama convierte el 422 en un 500 del servidor.
    const controladores = [
      'app/controllers/contratos_servicios_especializados_controller.ts',
      'app/controllers/documentos_contrato_especializado_controller.ts',
      'app/controllers/employee_lactation_period_evidences_controller.ts',
      'app/controllers/traumatic_event_report_evidences_controller.ts',
      'app/controllers/employee_certification_upload_controller.ts',
      'app/modules/repse-providers/expediente/expediente.controller.ts',
      'app/modules/repse-providers/validations/validations.controller.ts',
    ]

    for (const ruta of controladores) {
      const content = await readFile(join(process.cwd(), ruta), 'utf-8')

      assert.include(content, 'isFileIntakeError', `${ruta} degradaría el rechazo a 500`)
    }
  })
})
