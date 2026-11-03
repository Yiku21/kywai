package com.aicowork.remote.ui.orbita

import android.os.Looper
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.model.AppRelease
import com.aicowork.remote.data.update.AppInstaller
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import kotlinx.coroutines.flow.MutableSharedFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

/** Ajustes → Órbita: al abrirlo ya dice si el ordenador tiene una versión nueva, y un toque la instala. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AppUpdateUiTest {
    @get:Rule
    val compose = createComposeRule()

    private class Installer : AppInstaller {
        override val versionCode = 40L
        override val versionName = "1.40"
        override val isDevBuild = false
        override val downloadDir: File = Files.createTempDirectory("orbita-ui").toFile().apply { deleteOnExit() }
        override val failures = MutableSharedFlow<String>()
        var asked = 0
        val installed = mutableListOf<File>()
        override fun canInstall() = asked > 0
        override fun requestPermission() { asked++ }
        override suspend fun install(apk: File) { installed += apk }
    }

    /** Lo que vuelve de otros hilos (la descarga, la huella) se ejecuta en el hilo principal, que en Robolectric hay que mover a mano. */
    private fun idleMain() = shadowOf(Looper.getMainLooper()).idle()

    @Test
    fun settingsOfferTheNewVersionAndInstallItWithOneTap() {
        val apk = ByteArray(2_500_000) { (it % 13).toByte() }
        val sha = MessageDigest.getInstance("SHA-256").digest(apk).joinToString("") { "%02x".format(it) }
        val state = SampleData.state().let { s -> s.copy(snapshot = s.snapshot!!.copy(capabilities = s.snapshot!!.capabilities.copy(appUpdate = true))) }
        val controller = FakeController(state).apply {
            release = Result.success(AppRelease(52, "1.52", apk.size.toLong(), sha))
            this.apk = apk
        }
        val installer = Installer()
        val model = orbitaModelForTests(controller, installer = installer)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Settings").performClick()
        compose.onNodeWithTag("settings-list").performScrollToNode(hasTestTag("app-update"))
        compose.onNodeWithText("Versión 1.40").assertIsDisplayed()
        compose.waitUntil(5_000) { idleMain(); "appRelease" in controller.calls }
        compose.onNodeWithText("Hay una versión nueva (1.52, 2,4 MB)", substring = true).assertIsDisplayed()

        // Primera vez: Android pide permiso para que Órbita instale.
        compose.onNodeWithText("Instalar la versión 1.52").performClick()
        compose.waitUntil(5_000) { idleMain(); runCatching { compose.onNodeWithText("Permitir instalar desde Órbita").assertExists() }.isSuccess }
        compose.onNodeWithText("Permitir instalar desde Órbita").performClick()
        assertEquals(1, installer.asked)

        // De vuelta con el permiso, instala lo descargado.
        model.updater!!.resume()
        compose.waitUntil(5_000) { idleMain(); installer.installed.isNotEmpty() }
        compose.onNodeWithTag("settings-list").performScrollToNode(hasText("Instalando la versión 1.52", substring = true))
        assertEquals(apk.size.toLong(), installer.installed.single().length())
    }
}
