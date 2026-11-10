// Importar un archivo con «?asset» da su ruta en disco (electron-vite lo copia junto al motor al compilar).
declare module '*?asset' {
  const path: string
  export default path
}
