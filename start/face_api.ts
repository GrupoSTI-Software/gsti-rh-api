import * as faceapi from 'face-api.js'
import canvas from 'canvas'
import path from 'node:path'
import fs from 'node:fs'

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })

const MODEL_PATH = path.join(process.cwd(), 'models')
const REFERENCE_IMG = path.join(process.cwd(), 'reference.jpeg')
export let referenceDescriptor: Float32Array | null = null

export async function loadFaceApi() {
  //console.log('⏳ Cargando modelos de FaceAPI...')

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH)
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH)
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH)

  //console.log('✅ Modelos cargados')

  if (fs.existsSync(REFERENCE_IMG)) {
    const img = await canvas.loadImage(REFERENCE_IMG)
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor()

    if (detection) {
      referenceDescriptor = detection.descriptor
      //console.log('✅ Imagen de referencia lista')
    } else {
      console.warn('⚠️ No se detectó rostro en la imagen de referencia')
    }
  } else {
    console.warn('⚠️ No se encontró reference.jpg en la raíz del proyecto')
  }
}
