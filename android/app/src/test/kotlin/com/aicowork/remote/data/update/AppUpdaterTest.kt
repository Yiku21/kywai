package com.aicowork.remote.data.update

import com.aicowork.remote.data.model.AppRelease
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

/** Ajustes → «Buscar actualizaciones»: Órbita se actualiza desde el ordenador sin pasar la APK a mano. */
class AppUpdaterTest {
    private val dir: File = Files.createTempDirectory("orbita-update").toFile()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private class FakeInstaller(override val downloadDir: File, override val versionCode: Long = 40) : AppInstaller {
        override val versionName = "1.$versionCode"
        override var isDevBuild = false
        override val failures = MutableSharedFlow<String>(extraBufferCapacity = 4)
        var allowed = false
        var askedPermission = 0
        val installed = mutableListOf<ByteArray>()
        override fun canInstall() = allowed
        override fun requestPermission() { askedPermission++ }
        override suspend fun install(apk: File) { installed += apk.readBytes() }
    }

    private val apk = ByteArray(3000) { (it % 251).toByte() }
    private val sha = MessageDigest.getInstance("SHA-256").digest(apk).joinToString("") { "%02x".format(it) }
    private fun release(code: Long = 52, sha256: String = sha) = AppRelease(code, "1.$code", apk.size.toLong(), sha256, "2026-10-12T10:00:00Z")

    private fun controller(release: AppRelease? = release()) = FakeController(SampleData.state().let { s ->
        s.copy(snapshot = s.snapshot!!.copy(capabilities = s.snapshot!!.capabilities.copy(appUpdate = true)))
    }).also { c ->
        if (release != null) c.release = Result.success(release)
        c.apk = apk
    }

    private fun AppUpdater.await(predicate: (UpdateState) -> Boolean): UpdateState =
        runBlocking { withTimeout(5_000) { state.first(predicate) } }

    @After
    fun tearDown() {
        scope.cancel()
        dir.deleteRecursively()
    }

    @Test
    fun findsANewerVersionAndInstallsItOnceAndroidAllowsIt() {
        val controller = controller()
        val installer = FakeInstaller(dir)
        val updater = AppUpdater(controller, installer, scope)
        updater.check()
        assertEquals(UpdateState.Available(release()), updater.await { it is UpdateState.Available })

        // La primera vez Android pide permiso: se descarga y se espera a que lo des.
        updater.install()
        assertEquals(UpdateState.NeedsPermission(release()), updater.await { it is UpdateState.NeedsPermission })
        updater.allowInstalls()
        assertEquals(1, installer.askedPermission)
        assertTrue(installer.installed.isEmpty())

        // De vuelta en Órbita con el permiso: instala lo descargado sin volver a bajarlo.
        installer.allowed = true
        updater.resume()
        updater.await { it is UpdateState.Installing }
        runBlocking { withTimeout(5_000) { while (installer.installed.isEmpty()) kotlinx.coroutines.delay(10) } }
        assertTrue(installer.installed.single().contentEquals(apk))
        assertEquals(1, controller.calls.count { it == "downloadApk" })
    }

    @Test
    fun withTheSameVersionThereIsNothingToInstall() {
        val updater = AppUpdater(controller(release(code = 40)), FakeInstaller(dir), scope)
        updater.check()
        assertEquals(UpdateState.UpToDate, updater.await { it !is UpdateState.Checking && it !is UpdateState.Idle })
    }

    @Test
    fun aDownloadThatIsNotTheAnnouncedVersionIsNotInstalled() {
        val installer = FakeInstaller(dir).apply { allowed = true }
        val updater = AppUpdater(controller(release(sha256 = "0".repeat(64))), installer, scope)
        updater.check()
        updater.await { it is UpdateState.Available }
        updater.install()
        val failed = updater.await { it is UpdateState.Failed } as UpdateState.Failed
        assertTrue(failed.message, failed.message.contains("no es la versión anunciada"))
        assertTrue(installer.installed.isEmpty())
        assertFalse(File(dir, "orbita-52.apk").exists())
    }

    @Test
    fun ifTheComputerHasANewerVersionSinceItWasAnnouncedItInstallsThatOne() {
        // Se anunció la 1.52, pero el ordenador se actualizó y ya sirve la APK de la 1.60.
        val installer = FakeInstaller(dir).apply { allowed = true }
        val controller = controller(release(code = 52, sha256 = "0".repeat(64)))
        val updater = AppUpdater(controller, installer, scope)
        updater.check()
        updater.await { it is UpdateState.Available }
        controller.release = Result.success(release(code = 60))
        updater.install()
        assertEquals(UpdateState.Installing(release(code = 60)), updater.await { it is UpdateState.Installing || it is UpdateState.Failed })
        runBlocking { withTimeout(5_000) { while (installer.installed.isEmpty()) kotlinx.coroutines.delay(10) } }
        assertTrue(installer.installed.single().contentEquals(apk))
    }

    @Test
    fun explainsWhyItCannotUpdate() {
        // El ordenador aún no ofrece actualizaciones.
        val old = FakeController(SampleData.state())
        val updater = AppUpdater(old, FakeInstaller(dir), scope)
        updater.check()
        assertTrue((updater.state.value as UpdateState.Failed).message.contains("actualiza kywai"))
        assertFalse("appRelease" in old.calls)

        // La versión de desarrollo es otro paquete: no se actualiza desde el ordenador.
        val dev = AppUpdater(controller(), FakeInstaller(dir).apply { isDevBuild = true }, scope)
        dev.check()
        assertTrue((dev.state.value as UpdateState.Failed).message.contains("versión de desarrollo"))

        // Lo que responde el ordenador (p. ej., que no tiene ninguna versión) se cuenta tal cual.
        val none = controller(release = null).apply { release = Result.failure(IllegalStateException("El ordenador aún no tiene ninguna versión de Órbita")) }
        val empty = AppUpdater(none, FakeInstaller(dir), scope)
        empty.check()
        assertEquals("El ordenador aún no tiene ninguna versión de Órbita", (empty.await { it is UpdateState.Failed } as UpdateState.Failed).message)
    }

    @Test
    fun aFailureReportedByAndroidShowsUpWithTheVersionToRetry() {
        val installer = FakeInstaller(dir).apply { allowed = true }
        val updater = AppUpdater(controller(), installer, scope)
        updater.check()
        updater.await { it is UpdateState.Available }
        updater.install()
        updater.await { it is UpdateState.Installing }
        runBlocking { installer.failures.emit("Instalación cancelada.") }
        assertEquals(UpdateState.Failed("Instalación cancelada.", release()), updater.await { it is UpdateState.Failed })
    }

    @Test
    fun oldDownloadsAreCleanedUp() {
        dir.mkdirs()
        File(dir, "orbita-30.apk").writeBytes(apk)
        File(dir, "orbita-60.apk").writeBytes(apk)
        AppUpdater(controller(), FakeInstaller(dir), scope)
        runBlocking { withTimeout(5_000) { while (File(dir, "orbita-30.apk").exists()) kotlinx.coroutines.delay(10) } }
        assertTrue(File(dir, "orbita-60.apk").exists())
    }
}
