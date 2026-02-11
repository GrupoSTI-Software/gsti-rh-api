/**
 * Error codes catalog for System Settings
 * Format: SYS.CNFG.VAL.XXX
 */
export const SYSTEM_SETTING_ERROR_CODES = {
  // Image resolution errors
  INVALID_RESOLUTION: {
    code: 'SYS.CNFG.VAL.010',
    message: 'Invalid image resolution',
    description:
      'The uploaded image for the employee application icon does not have ' +
      'the appropriate resolution. The appropriate resolution must be 512 ' +
      'pixels wide by 512 pixels in total.',
  },

  // Image format errors (transparency/background)
  INVALID_FORMAT_TRANSPARENCY: {
    code: 'SYS.CNFG.VAL.011',
    message: 'Invalid image format',
    description:
      'The uploaded image for the employee application icon does not have ' +
      'the correct format. The PNG must not have a transparent background ' +
      'and preferably should be white.',
  },

  // File extension errors
  INVALID_FILE_EXTENSION: {
    code: 'SYS.CNFG.VAL.012',
    message: 'Invalid file format',
    description:
      'The uploaded image for the employee application icon does not have ' +
      'the correct file format. The system requires an exclusively .png ' +
      'format. The system will reject formats such as .jpg, .jpeg, .webp ' +
      'or .psd.',
  },

  // File not found errors
  FILE_NOT_FOUND: {
    code: 'SYS.CNFG.VAL.013',
    message: 'File not provided',
    description:
      'The employee application icon file was not provided in the request.',
  },

  // Image reading errors
  IMAGE_READ_ERROR: {
    code: 'SYS.CNFG.PRSS.014',
    message: 'Error reading image',
    description:
      'An error occurred while trying to read or process the uploaded image ' +
      'file. This can happen when: the file is corrupted or incomplete, the ' +
      'file system cannot access the temporary file, the PNG structure is ' +
      'malformed, or there are memory/processing errors. The file may need ' +
      'to be re-uploaded or verified for integrity.',
  },

  // Image dimensions read error
  DIMENSIONS_READ_ERROR: {
    code: 'SYS.CNFG.PRSS.015',
    message: 'Could not read image dimensions',
    description:
      'The system successfully read the image file but could not extract ' +
      'its width and height dimensions. This typically occurs when: the PNG ' +
      'metadata is missing or corrupted, the image header is incomplete, the ' +
      'file is truncated, or the image format is not standard PNG. The image ' +
      'should be re-saved in a standard image editor.',
  },

  // File upload to S3 errors
  UPLOAD_ERROR: {
    code: 'SYS.CNFG.PRSS.016',
    message: 'Error uploading file',
    description:
      'The image passed all validations but failed to upload to the cloud ' +
      'storage service (S3/DigitalOcean Spaces). This can occur due to: ' +
      'network connectivity issues, storage service unavailability, incorrect ' +
      'AWS credentials or permissions, bucket configuration errors, or storage ' +
      'quota exceeded. Please verify network connection and try again.',
  },

  // File deletion from S3 errors
  DELETE_ERROR: {
    code: 'SYS.CNFG.PRSS.017',
    message: 'Error deleting previous file',
    description:
      'During an update operation, the new image was successfully uploaded ' +
      'but the system could not delete the previous/old image file from ' +
      'storage. This is a non-critical error - the new icon is active. This ' +
      'can happen when: the previous file was already deleted, file path is ' +
      'incorrect, storage service is temporarily unavailable, or insufficient ' +
      'delete permissions. The old file may need manual cleanup.',
  },

  // File size errors
  FILE_TOO_LARGE: {
    code: 'SYS.CNFG.PRSS.018',
    message: 'File size too large',
    description:
      'The uploaded image file exceeds the maximum allowed file size limit. ' +
      'This can occur when: the image is uncompressed or high-resolution, the ' +
      'file contains embedded metadata or thumbnails, or server upload limits ' +
      'are exceeded. The image should be compressed, optimized, or reduced in ' +
      'size before uploading. Recommended maximum size: 2-5MB for 512x512 PNG.',
  },
} as const

export type SystemSettingErrorCode = keyof typeof SYSTEM_SETTING_ERROR_CODES

