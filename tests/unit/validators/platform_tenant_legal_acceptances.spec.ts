import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import {
  platformTenantLegalAcceptancesParamsValidator,
  platformTenantLegalAcceptancesQueryValidator,
} from '#modules/consent/platform/validators/platform_tenant_legal_acceptances.validator'

/**
 * El historial por tenant se valida en dos piezas: los params de la ruta traen el
 * id público (UUID) de la business unit, y el query solo admite paginación
 * (`page`/`perPage`). Cualquier otra llave del query —`reveal`, etc.— se ignora.
 * El borde `perPage` exactamente en el máximo (100) debe pasar; 101 debe rechazar.
 * `page=0` también rechaza (422): el validador usa `min(1)`, no `positive()`.
 */

type ValidationMessage = {
  field: string
  rule: string
  message: string
}

type CompiledValidator = {
  validate: (input: unknown) => Promise<unknown>
}

const VALID_UUID = '5f1c2a31-9c6f-4b1e-8e2a-2f1c2a319c6f'

/** Mensajes de un rechazo de VineJS. Si el dato pasa, la prueba falla. */
async function rejectedMessages(
  validator: CompiledValidator,
  input: unknown
): Promise<ValidationMessage[]> {
  try {
    await validator.validate(input)
  } catch (error) {
    if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) throw error
    return messagesFrom(error)
  }
  throw new Error('El validador aceptó un dato que debía rechazar')
}

function messagesFrom(
  error: InstanceType<typeof vineErrors.E_VALIDATION_ERROR>
): ValidationMessage[] {
  const raw: unknown = error.messages
  if (!Array.isArray(raw)) {
    throw new Error('Se esperaba la lista de mensajes del validador')
  }

  return raw.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Cada mensaje del validador debe ser un objeto')
    }
    const record = item as Record<string, unknown>
    const { field, rule, message } = record
    if (typeof field !== 'string' || typeof rule !== 'string' || typeof message !== 'string') {
      throw new Error('Cada mensaje debe traer field, rule y message')
    }
    return { field, rule, message }
  })
}

test.group('validador de params del historial de aceptaciones por tenant', () => {
  test('acepta un UUID válido en businessUnitPublicId', async ({ assert }) => {
    const data = await platformTenantLegalAcceptancesParamsValidator.validate({
      businessUnitPublicId: VALID_UUID,
    })

    assert.deepEqual(data, { businessUnitPublicId: VALID_UUID })
  })

  test('rechaza una cadena que no es UUID en businessUnitPublicId', async ({ assert }) => {
    const messages = await rejectedMessages(platformTenantLegalAcceptancesParamsValidator, {
      businessUnitPublicId: 'no-soy-uuid',
    })

    assert.isTrue(messages.some((item) => item.field === 'businessUnitPublicId'))
  })

  test('sin businessUnitPublicId rechaza con la regla required', async ({ assert }) => {
    const messages = await rejectedMessages(platformTenantLegalAcceptancesParamsValidator, {})

    assert.isTrue(
      messages.some(
        (item) => item.field === 'businessUnitPublicId' && item.rule === 'required'
      )
    )
  })

  test('recorta los espacios alrededor del UUID antes de validarlo', async ({ assert }) => {
    const data = await platformTenantLegalAcceptancesParamsValidator.validate({
      businessUnitPublicId: `  ${VALID_UUID}  `,
    })

    assert.deepEqual(data, { businessUnitPublicId: VALID_UUID })
  })
})

test.group('validador de query del historial de aceptaciones por tenant', () => {
  test('acepta la query vacía sin paginación', async ({ assert }) => {
    const data = await platformTenantLegalAcceptancesQueryValidator.validate({})

    assert.deepEqual(data, {})
  })

  test('acepta page 2 con perPage en el máximo permitido', async ({ assert }) => {
    const data = await platformTenantLegalAcceptancesQueryValidator.validate({
      page: 2,
      perPage: 100,
    })

    assert.deepEqual(data, { page: 2, perPage: 100 })
  })

  test('rechaza page 0 en el campo page', async ({ assert }) => {
    const messages = await rejectedMessages(platformTenantLegalAcceptancesQueryValidator, {
      page: 0,
    })

    assert.isTrue(messages.some((item) => item.field === 'page'))
  })

  test('rechaza perPage 101 en el campo perPage', async ({ assert }) => {
    const messages = await rejectedMessages(platformTenantLegalAcceptancesQueryValidator, {
      perPage: 101,
    })

    assert.isTrue(messages.some((item) => item.field === 'perPage'))
  })

  test('rechaza una cadena en page', async ({ assert }) => {
    const messages = await rejectedMessages(platformTenantLegalAcceptancesQueryValidator, {
      page: 'abc',
    })

    assert.isTrue(messages.some((item) => item.field === 'page'))
  })

  test('rechaza una cadena en perPage', async ({ assert }) => {
    const messages = await rejectedMessages(platformTenantLegalAcceptancesQueryValidator, {
      perPage: 'abc',
    })

    assert.isTrue(messages.some((item) => item.field === 'perPage'))
  })

  test('acepta perPage exactamente en el máximo de 100', async ({ assert }) => {
    const data = await platformTenantLegalAcceptancesQueryValidator.validate({ perPage: 100 })

    assert.deepEqual(data, { perPage: 100 })
  })
})
