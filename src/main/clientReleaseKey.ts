// Clave pública de firma de las actualizaciones del cliente de escritorio. La escribe `npm run publicar-cliente` la
// primera vez (la privada se queda en el equipo que publica, fuera del repositorio) y va dentro de cada cliente
// compilado: sin ella, el cliente no instala ninguna actualización del servidor.
export const CLIENT_RELEASE_PUBLIC_KEY = ''
