package com.aicowork.remote

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.aicowork.remote.data.update.PackageInstallerAppInstaller
import com.aicowork.remote.i18n.I18n
import com.aicowork.remote.ui.orbita.AgentVoices
import com.aicowork.remote.ui.orbita.Feedback
import com.aicowork.remote.ui.orbita.OrbitaApp
import com.aicowork.remote.ui.orbita.OrbitaModel
import com.aicowork.remote.ui.orbita.UiSounds
import com.aicowork.remote.ui.space.WorldController

class MainActivity : ComponentActivity() {

    /** Estado de la interfaz y del mundo: sobrevive a plegar/desplegar (y a cualquier recreación de la actividad). */
    private val model: OrbitaModel by viewModels {
        viewModelFactory {
            initializer {
                val app = application as CoworkApplication
                val resolver = app.contentResolver
                val sounds = UiSounds()
                OrbitaModel(
                    controller = app.container.repository,
                    prefsStore = app.container.preferences,
                    world = WorldController(),
                    feedback = Feedback(sounds),
                    sounds = sounds,
                    systemReducedMotion = { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f },
                    voiceDir = java.io.File(app.cacheDir, "notas-de-voz"),
                    installer = PackageInstallerAppInstaller(app),
                    voices = AgentVoices(),
                    onInboxVisible = { app.container.inboxNotifier.sheetVisible = it },
                )
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // El idioma antes de pintar nada (y antes de crear el estado, que ya prepara textos).
        I18n.apply((application as CoworkApplication).container.preferences.preferences.value.language)
        super.onCreate(savedInstanceState)
        // Órbita es oscuro: barras del sistema transparentes con iconos claros.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        val container = (application as CoworkApplication).container
        setContent { OrbitaApp(model, deviceName(), container.demoServer) }
        // Abierta desde una notificación de «Te necesita» (no al recrearse, que ya conserva lo abierto).
        if (savedInstanceState == null) openInboxIfAsked(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openInboxIfAsked(intent)
    }

    private fun openInboxIfAsked(intent: Intent?) {
        if (intent?.action != InboxNotifier.ACTION_OPEN_INBOX) return
        model.openInbox()
    }

    override fun onResume() {
        super.onResume()
        // «Quitar animaciones» del sistema puede haber cambiado mientras la app estaba en segundo plano.
        model.refreshSystemMotion()
        // De vuelta del ajuste «Instalar apps desconocidas»: sigue con la actualización.
        model.updater?.resume()
    }

    private fun deviceName(): String =
        Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME)?.takeIf { it.isNotBlank() }
            ?: "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
}
