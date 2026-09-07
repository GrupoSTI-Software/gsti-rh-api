import { test } from '@japa/runner'
import {
  noticePlainTextLength,
  sanitizeNoticeHtml,
} from '../../../app/helpers/sanitize_notice_content.js'

/**
 * El mensaje de un aviso se pinta como HTML en el backoffice, en la app y en el
 * correo. Lo que se fija aquí: solo sobrevive el formato del editor, ningún
 * script ni manejador entra, y el tope de caracteres se mide sobre el texto que
 * ve el usuario, no sobre las etiquetas.
 */
test.group('sanitize_notice_content', () => {
  test('conserva el formato del editor y quita lo ejecutable', ({ assert }) => {
    const html =
      '<p>Hola <strong>equipo</strong><script>alert(1)</script> <a href="javascript:x()" onclick="y()">liga</a></p>'
    const result = sanitizeNoticeHtml(html)
    assert.include(result, '<strong>equipo</strong>')
    assert.notInclude(result, '<script')
    assert.notInclude(result, 'onclick')
    assert.notInclude(result, 'javascript:')
  })

  test('todo enlace abre en pestaña nueva sin ceder el opener', ({ assert }) => {
    const result = sanitizeNoticeHtml('<p><a href="https://valanserh.com">sitio</a></p>')
    assert.include(result, 'target="_blank"')
    assert.include(result, 'rel="noopener noreferrer"')
  })

  test('cadena vacía o ausente se preserva como vacía', ({ assert }) => {
    assert.equal(sanitizeNoticeHtml(''), '')
    assert.equal(sanitizeNoticeHtml(null), '')
    assert.equal(sanitizeNoticeHtml(undefined), '')
  })

  test('el largo se mide sobre el texto plano', ({ assert }) => {
    assert.equal(noticePlainTextLength('<p><strong>Hola</strong> mundo</p>'), 10)
    assert.equal(noticePlainTextLength('<p>a&amp;b&nbsp;c</p>'), 5)
    assert.equal(noticePlainTextLength('<p><br></p>'), 0)
    assert.equal(noticePlainTextLength(null), 0)
  })
})
