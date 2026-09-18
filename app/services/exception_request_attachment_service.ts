import type { MultipartFile } from '@adonisjs/core/bodyparser'
import ExceptionRequestAttachment from '#models/exception_request_attachment'
import FileIntakeService from '#services/file_intake_service'
import UploadService from '#services/upload_service'

/** Largo máximo del nombre visible; la columna admite 255. */
const MAX_DISPLAY_NAME_LENGTH = 200

/** Nombre de reserva cuando el cliente no manda uno usable. */
const FALLBACK_DISPLAY_NAME = 'comprobante'

/** Carpeta del bucket donde viven los comprobantes de solicitudes. */
const ATTACHMENT_FOLDER = 'exception-requests'

/** Perfil de intake: comprobantes en PDF o foto, nunca ejecutables. */
const ATTACHMENT_INTAKE_PROFILE = 'evidence-document' as const

/** Adjunto tal como lo consume la UI: sin la clave de almacenamiento. */
export interface ExceptionRequestAttachmentRow {
  id: number
  originalName: string
  mime: string
  sizeBytes: number
  createdAt: string | null
}

/**
 * Comprobantes de una solicitud de permiso.
 *
 * La clave del bucket la arma y la resuelve el servidor: el cliente solo maneja
 * el id del adjunto. Es lo que impide que alguien pida un archivo ajeno
 * escribiendo una ruta a mano.
 */
export default class ExceptionRequestAttachmentService {
  private readonly fileIntake = new FileIntakeService()

  /**
   * Guarda un comprobante de la solicitud.
   *
   * @param params - Solicitud, empresa dueña, archivo y quién lo sube.
   * @returns El adjunto listo para la UI.
   * @throws Cuando el archivo no pasa el intake o el bucket rechaza la escritura.
   */
  async upload(params: {
    exceptionRequestId: number
    businessUnitId: number
    file: MultipartFile
    uploadedByUserId: number | null
  }): Promise<ExceptionRequestAttachmentRow> {
    const intake = await this.fileIntake.accept(params.file, ATTACHMENT_INTAKE_PROFILE)

    // La ruta incluye la empresa y la solicitud: dos objetos de empresas
    // distintas nunca comparten prefijo, ni siquiera por colisión de nombres.
    const relativeKey = `${ATTACHMENT_FOLDER}/${params.businessUnitId}/${params.exceptionRequestId}/${intake.storageFileName}`

    const storageKey = await new UploadService().uploadPrivateBuffer(
      relativeKey,
      intake.buffer,
      intake.mimeType
    )

    if (!storageKey) {
      throw new Error('ExceptionRequestAttachmentService: el bucket rechazo la escritura')
    }

    const attachment = await ExceptionRequestAttachment.create({
      exceptionRequestId: params.exceptionRequestId,
      businessUnitId: params.businessUnitId,
      attachmentStorageKey: storageKey,
      attachmentOriginalName: this.displayName(params.file.clientName),
      attachmentMime: intake.mimeType,
      attachmentSizeBytes: intake.buffer.length,
      uploadedByUserId: params.uploadedByUserId,
    })

    return this.toRow(attachment)
  }

  /**
   * Adjuntos vivos de una solicitud dentro de la empresa activa.
   *
   * @param exceptionRequestId - Solicitud consultada.
   * @param businessUnitId - Empresa activa.
   * @returns Los adjuntos, del más reciente al más antiguo.
   */
  async list(
    exceptionRequestId: number,
    businessUnitId: number
  ): Promise<ExceptionRequestAttachmentRow[]> {
    const rows = await ExceptionRequestAttachment.query()
      .where('exception_request_id', exceptionRequestId)
      .where('business_unit_id', businessUnitId)
      .whereNull('exception_request_attachment_deleted_at')
      .orderBy('exception_request_attachment_id', 'desc')

    return rows.map((row) => this.toRow(row))
  }

  /**
   * Adjunto concreto, si pertenece a la solicitud y a la empresa indicadas.
   *
   * Las tres condiciones viajan en la misma consulta a propósito: pedir un id de
   * otra empresa devuelve `null`, no un archivo.
   *
   * @param params - Adjunto, solicitud y empresa.
   * @returns El registro, o `null` si no califica.
   */
  async findInScope(params: {
    attachmentId: number
    exceptionRequestId: number
    businessUnitId: number
  }): Promise<ExceptionRequestAttachment | null> {
    return ExceptionRequestAttachment.query()
      .where('exception_request_attachment_id', params.attachmentId)
      .where('exception_request_id', params.exceptionRequestId)
      .where('business_unit_id', params.businessUnitId)
      .whereNull('exception_request_attachment_deleted_at')
      .first()
  }

  /**
   * Nombre con el que la UI presenta el archivo.
   *
   * Es el del usuario, porque "Incapacidad-IMSS.pdf" le dice algo y el nombre de
   * almacenamiento —un UUID— no. Se limpia de separadores de ruta y caracteres
   * de control: nunca decide dónde se guarda nada (eso lo hace
   * `buildStorageFileName`), pero un nombre con `../` en pantalla es una
   * invitación a que alguien lo reutilice como ruta más adelante.
   */
  private displayName(clientName?: string): string {
    const limpio = `${clientName ?? ''}`
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/]/g, '-')
      .trim()
      .slice(0, MAX_DISPLAY_NAME_LENGTH)

    return limpio.length > 0 ? limpio : FALLBACK_DISPLAY_NAME
  }

  /** Forma que consume la UI: sin la clave del bucket. */
  private toRow(attachment: ExceptionRequestAttachment): ExceptionRequestAttachmentRow {
    return {
      id: attachment.exceptionRequestAttachmentId,
      originalName: attachment.attachmentOriginalName,
      mime: attachment.attachmentMime,
      sizeBytes: Number(attachment.attachmentSizeBytes),
      createdAt: attachment.exceptionRequestAttachmentCreatedAt?.toISO() ?? null,
    }
  }
}
