/** Tipos MIME permitidos para adjuntos del buzón (validación por contenido real). */
export const COMPLAINT_ATTACHMENT_ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_PDF_MIMES = ['application/pdf'] as const

export const COMPLAINT_ATTACHMENT_ALLOWED_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3'] as const

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
}

/** Tamaño máximo por archivo: 10 MB. */
export const COMPLAINT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** Carpeta lógica en S3 bajo `{AWS_ROOT_PATH}/files/...`. */
export const COMPLAINT_ATTACHMENT_S3_FOLDER = 'complaint-attachments'

/** Vigencia de la URL firmada de descarga (5 minutos). */
export const COMPLAINT_ATTACHMENT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60
