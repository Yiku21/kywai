package com.aicowork.remote.data.store

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import com.aicowork.remote.data.model.CoworkJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Guarda el token de acceso cifrado con AES-256-GCM. La clave vive en Android Keystore (no se puede extraer
 * del dispositivo) y en SharedPreferences solo queda el texto cifrado. Si la clave se invalida, se olvida el token.
 */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("secure_session", Context.MODE_PRIVATE)

    override fun read(): String? {
        val stored = prefs.getString(KEY_TOKEN, null) ?: return null
        return runCatching {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, IV_LENGTH)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(bytes, IV_LENGTH, bytes.size - IV_LENGTH), Charsets.UTF_8)
        }.getOrElse {
            clear()
            null
        }
    }

    override fun write(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit { putString(KEY_TOKEN, Base64.encodeToString(encrypted, Base64.NO_WRAP)) }
    }

    override fun clear() {
        prefs.edit { remove(KEY_TOKEN) }
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "ai_cowork_access_token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
        const val KEY_TOKEN = "token"
    }
}

class PrefsSessionStore(context: Context) : SessionStore {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    override fun load(): Session? = prefs.getString("session", null)?.let {
        runCatching { CoworkJson.decodeFromString(Session.serializer(), it) }.getOrNull()
    }

    override fun save(session: Session) {
        prefs.edit { putString("session", CoworkJson.encodeToString(Session.serializer(), session)) }
    }

    override fun clear() {
        prefs.edit { remove("session") }
    }
}

class PrefsPreferencesStore(context: Context) : PreferencesStore {
    private val prefs: SharedPreferences = context.getSharedPreferences("preferences", Context.MODE_PRIVATE)
    private val state = MutableStateFlow(read())
    override val preferences: StateFlow<Preferences> = state.asStateFlow()

    private fun read() = Preferences(
        theme = runCatching { ThemeMode.valueOf(prefs.getString("theme", null) ?: "System") }.getOrDefault(ThemeMode.System),
        dynamicColor = prefs.getBoolean("dynamicColor", false),
        sound = prefs.getBoolean("sound", true),
        haptics = prefs.getBoolean("haptics", true),
        ambient = prefs.getBoolean("ambient", true),
        effects = runCatching { EffectsPreference.valueOf(prefs.getString("effects", null) ?: "Normal") }.getOrDefault(EffectsPreference.Normal),
        motion = runCatching { MotionPreference.valueOf(prefs.getString("motion", null) ?: "System") }.getOrDefault(MotionPreference.System),
        foldedFullPanels = prefs.getBoolean("foldedFullPanels", false),
        voices = prefs.getBoolean("voices", true),
        voiceVolume = prefs.getFloat("voiceVolume", 0.7f).coerceIn(0f, 1f),
    )

    override fun update(transform: (Preferences) -> Preferences) {
        val next = transform(state.value)
        prefs.edit {
            putString("theme", next.theme.name)
            putBoolean("dynamicColor", next.dynamicColor)
            putBoolean("sound", next.sound)
            putBoolean("haptics", next.haptics)
            putBoolean("ambient", next.ambient)
            putString("effects", next.effects.name)
            putString("motion", next.motion.name)
            putBoolean("foldedFullPanels", next.foldedFullPanels)
            putBoolean("voices", next.voices)
            putFloat("voiceVolume", next.voiceVolume)
        }
        state.value = next
    }
}
