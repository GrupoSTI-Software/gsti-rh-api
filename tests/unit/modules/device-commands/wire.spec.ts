import { test } from '@japa/runner'
import {
  formatDeviceCommand,
  formatWireLine,
} from '#modules/device-commands/wire/adms_command_formatter'
import { parseDeviceCmdBody } from '#modules/device-commands/wire/adms_ack.parser'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import { DeviceCommandError } from '#exceptions/device_command_error'

test.group('Gramatica de comandos del checador', () => {
  test('alta de usuario: PIN en mayusculas y TAB entre campos', ({ assert }) => {
    const line = formatDeviceCommand(DEVICE_COMMAND_KIND.USER_UPSERT, {
      pin: '9999',
      name: 'Juan Perez',
    })
    assert.equal(
      line,
      'DATA UPDATE USERINFO PIN=9999\tName=Juan Perez\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000\tVerify=-1'
    )
  })

  test('el nombre se recorta a 24 caracteres', ({ assert }) => {
    const line = formatDeviceCommand(DEVICE_COMMAND_KIND.USER_UPSERT, {
      pin: '1',
      name: 'Maria Guadalupe de los Angeles Hernandez',
    })
    assert.include(line, 'Name=Maria Guadalupe de los A\t')
    assert.notInclude(line, 'Hernandez')
  })

  test('un nombre con TAB o salto de linea se rechaza: partiria la orden en dos', ({ assert }) => {
    let capturado: unknown = null
    try {
      formatDeviceCommand(DEVICE_COMMAND_KIND.USER_UPSERT, { pin: '1', name: 'Juan\tPerez' })
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, DeviceCommandError)
    assert.equal((capturado as DeviceCommandError).code, 'DCMD.VAL.001')
    assert.throws(() =>
      formatDeviceCommand(DEVICE_COMMAND_KIND.USER_UPSERT, {
        pin: '1',
        name: 'Juan\nDATA DELETE USERINFO PIN=2',
      })
    )
    assert.throws(() =>
      formatDeviceCommand(DEVICE_COMMAND_KIND.USER_DELETE, { pin: '1\r\nCHECK' })
    )
  })

  test('baja de usuario y comprobacion', ({ assert }) => {
    assert.equal(
      formatDeviceCommand(DEVICE_COMMAND_KIND.USER_DELETE, { pin: '9999' }),
      'DATA DELETE USERINFO PIN=9999'
    )
    assert.equal(formatDeviceCommand(DEVICE_COMMAND_KIND.CHECK, {}), 'CHECK')
  })

  test('enrolamiento de huella con la forma validada', ({ assert }) => {
    assert.equal(
      formatDeviceCommand(DEVICE_COMMAND_KIND.ENROLL_FP, { pin: '9995', fid: 7 }),
      'ENROLL_FP PIN=9995\tFID=7\tRETRY=3\tOVERWRITE=1'
    )
  })

  test('escritura de biometrico: Pin en minusculas y MajorVer del template', ({ assert }) => {
    const line = formatDeviceCommand(DEVICE_COMMAND_KIND.BIODATA_WRITE, {
      pin: '9996',
      bioNo: 6,
      valid: 1,
      duress: 0,
      bioType: 1,
      majorVer: '13',
      minorVer: '0',
      template: 'apUBEBgE7osBAA0AAcVN',
    })
    assert.equal(
      line,
      'DATA UPDATE BIODATA Pin=9996\tNo=6\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=apUBEBgE7osBAA0AAcVN'
    )
  })

  test('foto por URL, nunca inline: la version inline dio Return=-1', ({ assert }) => {
    assert.equal(
      formatDeviceCommand(DEVICE_COMMAND_KIND.BIOPHOTO_WRITE, {
        pin: '9995',
        url: 'iclock/doc/biophoto/abc123/9995.jpg',
      }),
      'DATA UPDATE BIOPHOTO PIN=9995\tType=9\tFormat=1\tUrl=iclock/doc/biophoto/abc123/9995.jpg'
    )
    assert.equal(
      formatDeviceCommand(DEVICE_COMMAND_KIND.BIOPHOTO_DELETE, { pin: '9995' }),
      'DATA DELETE BIOPHOTO PIN=9995'
    )
  })

  test('la linea de despacho lleva el identificador de cable', ({ assert }) => {
    assert.equal(formatWireLine(1788912000123, 'CHECK'), 'C:1788912000123:CHECK')
  })

  test('un campo obligatorio ausente se rechaza antes de salir al equipo', ({ assert }) => {
    assert.throws(() => formatDeviceCommand(DEVICE_COMMAND_KIND.USER_DELETE, {}))
    assert.throws(() => formatDeviceCommand(DEVICE_COMMAND_KIND.ENROLL_FP, { pin: '1' }))
  })
})

test.group('Acuse del checador', () => {
  test('formato con ampersand, que es el que manda el equipo', ({ assert }) => {
    const parsed = parseDeviceCmdBody('ID=1788912000123&Return=0&CMD=DATA')
    assert.deepEqual(parsed, {
      id: 1788912000123,
      returnCode: 0,
      cmd: 'DATA',
      dump: null,
    })
  })

  test('formato por lineas y con espacios sobrantes', ({ assert }) => {
    const parsed = parseDeviceCmdBody('ID=12\nReturn=-30\nCMD=DATA UPDATE BIODATA\n')
    assert.equal(parsed?.id, 12)
    assert.equal(parsed?.returnCode, -30)
    assert.equal(parsed?.cmd, 'DATA UPDATE BIODATA')
  })

  test('un volcado de opciones despues del acuse se conserva aparte', ({ assert }) => {
    const parsed = parseDeviceCmdBody('ID=12&Return=0&CMD=INFO\n~Platform=ZAM180_TFT,UserCount=3')
    assert.equal(parsed?.cmd, 'INFO')
    assert.equal(parsed?.dump, '~Platform=ZAM180_TFT,UserCount=3')
  })

  /**
   * Cuerpo real del SpeedFace V5L del parque, recortado de la captura del
   * spike (`adms-probe/capture/2026-08-11T21-53-26-892Z-0004-devicecmd_ack`).
   *
   * El volcado viene una clave por linea, y la mitad de esas claves --las que
   * no llevan `~`-- encajaban en la gramatica de pares del acuse: se guardaban
   * como campos y nunca llegaban al perfil. Sobrevivian solo los `~Max*`, que
   * es exactamente lo que se vio en la ficha el 2026-09-11.
   */
  test('el volcado del INFO llega entero, con claves con y sin virgulilla', ({ assert }) => {
    const body = [
      'ID=1786485203822&Return=0&CMD=INFO',
      '~DeviceName=SpeedFace-V5L',
      'MAC=00:17:61:13:20:21',
      'TransactionCount=0',
      '~MaxAttLogCount=20',
      'UserCount=4',
      '~MaxUserCount=100',
      'FPVersion=10',
      'FaceVersion=39',
      'PvVersion=12',
      'FWVersion=ZAM180-NF50VA-Ver3.4.9',
      'PushVersion=Ver 2.0.33S-20220623',
    ].join('\n')

    const parsed = parseDeviceCmdBody(body)

    assert.equal(parsed?.id, 1786485203822)
    assert.equal(parsed?.returnCode, 0)
    assert.equal(parsed?.cmd, 'INFO')
    for (const clave of [
      '~DeviceName=SpeedFace-V5L',
      'MAC=00:17:61:13:20:21',
      'UserCount=4',
      'FPVersion=10',
      'FaceVersion=39',
      'PvVersion=12',
      'FWVersion=ZAM180-NF50VA-Ver3.4.9',
      'PushVersion=Ver 2.0.33S-20220623',
    ]) {
      assert.include(parsed?.dump ?? '', clave, `el volcado perdio ${clave}`)
    }
  })

  /** Los demas comandos si traen campos en las lineas siguientes: eso no cambia. */
  test('en un acuse que no es INFO las lineas siguientes siguen siendo campos', ({ assert }) => {
    const parsed = parseDeviceCmdBody('ID=12&Return=0\nCMD=DATA UPDATE USERINFO\n')

    assert.equal(parsed?.cmd, 'DATA UPDATE USERINFO')
    assert.isTrue(parsed?.dump === null || parsed?.dump === '')
  })

  test('un cuerpo sin identificador no se inventa: devuelve nulo', ({ assert }) => {
    assert.isNull(parseDeviceCmdBody('Return=0&CMD=DATA'))
    assert.isNull(parseDeviceCmdBody(''))
    assert.isNull(parseDeviceCmdBody('ID=abc&Return=0'))
  })

  test('sin Return el acuse no se interpreta como exito', ({ assert }) => {
    const parsed = parseDeviceCmdBody('ID=12&CMD=DATA')
    assert.equal(parsed?.id, 12)
    assert.isNull(parsed?.returnCode)
  })
})
