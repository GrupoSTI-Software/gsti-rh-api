import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import ConsentGate from '#modules/biometric-vault/consent/consent_gate'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import type {
  ConsentGateRepository,
  ConsentRecord,
} from '#modules/biometric-vault/consent/consent_gate.repository'

const FIRMADO: ConsentRecord = {
  userConsentId: 1,
  legalDocumentId: 7,
  channel: 'physical',
  grantedAt: DateTime.fromISO('2026-08-01T10:00:00Z'),
}

function makeGate(options: { documentId?: number | null; consent?: ConsentRecord | null } = {}) {
  const repository: ConsentGateRepository = {
    async findCurrentBiometricDocumentId() {
      return options.documentId === undefined ? 7 : options.documentId
    },
    async findConsentFor() {
      return options.consent ?? null
    },
  }
  return new ConsentGate(repository)
}

test.group('Puerta de consentimiento biometrico', () => {
  test('con la firma del documento vigente deja pasar', async ({ assert }) => {
    const record = await makeGate({ consent: FIRMADO }).assertGranted(42)
    assert.equal(record.userConsentId, 1)
    assert.equal(record.channel, 'physical')
  })

  test('el papel vale igual que la app: el canal no es la puerta', async ({ assert }) => {
    const digital = { ...FIRMADO, channel: 'digital' as const }
    const record = await makeGate({ consent: digital }).assertGranted(42)
    assert.equal(record.channel, 'digital')
  })

  test('sin firma no se enrola a nadie', async ({ assert }) => {
    await assert.rejects(
      () => makeGate({ consent: null }).assertGranted(42),
      'El colaborador no ha firmado el consentimiento biometrico'
    )
  })

  test('sin documento vigente tampoco, y el motivo es otro', async ({ assert }) => {
    try {
      await makeGate({ documentId: null }).assertGranted(42)
      assert.fail('debio lanzar')
    } catch (error) {
      assert.instanceOf(error, BiometricVaultError)
      // La distincion importa: uno lo arregla RH recabando la firma y el otro
      // lo arregla plataforma publicando el documento.
      assert.equal((error as BiometricVaultError).key, 'consentimiento-sin-documento')
      assert.equal((error as BiometricVaultError).code, 'BVLT.CONSENT.002')
      assert.equal((error as BiometricVaultError).httpStatus, 422)
    }
  })

  test('la consulta sin lanzar distingue los tres casos', async ({ assert }) => {
    const conFirma = await makeGate({ consent: FIRMADO }).find(42)
    const sinFirma = await makeGate({ consent: null }).find(42)
    const sinDocumento = await makeGate({ documentId: null }).find(42)

    assert.equal(conFirma.kind, 'granted')
    assert.equal(sinFirma.kind, 'missing')
    assert.equal(sinDocumento.kind, 'no_document')
  })
})
