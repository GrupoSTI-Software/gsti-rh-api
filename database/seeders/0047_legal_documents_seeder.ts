import { BaseSeeder } from '@adonisjs/lucid/seeders'
import LegalDocument from '../../app/models/legal_document.js'
import LegalDocumentService from '../../app/modules/legal-documents/legal_document.service.js'
import type { LegalDocumentType, LegalDocumentContent } from '../../app/models/legal_document.js'

/**
 * Contenido legal con soporte en la LFPDPPP vigente (DOF 20-03-2025, en vigor
 * 21-03-2025): datos biométricos como datos sensibles con consentimiento
 * expreso, aviso de privacidad con los elementos del art. 27 y autoridad
 * garante Secretaría de Anticorrupción y Buen Gobierno. Auditado contra el
 * código (2026-07-30): solo se afirman comportamientos verificados del
 * sistema; la eliminación de biométricos y la supresión tras plazos se
 * describen como obligaciones del responsable, no como automatismos; el
 * cifrado del template biométrico está verificado en employee_biometric.ts
 * (AES-256-CBC prepare/consume, USRH1782717630568 completada S27). El texto está
 * adaptado a las funcionalidades reales de Valanserh: asistencia con
 * biométricos (huella y rostro), zonas de registro con geolocalización,
 * expedientes laborales, vacaciones e incapacidades, cumplimiento
 * NOM-035/REPSE y app del empleado.
 *
 * Versionado: cada tipo publica su versión vigente vía
 * `LegalDocumentService.publishVersion` (transaccional, marca is_current y
 * respeta el índice único `(type, version)`); publicar una versión nueva
 * re-dispara la aceptación versionada de los usuarios (comportamiento
 * esperado del EPIC-08-09).
 */
const SEED_DOCUMENTS: Array<{
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
}> = [
  {
    type: 'terms_conditions',
    version: '2.0',
    content: {
      es:
        '<h1>Términos y condiciones de uso</h1>' +
        '<p>El presente documento regula el uso de la plataforma Valanserh (la "Plataforma"), un sistema de gestión de recursos humanos que comprende control de asistencia, administración de turnos y vacaciones, expedientes laborales, gestión de incapacidades, evaluaciones y funcionalidades de cumplimiento normativo (NOM-035-STPS-2018, REPSE y disposiciones de la Ley Federal del Trabajo). Al crear una cuenta o utilizar la Plataforma, la organización contratante (el "Cliente") y sus usuarios aceptan estos términos.</p>' +
        '<p><strong>Licencia de uso.</strong> El Cliente recibe una licencia limitada, no exclusiva e intransferible para usar la Plataforma durante la vigencia de su contratación, exclusivamente para la gestión de su personal. La Plataforma, su código, diseño y marcas son propiedad de su titular; ningún contenido de este documento transfiere derechos de propiedad intelectual al Cliente.</p>' +
        '<p><strong>Cuentas y responsabilidad.</strong> El Cliente es responsable de la veracidad de la información que registra, de administrar los accesos de sus usuarios y de mantener la confidencialidad de sus credenciales. Las acciones realizadas desde una cuenta se atribuyen a su titular. El Cliente se obliga a usar la Plataforma conforme a la legislación laboral y de protección de datos aplicable a su operación.</p>' +
        '<p><strong>Tratamiento de datos personales.</strong> Respecto de los datos personales de los empleados del Cliente, el Cliente actúa como responsable del tratamiento y la Plataforma actúa como encargada, tratando los datos únicamente por cuenta y bajo las instrucciones del Cliente, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y al aviso de privacidad disponible en la Plataforma. El tratamiento de datos biométricos se rige además por el consentimiento específico correspondiente.</p>' +
        '<p><strong>Disponibilidad y soporte.</strong> La Plataforma se presta bajo un esquema de mejora continua. Se procurará la máxima disponibilidad del servicio, sin que puedan garantizarse periodos ininterrumpidos; los mantenimientos programados se notificarán con anticipación razonable.</p>' +
        '<p><strong>Limitación de responsabilidad.</strong> La Plataforma es una herramienta de gestión: las decisiones laborales, disciplinarias y de nómina que el Cliente tome con apoyo de la información del sistema son responsabilidad exclusiva del Cliente. La responsabilidad total del prestador se limita a lo pactado en el contrato de servicio suscrito.</p>' +
        '<p><strong>Prevalencia y legislación aplicable.</strong> En caso de conflicto entre estos términos y el contrato de servicio suscrito con el Cliente, prevalece el contrato. Estos términos se rigen por las leyes de los Estados Unidos Mexicanos y cualquier controversia se someterá a los tribunales competentes conforme al contrato de servicio.</p>',
      en:
        '<h1>Terms and Conditions of Use</h1>' +
        '<p>This document governs the use of the Valanserh platform (the "Platform"), a human resources management system covering attendance control, shift and vacation management, employee records, disability leave management, assessments and regulatory compliance features under Mexican labor law. By creating an account or using the Platform, the contracting organization (the "Client") and its users accept these terms.</p>' +
        '<p><strong>License.</strong> The Client receives a limited, non-exclusive, non-transferable license to use the Platform during the term of its agreement, solely for managing its own workforce. The Platform, its code, design and trademarks remain the property of their owner; nothing in this document transfers intellectual property rights to the Client.</p>' +
        '<p><strong>Accounts and responsibility.</strong> The Client is responsible for the accuracy of the information it records, for managing its users’ access and for keeping credentials confidential. Actions performed from an account are attributed to its holder. The Client agrees to use the Platform in accordance with the labor and data protection laws applicable to its operation.</p>' +
        '<p><strong>Personal data processing.</strong> With respect to the personal data of the Client’s employees, the Client acts as data controller and the Platform acts as data processor, processing data solely on behalf of and under the instructions of the Client, in accordance with the Mexican Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP) and the privacy notice available in the Platform. Biometric data processing is additionally governed by the corresponding specific consent.</p>' +
        '<p><strong>Availability and support.</strong> The Platform is provided under a continuous improvement scheme. Maximum service availability will be pursued, although uninterrupted periods cannot be guaranteed; scheduled maintenance will be notified with reasonable notice.</p>' +
        '<p><strong>Limitation of liability.</strong> The Platform is a management tool: labor, disciplinary and payroll decisions made by the Client with the support of system information are the Client’s sole responsibility. The provider’s total liability is limited to what is agreed in the executed service agreement.</p>' +
        '<p><strong>Precedence and governing law.</strong> In the event of any conflict between these terms and the service agreement executed with the Client, the agreement shall prevail. These terms are governed by the laws of the United Mexican States and any dispute shall be submitted to the competent courts as set forth in the service agreement.</p>',
    },
  },
  {
    type: 'privacy_notice',
    version: '2.0',
    content: {
      es:
        '<h1>Aviso de privacidad</h1>' +
        '<p><strong>Responsable y encargado.</strong> El responsable del tratamiento de los datos personales de los empleados es la organización empleadora que contrata la plataforma Valanserh (el "Responsable"). Valanserh actúa como encargado: trata los datos únicamente por cuenta del Responsable y conforme a sus instrucciones, en términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP, en vigor desde el 21 de marzo de 2025).</p>' +
        '<p><strong>Datos que se tratan.</strong> Datos de identificación y contacto (nombre, CURP, RFC, NSS, domicilio, teléfono, correo, fotografía); datos laborales (puesto, departamento, sucursal, turnos, asistencia, vacaciones, expediente y documentos); datos patrimoniales vinculados a la relación laboral (información de nómina y cuenta de depósito); y datos <strong>sensibles</strong>: datos de salud (incapacidades, periodos de lactancia y cuestionarios NOM-035) y datos biométricos (plantillas de huella dactilar y de rostro), estos últimos sujetos a consentimiento expreso mediante el documento de consentimiento biométrico.</p>' +
        '<p><strong>Finalidades primarias.</strong> Registro y control de asistencia (incluida, cuando el Responsable la habilita, la verificación del punto de registro); administración de turnos, vacaciones, incapacidades y expedientes; gestión de evaluaciones y desarrollo; cumplimiento de obligaciones laborales y normativas del Responsable (Ley Federal del Trabajo, NOM-035-STPS-2018, REPSE y obligaciones fiscales y de seguridad social); y atención de solicitudes del propio titular.</p>' +
        '<p><strong>Finalidades secundarias.</strong> Estadística y mejora del servicio con información disociada. El titular puede oponerse a estas finalidades sin que ello afecte la relación laboral.</p>' +
        '<p><strong>Transferencias.</strong> Los datos no se venden ni se ceden a terceros. Solo se comunican cuando exista obligación legal (autoridades laborales, fiscales o de seguridad social) o cuando el Responsable lo instruya dentro de las finalidades descritas.</p>' +
        '<p><strong>Derechos ARCO y revocación.</strong> El titular puede ejercer sus derechos de acceso, rectificación, cancelación y oposición, así como revocar su consentimiento, ante el Responsable (su empleador), a través de los canales que éste designe. La Plataforma provee al Responsable los medios técnicos para atender dichas solicitudes.</p>' +
        '<p><strong>Conservación y seguridad.</strong> Los datos se conservan durante la relación laboral y los plazos que exigen las leyes laborales y fiscales; concluidos dichos plazos, el Responsable determina su supresión o disociación conforme a sus políticas y a la ley. Se aplican medidas de seguridad administrativas, técnicas y físicas, incluidos el cifrado de los datos personales que la plataforma clasifica como sensibles, el enmascarado en consultas, el registro de accesos a información sensible y el control de accesos por roles.</p>' +
        '<p><strong>Autoridad y cambios.</strong> La autoridad garante en materia de protección de datos de particulares es la Secretaría de Anticorrupción y Buen Gobierno. Cualquier cambio a este aviso se publicará en la Plataforma y, cuando implique nuevas finalidades, se recabará nuevamente el consentimiento.</p>',
      en:
        '<h1>Privacy Notice</h1>' +
        '<p><strong>Controller and processor.</strong> The controller of employees’ personal data is the employing organization that contracts the Valanserh platform (the "Controller"). Valanserh acts as processor: it processes data solely on behalf of the Controller and under its instructions, pursuant to the Mexican Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP, in force since March 21, 2025).</p>' +
        '<p><strong>Data processed.</strong> Identification and contact data (name, CURP, RFC, social security number, address, phone, email, photograph); employment data (position, department, branch, shifts, attendance, vacations, records and documents); asset-related data linked to the employment relationship (payroll and deposit account information); and <strong>sensitive</strong> data: health data (disability leaves, lactation periods and NOM-035 questionnaires) and biometric data (fingerprint and face templates), the latter subject to express consent through the biometric consent document.</p>' +
        '<p><strong>Primary purposes.</strong> Attendance recording and control (including, when enabled by the Controller, verification of the check-in point); management of shifts, vacations, disability leaves and records; assessments and development; compliance with the Controller’s labor and regulatory obligations under Mexican law; and handling of the data subject’s own requests.</p>' +
        '<p><strong>Secondary purposes.</strong> Statistics and service improvement using de-identified information. Data subjects may object to these purposes without affecting their employment relationship.</p>' +
        '<p><strong>Transfers.</strong> Data is neither sold nor disclosed to third parties. It is only communicated where a legal obligation exists (labor, tax or social security authorities) or as instructed by the Controller within the purposes described.</p>' +
        '<p><strong>ARCO rights and consent withdrawal.</strong> Data subjects may exercise their rights of access, rectification, cancellation and objection, and withdraw consent, before the Controller (their employer) through the channels it designates. The Platform provides the Controller the technical means to handle such requests.</p>' +
        '<p><strong>Retention and security.</strong> Data is kept during the employment relationship and for the retention periods required by labor and tax laws; upon expiration, the Controller determines its deletion or de-identification in accordance with its policies and the law. Administrative, technical and physical security measures are applied, including encryption of the personal data classified as sensitive by the platform, masking in queries, logging of access to sensitive information, and role-based access control.</p>' +
        '<p><strong>Authority and changes.</strong> The supervisory authority for data protection in the private sector is the Ministry of Anti-Corruption and Good Governance. Changes to this notice will be published in the Platform and, where new purposes are involved, consent will be obtained again.</p>',
    },
  },
  {
    type: 'biometric_consent',
    version: '1.0',
    content: {
      es:
        '<h1>Consentimiento para el tratamiento de datos biométricos</h1>' +
        '<p>De conformidad con la LFPDPPP, los datos biométricos son <strong>datos personales sensibles</strong> y su tratamiento requiere el consentimiento expreso del titular. Este documento recaba dicho consentimiento de forma informada y específica.</p>' +
        '<p><strong>Datos que se recaban.</strong> Plantillas biométricas de huella dactilar y de reconocimiento facial, y la fotografía asociada al perfil del empleado, capturadas en los dispositivos de registro (checadores) habilitados por el empleador.</p>' +
        '<p><strong>Finalidad exclusiva.</strong> Registrar la identidad del empleado en los eventos de asistencia (entradas y salidas) y el control de acceso en los puntos que el empleador determine. Los datos biométricos no se utilizan para ninguna otra finalidad, no se venden y no se comparten con terceros salvo obligación legal.</p>' +
        '<p><strong>Voluntariedad y alternativas.</strong> El otorgamiento de este consentimiento es libre. Si el titular no desea registrar sus biométricos o revoca su consentimiento, el empleador debe habilitar un medio alterno de registro de asistencia, sin que la negativa afecte por sí misma la relación laboral.</p>' +
        '<p><strong>Seguridad y conservación.</strong> Las plantillas biométricas se almacenan cifradas (AES-256) y con acceso restringido por roles, y se tratan únicamente en los componentes necesarios para el registro de asistencia y control de acceso. Se conservan durante la vigencia de la relación laboral o hasta la revocación del consentimiento; al concluir cualquiera de las dos, el empleador debe gestionar su eliminación de la plataforma y de los dispositivos de registro mediante las herramientas de administración disponibles.</p>' +
        '<p><strong>Revocación.</strong> El titular puede revocar este consentimiento en cualquier momento ante su empleador, a través de los canales que éste designe. La revocación surte efectos hacia el futuro y no afecta la licitud del tratamiento previo.</p>',
      en:
        '<h1>Consent for the Processing of Biometric Data</h1>' +
        '<p>Under the LFPDPPP, biometric data is <strong>sensitive personal data</strong> and its processing requires the data subject’s express consent. This document collects such consent in an informed and specific manner.</p>' +
        '<p><strong>Data collected.</strong> Fingerprint and facial recognition biometric templates, and the photograph associated with the employee profile, captured on the attendance devices enabled by the employer.</p>' +
        '<p><strong>Exclusive purpose.</strong> To verify the employee’s identity in attendance events (check-ins and check-outs) and access control at the points determined by the employer. Biometric data is not used for any other purpose, is not sold, and is not shared with third parties except under legal obligation.</p>' +
        '<p><strong>Voluntary nature and alternatives.</strong> Granting this consent is free. If the data subject does not wish to enroll their biometrics or withdraws consent, the employer must enable an alternative means of attendance recording, and the refusal shall not by itself affect the employment relationship.</p>' +
        '<p><strong>Security and retention.</strong> Biometric templates are stored encrypted (AES-256) and with role-restricted access, and are processed only in the components required for attendance recording and access control. They are kept during the employment relationship or until consent is withdrawn; upon either event, the employer must manage their deletion from the platform and from attendance devices using the available administration tools.</p>' +
        '<p><strong>Withdrawal.</strong> The data subject may withdraw this consent at any time before their employer, through the channels the employer designates. Withdrawal takes effect prospectively and does not affect the lawfulness of prior processing.</p>',
    },
  },
]

/**
 * Publica la versión vigente de cada documento legal si aún no existe
 * (evita duplicar y violar el índice único `(type, version)`).
 */
export default class extends BaseSeeder {
  async run() {
    const service = new LegalDocumentService()

    for (const doc of SEED_DOCUMENTS) {
      const alreadySeeded = await LegalDocument.query()
        .where('legal_document_type', doc.type)
        .where('legal_document_version', doc.version)
        .first()

      if (alreadySeeded) {
        continue
      }

      await service.publishVersion({
        type: doc.type,
        version: doc.version,
        content: doc.content,
        publishedByUserId: null,
      })
    }
  }
}
