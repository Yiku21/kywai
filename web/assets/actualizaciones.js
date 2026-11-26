// Página «Actualizaciones»: filtro por tipo y buscador. Sin JavaScript la lista completa se ve igual (los días se abren a mano).
(() => {
  const raiz = document.querySelector('[data-upd]')
  if (!raiz) return
  const botones = [...raiz.querySelectorAll('.upd-filters button')]
  const buscador = raiz.querySelector('.upd-search')
  const vacio = raiz.querySelector('.upd-none')
  const items = [...raiz.querySelectorAll('li[data-t]')]
  const dias = [...raiz.querySelectorAll('.upd-day')]
  const meses = [...raiz.querySelectorAll('.upd-month')]
  const abiertosAlInicio = new Map(dias.map(d => [d, d.open]))
  const texto = new Map(items.map(li => [li, li.textContent.toLowerCase()]))
  let tipo = ''
  const aplicar = () => {
    const consulta = buscador.value.trim().toLowerCase()
    const filtrando = Boolean(tipo || consulta)
    for (const li of items) li.hidden = (tipo && li.dataset.t !== tipo) || (consulta && !texto.get(li).includes(consulta))
    let visibles = 0
    for (const dia of dias) {
      const hay = dia.querySelector('li:not([hidden])') !== null
      dia.hidden = !hay
      if (hay) visibles++
      // Al filtrar se abren los días con resultados; al limpiar, vuelven a como estaban.
      dia.open = filtrando ? hay : abiertosAlInicio.get(dia)
    }
    for (const mes of meses) mes.hidden = !mes.querySelector('.upd-day:not([hidden])')
    vacio.hidden = visibles > 0
  }
  for (const b of botones) b.addEventListener('click', () => {
    tipo = b.dataset.filter
    for (const o of botones) o.setAttribute('aria-pressed', String(o === b))
    aplicar()
  })
  buscador.addEventListener('input', aplicar)
})()
