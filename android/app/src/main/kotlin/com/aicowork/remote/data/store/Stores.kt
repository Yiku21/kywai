package com.aicowork.remote.data.store

import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.i18n.AppLanguage
import com.aicowork.remote.data.model.Snapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import java.io.File

/** Servidor emparejado. El token NO va aquí: lo guarda [TokenStore] cifrado con Android Keystore. */
@Serializable
data class Session(
    val serverUrl: String,
    val serverName: String,
    val deviceName: String,
    /** Huella SHA-256 confirmada por el usuario (solo si el servidor usa un certificado propio). */
    val pinnedSha256: String? = null,
    val expiresAt: Long? = null,
    val pairedAt: Long = 0,
    /** Emparejado con el servidor simulado integrado (solo en la variante de depuración). */
    val demo: Boolean = false,
    /** Proyecto que se estaba viendo (null = el que elija el ordenador). */
    val conversationId: String? = null,
)

interface TokenStore {
    fun read(): String?
    fun write(token: String)
    fun clear()
}

interface SessionStore {
    fun load(): Session?
    fun save(session: Session)
    fun clear()
}

interface SnapshotCache {
    fun load(): CachedSnapshot?
    fun save(snapshot: Snapshot, at: Long)
    fun clear()
}

@Serializable
data class CachedSnapshot(val snapshot: Snapshot, val savedAt: Long)

enum class ThemeMode { System, Light, Dark }

/** Movimiento reducido: el del sistema (animaciones desactivadas en Accesibilidad) o elegido en la app. */
enum class MotionPreference { System, Reduced, Full }

/** Intensidad de los efectos del mundo: Suave ahorra batería; Completa usa todo lo que da la pantalla. */
enum class EffectsPreference { Soft, Normal, Full }

data class Preferences(
    val theme: ThemeMode = ThemeMode.System,
    val dynamicColor: Boolean = false,
    /** Sonidos cortos y suaves para los eventos importantes. */
    val sound: Boolean = true,
    /** Vibración al seleccionar y confirmar. */
    val haptics: Boolean = true,
    /** Animación ambiental del mundo (la actividad real se ve siempre). */
    val ambient: Boolean = true,
    val effects: EffectsPreference = EffectsPreference.Normal,
    val motion: MotionPreference = MotionPreference.System,
    /** Con el móvil plegado, los paneles (el chat) a pantalla completa: se recuerda al pulsar las flechas. */
    val foldedFullPanels: Boolean = false,
    /** Cada agente balbucea con su propia voz cuando escribe en el chat (como en el ordenador). */
    val voices: Boolean = true,
    /** Volumen de las voces (0–1), aparte de los sonidos. */
    val voiceVolume: Float = 0.7f,
    /** Idioma de la app en este móvil (Ajustes → «Idioma · Language»); «Del sistema», el del teléfono. */
    val language: AppLanguage = AppLanguage.System,
)

interface PreferencesStore {
    val preferences: StateFlow<Preferences>
    fun update(transform: (Preferences) -> Preferences)
}

// ---- Implementaciones en memoria (pruebas y vistas previas) ----

class InMemoryTokenStore(private var token: String? = null) : TokenStore {
    override fun read() = token
    override fun write(token: String) { this.token = token }
    override fun clear() { token = null }
}

class InMemorySessionStore(private var session: Session? = null) : SessionStore {
    override fun load() = session
    override fun save(session: Session) { this.session = session }
    override fun clear() { session = null }
}

class InMemorySnapshotCache : SnapshotCache {
    private var cached: CachedSnapshot? = null
    override fun load() = cached
    override fun save(snapshot: Snapshot, at: Long) { cached = CachedSnapshot(snapshot, at) }
    override fun clear() { cached = null }
}

class InMemoryPreferencesStore(initial: Preferences = Preferences()) : PreferencesStore {
    private val state = MutableStateFlow(initial)
    override val preferences: StateFlow<Preferences> = state.asStateFlow()
    override fun update(transform: (Preferences) -> Preferences) { state.value = transform(state.value) }
}

/** Última instantánea en disco para abrir la app sin conexión. */
class FileSnapshotCache(private val file: File) : SnapshotCache {
    override fun load(): CachedSnapshot? = runCatching {
        if (!file.exists()) null else CoworkJson.decodeFromString(CachedSnapshot.serializer(), file.readText())
    }.getOrNull()

    override fun save(snapshot: Snapshot, at: Long) {
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(CoworkJson.encodeToString(CachedSnapshot.serializer(), CachedSnapshot(snapshot, at)))
            tmp.renameTo(file)
        }
    }

    override fun clear() {
        file.delete()
    }
}
