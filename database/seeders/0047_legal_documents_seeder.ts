import { BaseSeeder } from '@adonisjs/lucid/seeders'
import LegalDocument from '../../app/models/legal_document.js'
import LegalDocumentService from '../../app/modules/legal-documents/legal_document.service.js'
import type { LegalDocumentType, LegalDocumentContent } from '../../app/models/legal_document.js'

const VERSION = '1.0'

/**
 * Texto migrado de `gsti-rh-bo/pages/onboarding/domain/locales/onboarding.es.json`
 * y `onboarding.en.json`.
 */
const SEED_DOCUMENTS: Array<{ type: LegalDocumentType; content: LegalDocumentContent }> = [
  {
    type: 'terms_conditions',
    content: {
      es:
        '<h1>Términos y condiciones de uso</h1>' +
        '<p>Al usar esta plataforma aceptas que los datos capturados serán utilizados para la gestión ' +
        'de recursos humanos de tu organización, bajo las disposiciones de la Ley Federal de Protección ' +
        'de Datos Personales en Posesión de los Particulares (LFPDPPP). La plataforma actúa como ' +
        'encargada del tratamiento de datos personales conforme al contrato de servicio suscrito. ' +
        'Puedes ejercer tus derechos ARCO mediante los canales indicados en el aviso de privacidad.</p>',
      en:
        '<h1>Terms and Conditions of Use</h1>' +
        '<p>By using this platform you agree that the data captured will be used for human resources ' +
        'management of your organization, in compliance with applicable data protection laws. The ' +
        'platform acts as data processor in accordance with the signed service agreement. You may ' +
        'exercise your rights through the channels indicated in the privacy notice.</p>',
    },
  },
  {
    type: 'privacy_notice',
    content: {
      es:
        '<h1>Aviso de privacidad</h1>' +
        '<p>El responsable del tratamiento de datos personales es tu organización. Los datos personales ' +
        'de tus empleados se recaban para fines de administración laboral: control de asistencia, ' +
        'gestión de vacaciones, expedientes y nómina. No se ceden datos a terceros salvo obligación ' +
        'legal. Puedes consultar el aviso de privacidad completo en la sección de configuración del ' +
        'sistema.</p>',
      en:
        '<h1>Privacy Notice</h1>' +
        '<p>Your organization is the data controller. Personal data of your employees is collected for ' +
        'labor administration purposes: attendance control, vacation management, employee records, ' +
        'and payroll. No data is shared with third parties except as required by law. You can view ' +
        'the full privacy notice in the system settings section.</p>',
    },
  },
]

/**
 * Siembra la versión "1.0" vigente de aviso de privacidad y términos y condiciones
 * (regla de negocio 4). `biometric_consent` NO se siembra: nace declarado como tipo
 * de documento legal sin ninguna versión vigente; su primera versión la publica
 * GSTI desde la gestión (ESB-08-09-03-01) cuando la asesora legal entregue el texto.
 *
 * Usa `LegalDocumentService.publishVersion` (misma operación transaccional que
 * consumirá la gestión) para dejar cada tipo con exactamente una fila vigente.
 * Idempotente: si la versión "1.0" ya existe para un tipo, no la vuelve a publicar
 * (evita duplicar y violar el índice único `(type, version)`).
 */
export default class extends BaseSeeder {
  async run() {
    const service = new LegalDocumentService()

    for (const doc of SEED_DOCUMENTS) {
      const alreadySeeded = await LegalDocument.query()
        .where('legal_document_type', doc.type)
        .where('legal_document_version', VERSION)
        .first()

      if (alreadySeeded) {
        continue
      }

      await service.publishVersion({
        type: doc.type,
        version: VERSION,
        content: doc.content,
        publishedByUserId: null,
      })
    }
  }
}
