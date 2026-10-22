import { BaseSeeder } from '@adonisjs/lucid/seeders'
import TeleworkPhotoNoticeTemplate from '#models/telework_photo_notice_template'
import { sanitizeTeleworkPolicyHtml } from '#helpers/sanitize_telework_policy_content'

/** Versión de la plantilla base del aviso de privacidad (spec §10). */
const TEMPLATE_VERSION = '2026.1'

const TEMPLATE_TITLE = 'Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo'

/**
 * Párrafo PROVISIONAL del aviso (C0129 R11): el texto legal no se inventa, la
 * plantilla nace marcada con su leyenda y su marcador, y el machote definitivo
 * lo entrega asesoría (no es requisito del DoD). El marcador `{{razon_social}}`
 * lo resuelve el servicio al publicar el aviso de cada empresa, con el nombre
 * legal escapado.
 */
const TEMPLATE_CONTENT =
  '<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> ' +
  '{{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las ' +
  'fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de ' +
  'verificación de condiciones del teletrabajo, en los términos de la Ley Federal de ' +
  'Protección de Datos Personales en Posesión de los Particulares.</p>'

/**
 * Semilla idempotente de la plantilla base GLOBAL del aviso de privacidad de la
 * evidencia fotográfica del puesto de trabajo (VLRH-H1791306079310, §10).
 *
 * Idempotencia por `updateOrCreate` sobre la versión: correr el seeder dos veces
 * deja UNA sola fila para `2026.1` y la deja vigente. El título y el contenido
 * se guardan SANEADOS con `sanitizeTeleworkPolicyHtml` (misma whitelist de Quill
 * que usa el BO): el texto es dato, pero nunca entra crudo a la base.
 *
 * Solo se toca la plantilla —global y de plataforma—: ninguna empresa, ningún
 * aviso y ningún acuse se siembran aquí.
 */
export default class extends BaseSeeder {
  async run() {
    await TeleworkPhotoNoticeTemplate.updateOrCreate(
      { teleworkPhotoNoticeTemplateVersion: TEMPLATE_VERSION },
      {
        teleworkPhotoNoticeTemplateTitle: sanitizeTeleworkPolicyHtml(TEMPLATE_TITLE),
        teleworkPhotoNoticeTemplateContent: sanitizeTeleworkPolicyHtml(TEMPLATE_CONTENT),
        teleworkPhotoNoticeTemplateIsCurrent: true,
      }
    )
  }
}
