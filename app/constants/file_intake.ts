/**
 * Politica unica de entrada de archivos del sistema.
 *
 * Todo archivo que llega por multipart pasa por un perfil de esta tabla antes
 * de tocar el bucket. El perfil declara que extensiones acepta del cliente, que
 * MIME real (por magic bytes) tolera, cuanto puede pesar, en que se transforma
 * y si el objeto resultante es publico.
 *
 * Nada de esto se apoya en lo que declara el cliente: la extension del nombre y
 * el `Content-Type` del multipart son pistas que se validan, nunca la fuente de
 * la decision.
 */

/** Imagenes: unicos formatos raster que entran al sistema. Sin SVG (es XML ejecutable). */
export const FILE_INTAKE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const FILE_INTAKE_PDF_MIMES = ['application/pdf'] as const

/** MP3: se limpian tags ID3. */
export const FILE_INTAKE_MP3_MIMES = ['audio/mpeg', 'audio/mp3'] as const

/**
 * Audio grabado desde la app (AAC en contenedor m4a). `file-type` puede
 * reportarlo como audio/x-m4a o audio/mp4; audio/aac cubre el stream ADTS.
 * Se excluye adrede `video/mp4` para no abrir la puerta a video.
 */
export const FILE_INTAKE_RECORDED_AUDIO_MIMES = ['audio/x-m4a', 'audio/mp4', 'audio/aac'] as const

export const FILE_INTAKE_AUDIO_MIMES = [
  ...FILE_INTAKE_MP3_MIMES,
  ...FILE_INTAKE_RECORDED_AUDIO_MIMES,
] as const

/**
 * Hoja de calculo OOXML. `file-type` distingue un .xlsx real de un ZIP
 * renombrado: un ZIP generico se reporta como `application/zip` y no entra.
 */
export const FILE_INTAKE_SPREADSHEET_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

export const FILE_INTAKE_ALLOWED_MIMES = [
  ...FILE_INTAKE_IMAGE_MIMES,
  ...FILE_INTAKE_PDF_MIMES,
  ...FILE_INTAKE_AUDIO_MIMES,
  ...FILE_INTAKE_SPREADSHEET_MIMES,
] as const

export type FileIntakeMime = (typeof FILE_INTAKE_ALLOWED_MIMES)[number]

/** Formatos a los que un perfil puede re-encodear una imagen. */
export type FileIntakeImageOutputMime = Extract<FileIntakeMime, 'image/jpeg' | 'image/png'>

/**
 * Que hace un perfil con una imagen.
 * - `reject`: el perfil no acepta imagenes.
 * - `preserve`: re-encodea manteniendo el formato de origen.
 * - `convert`: re-encodea al formato declarado, sea cual sea el de origen.
 *
 * En los tres casos que aceptan imagen se re-encodea SIEMPRE: reconstruir el
 * pixel es lo que descarta EXIF y cualquier payload pegado despues del fin del
 * contenedor. El formato de salida es una decision de compatibilidad, no de
 * seguridad.
 */
export type FileIntakeImagePolicy =
  | { readonly kind: 'reject' }
  | { readonly kind: 'preserve' }
  | { readonly kind: 'convert'; readonly toMime: FileIntakeImageOutputMime }

/** Calidad de re-encode JPEG. Suficiente para foto de credencial y evidencia. */
export const FILE_INTAKE_JPEG_QUALITY = 82

export interface FileIntakeProfile {
  /** Extensiones que el cliente puede declarar en el nombre del archivo. */
  readonly allowedClientExtensions: readonly string[]
  /** MIME real tolerado, detectado por magic bytes sobre el contenido. */
  readonly allowedMimes: readonly FileIntakeMime[]
  /** Tope por archivo, aplicado antes y despues de transformar. */
  readonly maxBytes: number
  readonly imagePolicy: FileIntakeImagePolicy
  /**
   * `true` solo donde el consumidor no puede autenticarse. Hoy unicamente el
   * branding: el logo viaja como `<img src>` en las plantillas de correo y un
   * cliente de correo no manda cookie ni sobrevive a una URL firmada.
   */
  readonly storesPublicly: boolean
}

export const FILE_INTAKE_PROFILE_NAMES = [
  'pdf-document',
  'evidence-document',
  'employee-record-document',
  'profile-photo',
  'signature',
  'branding-asset',
  'spreadsheet-import',
  'complaint-attachment',
] as const

export type FileIntakeProfileName = (typeof FILE_INTAKE_PROFILE_NAMES)[number]

const MB = 1024 * 1024

export const FILE_INTAKE_PROFILES: Readonly<Record<FileIntakeProfileName, FileIntakeProfile>> = {
  /** Expediente REPSE, documentos de contrato especializado, evidencia de lactancia. */
  'pdf-document': {
    allowedClientExtensions: ['pdf'],
    allowedMimes: FILE_INTAKE_PDF_MIMES,
    maxBytes: 10 * MB,
    imagePolicy: { kind: 'reject' },
    storesPublicly: false,
  },

  /** Evidencias, comprobantes y justificantes: PDF o foto. */
  'evidence-document': {
    allowedClientExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    allowedMimes: [...FILE_INTAKE_PDF_MIMES, ...FILE_INTAKE_IMAGE_MIMES],
    maxBytes: 10 * MB,
    imagePolicy: { kind: 'convert', toMime: 'image/jpeg' },
    storesPublicly: false,
  },

  /** Expediente del empleado y valores de propiedades documentales. */
  'employee-record-document': {
    allowedClientExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    allowedMimes: [...FILE_INTAKE_PDF_MIMES, ...FILE_INTAKE_IMAGE_MIMES],
    maxBytes: 10 * MB,
    imagePolicy: { kind: 'convert', toMime: 'image/jpeg' },
    storesPublicly: false,
  },

  /**
   * Foto de empleado y rostro biometrico. Sale como JPEG: el gafete la pasa por
   * `@napi-rs/canvas`, que si decodifica WebP, pero pdfkit no.
   */
  'profile-photo': {
    allowedClientExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    allowedMimes: FILE_INTAKE_IMAGE_MIMES,
    maxBytes: 2 * MB,
    imagePolicy: { kind: 'convert', toMime: 'image/jpeg' },
    storesPublicly: false,
  },

  /** Firma autografa digitalizada. PNG por la transparencia. */
  'signature': {
    allowedClientExtensions: ['png'],
    allowedMimes: ['image/png'],
    maxBytes: 3 * MB,
    imagePolicy: { kind: 'convert', toMime: 'image/png' },
    storesPublicly: false,
  },

  /**
   * Logo, favicon e icono de aplicacion. Unico perfil publico del sistema.
   * Sale como PNG y no como WebP porque el logo termina en tres consumidores
   * que no lo soportan: `pdfkit` (`position_service`), la imagen embebida del
   * XLSX y Outlook de escritorio, que renderiza el correo con el motor de Word.
   */
  'branding-asset': {
    allowedClientExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    allowedMimes: FILE_INTAKE_IMAGE_MIMES,
    maxBytes: 2 * MB,
    imagePolicy: { kind: 'convert', toMime: 'image/png' },
    storesPublicly: true,
  },

  /**
   * Importadores de Excel. No se persiste en el bucket: se valida para que el
   * parser (`exceljs`) nunca reciba algo que no sea una hoja OOXML real.
   */
  'spreadsheet-import': {
    allowedClientExtensions: ['xlsx'],
    allowedMimes: FILE_INTAKE_SPREADSHEET_MIMES,
    maxBytes: 10 * MB,
    imagePolicy: { kind: 'reject' },
    storesPublicly: false,
  },

  /**
   * Buzon de quejas. Conserva el formato de imagen de origen (comportamiento
   * previo a la unificacion) porque sus adjuntos no alimentan exportables.
   */
  'complaint-attachment': {
    allowedClientExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'mp3', 'mpeg', 'm4a', 'aac'],
    allowedMimes: [
      ...FILE_INTAKE_IMAGE_MIMES,
      ...FILE_INTAKE_PDF_MIMES,
      ...FILE_INTAKE_AUDIO_MIMES,
    ],
    maxBytes: 10 * MB,
    imagePolicy: { kind: 'preserve' },
    storesPublicly: false,
  },
}

/** Extension de almacenamiento segun el MIME REAL de salida, nunca la del cliente. */
export const FILE_INTAKE_STORAGE_EXTENSION_BY_MIME: Readonly<Record<FileIntakeMime, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

/**
 * Extensiones de codigo, scripts, ejecutables, config e imagenes de disco.
 * Se valida CUALQUIER segmento del nombre, no solo el ultimo, para cubrir la
 * doble extension (`factura.php.jpg`).
 *
 * QUEDAN FUERA A PROPOSITO las de una sola letra (`c`, `h`, `m`, `r`). Al
 * mirar todos los segmentos del nombre convertian en "script o ejecutable"
 * documentos legitimos con iniciales: `Perez.J.M.pdf`, `acta.h.pdf`,
 * `CURP.R.pdf`. En un expediente de RH mexicano ese patron es comun, y el
 * riesgo real ya lo cubren dos candados mas duros: la extension final debe
 * pertenecer al perfil y el contenido se valida por magic bytes.
 */
export const FILE_INTAKE_BLOCKED_EXTENSIONS = [
  // Vectores / markup ejecutable
  'svg',
  'svgz',
  // Shell / scripts
  'sh',
  'bash',
  'zsh',
  'fish',
  'ksh',
  'ps1',
  'psm1',
  'bat',
  'cmd',
  'vbs',
  'csh',
  // JavaScript / TypeScript
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  // Python / Ruby / PHP
  'py',
  'pyc',
  'pyo',
  'pyw',
  'rb',
  'php',
  'phtml',
  // JVM / .NET
  'java',
  'class',
  'jar',
  'war',
  'cs',
  'vb',
  // C / C++ / Rust / Go
  'cpp',
  'cc',
  'cxx',
  'hpp',
  'rs',
  'go',
  // Otros lenguajes
  'swift',
  'kt',
  'kts',
  'scala',
  'clj',
  'cljs',
  'lua',
  'pl',
  'pm',
  'mm',
  // SQL / datos / config
  'sql',
  'sqlite',
  'db',
  'json',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  // Web / markup
  'html',
  'htm',
  'xhtml',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'asp',
  'aspx',
  'jsp',
  // Ejecutables / imagenes de disco / binarios
  'iso',
  'exe',
  'dll',
  'bin',
  'dmg',
  'app',
  'deb',
  'rpm',
  'msi',
  'wasm',
  'so',
  'dylib',
  'apk',
  'ipa',
  // Build / infra
  'gradle',
  'cmake',
  'mk',
  'dockerfile',
] as const
