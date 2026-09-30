import { test } from '@japa/runner'
import { sanitizeLegalDocumentHtml } from '../../../app/helpers/sanitize_legal_document_content.js'

/**
 * El contenido de un documento legal se sirve sin sesión. Lo que se fija aquí:
 * ninguna carga maliciosa sobrevive al saneo, y el HTML legítimo del editor
 * (Quill) llega intacto, con todo enlace cerrado con `rel="noopener noreferrer"`.
 */
test.group('sanitize_legal_document_content | cargas maliciosas (CA-3)', () => {
  test('quita scripts, imágenes con manejadores, javascript: y URLs protocol-relative', ({
    assert,
  }) => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">x</a>',
      '<a href="//evil.example">y</a>',
      '<p style="position:fixed">z</p>',
    ]

    for (const payload of payloads) {
      const result = sanitizeLegalDocumentHtml(payload)
      assert.notInclude(result, '<script', payload)
      assert.notInclude(result, 'alert(', payload)
      assert.notInclude(result, '<img', payload)
      assert.notInclude(result, 'onerror', payload)
      assert.notInclude(result, 'javascript:', payload)
      assert.notInclude(result, '//evil.example', payload)
    }
  })

  test('un párrafo sale sin style', ({ assert }) => {
    const result = sanitizeLegalDocumentHtml('<p style="position:fixed">z</p>')
    assert.include(result, '<p>')
    assert.notInclude(result, 'style')
  })
})

test.group('sanitize_legal_document_content | HTML legítimo de Quill', () => {
  const html =
    '<p><strong>Negritas</strong></p><ol><li>Uno</li></ol><h2>Título</h2><blockquote>Cita</blockquote><span style="color:#ff0000">Rojo</span><a href="https://valanserh.com" target="_blank">Valanserh</a><a href="https://example.com" rel="nofollow">Otro</a>'

  test('conserva el formato del editor y ambos href', ({ assert }) => {
    const result = sanitizeLegalDocumentHtml(html)
    assert.include(result, '<p>')
    assert.include(result, '<strong>')
    assert.include(result, '<ol>')
    assert.include(result, '<li>')
    assert.include(result, '<h2>')
    assert.include(result, '<blockquote>')
    assert.include(result, '<span style="color:#ff0000">')
    assert.include(result, 'href="https://valanserh.com"')
    assert.include(result, 'href="https://example.com"')
  })

  test('todo enlace lleva rel="noopener noreferrer" y el rel de origen se reemplaza', ({
    assert,
  }) => {
    const result = sanitizeLegalDocumentHtml(html)
    const anchors = result.match(/<a\b[^>]*>/g) ?? []
    assert.lengthOf(anchors, 2)
    for (const anchor of anchors) {
      assert.include(anchor, 'rel="noopener noreferrer"')
    }
    assert.notInclude(result, 'nofollow')
  })
})
