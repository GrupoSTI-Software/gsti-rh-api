import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import { legalDocumentPublicQueryValidator } from '#modules/legal-documents/validators/legal_document_public_query.validator'

/**
 * La lectura pública no usa el validador de la consulta autenticada: aquel
 * admite el consentimiento biométrico. Aquí solo pasan términos y aviso de
 * privacidad. Un tipo ajeno —biométrico o inventado— falla en el campo `type`,
 * y un idioma ajeno falla en `locale`. Esa separación de campo es la que
 * distingue después el error de tipo del error de idioma.
 */

type ValidationMessage = {
  field: string
  rule: string
  message: string
}

const PUBLIC_TYPES = ['terms_conditions', 'privacy_notice'] as const
const PUBLIC_LOCALES = ['es', 'en'] as const

/** Mensajes de un rechazo de VineJS. Si el dato pasa, la prueba falla. */
async function rejectedMessages(input: {
  type?: string
  locale?: string
}): Promise<ValidationMessage[]> {
  try {
    await legalDocumentPublicQueryValidator.validate(input)
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

test.group('validador público de consulta de documentos legales', () => {
  test('acepta términos y aviso de privacidad sin idioma', async ({ assert }) => {
    for (const type of PUBLIC_TYPES) {
      const data = await legalDocumentPublicQueryValidator.validate({ type })
      assert.deepEqual(data, { type })
    }
  })

  test('acepta términos y aviso de privacidad con es y con en', async ({ assert }) => {
    for (const type of PUBLIC_TYPES) {
      for (const locale of PUBLIC_LOCALES) {
        const data = await legalDocumentPublicQueryValidator.validate({ type, locale })
        assert.deepEqual(data, { type, locale })
      }
    }
  })

  test('rechaza el consentimiento biométrico en el campo type', async ({ assert }) => {
    const type = 'biometric_consent'
    const messages = await rejectedMessages({ type })

    assert.isTrue(messages.some((item) => item.field === 'type'))
  })

  test('rechaza un tipo que no existe en el campo type', async ({ assert }) => {
    const type = 'inexistente'
    const messages = await rejectedMessages({ type })

    assert.isTrue(messages.some((item) => item.field === 'type'))
  })

  test('sin type rechaza con la regla required en el campo type', async ({ assert }) => {
    const locale = 'es'
    const messages = await rejectedMessages({ locale })

    assert.isTrue(messages.some((item) => item.field === 'type' && item.rule === 'required'))
  })

  test('acepta el idioma es y el idioma en', async ({ assert }) => {
    const type = 'terms_conditions'
    for (const locale of PUBLIC_LOCALES) {
      const data = await legalDocumentPublicQueryValidator.validate({ type, locale })
      assert.equal(data.locale, locale)
    }
  })

  test('rechaza el idioma fr en el campo locale', async ({ assert }) => {
    const type = 'privacy_notice'
    const locale = 'fr'
    const messages = await rejectedMessages({ type, locale })

    assert.isTrue(messages.some((item) => item.field === 'locale'))
  })

  test('acepta la consulta cuando el idioma no viene', async ({ assert }) => {
    const type = 'privacy_notice'
    const data = await legalDocumentPublicQueryValidator.validate({ type })

    assert.equal(data.type, type)
    assert.isFalse('locale' in data)
  })
})
