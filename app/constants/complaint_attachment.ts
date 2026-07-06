/** Tipos MIME permitidos para adjuntos del buzón (validación por contenido real). */
export const COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES = ['application/pdf'] as const

/** MIME de audio MP3 (se sanitizan con node-id3). */
export const COMPLAINT_ATTACHMENT_MP3_MIMES = ['audio/mpeg', 'audio/mp3'] as const

/**
 * MIME del audio grabado desde la app (AAC en contenedor m4a). file-type puede
 * reportarlo como audio/x-m4a o audio/mp4; audio/aac cubre el stream ADTS.
 * OJO: verificar en dispositivo real qué MIME reporta file-type@16 para lo que
 * produce el grabador (paquete `record`) y ajustar esta lista si hace falta.
 * Se excluye adrede `video/mp4` para no abrir la puerta a video.
 */
export const COMPLAINT_ATTACHMENT_RECORDED_AUDIO_MIMES = [
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES = [
  ...COMPLAINT_ATTACHMENT_MP3_MIMES,
  ...COMPLAINT_ATTACHMENT_RECORDED_AUDIO_MIMES,
] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_MIMES = [
  ...COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES,
  ...COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES,
  ...COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES,
] as const

export type ComplaintAttachmentAllowedMime = (typeof COMPLAINT_ATTACHMENT_ALLOWED_MIMES)[number]

/**
 * Extensiones de cliente permitidas (solo evidencia: imagen, PDF o audio).
 * La extensión final del nombre original debe estar en esta lista.
 */
export const COMPLAINT_ATTACHMENT_ALLOWED_CLIENT_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'pdf',
  'mp3',
  'mpeg',
  'm4a',
  'aac',
] as const

/**
 * Extensiones de código, scripts, ejecutables e imágenes de disco prohibidas.
 * Si cualquier segmento del nombre termina en una de estas extensiones → 422.
 */
export const COMPLAINT_ATTACHMENT_BLOCKED_EXTENSIONS = [
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
  'c',
  'h',
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
  'r',
  'm',
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
  // Ejecutables / imágenes de disco / binarios
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

/** Extensión de almacenamiento según MIME real detectado (no la del cliente). */
export const COMPLAINT_ATTACHMENT_STORAGE_EXTENSION_BY_MIME: Record<
  ComplaintAttachmentAllowedMime,
  string
> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
}

/** Tamaño máximo por archivo: 10 MB. */
export const COMPLAINT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Carpeta lógica en S3 bajo `{AWS_ROOT_PATH}/files/...`. */
export const COMPLAINT_ATTACHMENT_S3_FOLDER = 'complaint-attachments'

/** Vigencia de la URL firmada de descarga (5 minutos). */
export const COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60
