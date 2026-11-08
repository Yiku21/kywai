// Tipo de tarea (imagen, web, código, texto, investigación) a partir de su título y su descripción. Sirve para medir
// qué agente rinde mejor en cada tipo y repartir con datos, no solo con lo que dice su ficha.
import { isVisualTask } from './modelCatalog'

export type TaskCategory = 'visual' | 'web' | 'code' | 'text' | 'research' | 'other'

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  visual: 'imágenes y piezas visuales',
  web: 'webs e interfaces',
  code: 'código y scripts',
  text: 'textos y documentos',
  research: 'investigar y analizar',
  other: 'otras'
}

const WEB = /\b(web|landing|interfaz|ui|frontend|p[aá]gina|pantalla|componente|css|html|react|dise[nñ]o de la app)\b/
const CODE = /\b(c[oó]digo|script|api|servidor|backend|bug|error|arregla|arreglar|funci[oó]n|prueba|pruebas|test|base de datos|instala|instalar|app|aplicaci[oó]n|programa|refactor|compila)\b/
const TEXT = /\b(documento|informe|resumen|resume|redacta|redactar|texto|art[ií]culo|correo|email|traduce|traducir|gu[ií]a|manual|readme|contexto|carta|post)\b/
const RESEARCH = /\b(investiga|investigar|busca|buscar|compara|comparar|analiza|analizar|an[aá]lisis|estudio|eval[uú]a|evaluar|recomienda|opciones)\b/

/** Primer tipo que encaja, mirando antes el título que la descripción. */
export function taskCategory(title: string, description = ''): TaskCategory {
  if (isVisualTask(title, description)) return 'visual'
  for (const text of [title.toLowerCase(), description.toLowerCase()]) {
    if (WEB.test(text)) return 'web'
    if (CODE.test(text)) return 'code'
    if (TEXT.test(text)) return 'text'
    if (RESEARCH.test(text)) return 'research'
  }
  return 'other'
}
