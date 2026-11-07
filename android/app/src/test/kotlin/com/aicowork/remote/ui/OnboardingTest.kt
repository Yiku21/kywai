package com.aicowork.remote.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.net.CertificateInfo
import com.aicowork.remote.data.net.ProbeResult
import com.aicowork.remote.ui.orbita.OrbitaApp
import com.aicowork.remote.ui.orbita.orbitaModelForTests
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OnboardingTest {
    @get:Rule
    val compose = createComposeRule()

    private val fingerprint = (1..32).joinToString(":") { "%02X".format(it) }

    @Test
    fun selfSignedCertificateNeedsExplicitConfirmationBeforePairing() {
        val controller = FakeController()
        controller.probeResult = ProbeResult.NeedsConfirmation(
            CertificateInfo(fingerprint, "CN=kywai", "CN=kywai", 0, 1, listOf("100.64.1.2"), selfSigned = true)
        )
        compose.setContent { OrbitaApp(orbitaModelForTests(controller), "Pixel 9", null) }

        compose.onNodeWithText("Conectar con mi ordenador").performClick()
        compose.onNodeWithTag("serverUrl").performTextInput("http://100.64.1.2:8787")
        compose.onNodeWithText("Continuar").performClick()
        // HTTP sin cifrar hacia otra máquina no se permite.
        compose.onNodeWithText("Por seguridad", substring = true).assertExists()

        compose.onNodeWithTag("serverUrl").performTextReplacement("100.64.1.2:8788")
        compose.onNodeWithText("Continuar").performClick()

        compose.onNodeWithText("Confirma la huella del certificado").assertExists()
        compose.onNodeWithText("1  01:02:03:04").assertExists()
        compose.onNodeWithText("Confiar en este certificado").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("He comprobado que la huella coincide con la del ordenador").performScrollTo().performClick()
        compose.onNodeWithText("Confiar en este certificado").assertIsEnabled().performClick()

        compose.onNodeWithTag("pairCode").performTextInput("246810")
        compose.onNodeWithText("Emparejar").performScrollTo().performClick()
        compose.waitForIdle()

        assertEquals(Triple("https://100.64.1.2:8788/", "246810", fingerprint), controller.pairedWith)
        compose.onNodeWithText("Proyecto demo").assertExists()
    }

    @Test
    fun rejectingTheCertificateGoesBackWithoutPinning() {
        val controller = FakeController()
        controller.probeResult = ProbeResult.NeedsConfirmation(CertificateInfo(fingerprint, "CN=x", "CN=x", 0, 1, emptyList(), true))
        compose.setContent { OrbitaApp(orbitaModelForTests(controller), "Pixel 9", null) }
        compose.onNodeWithText("Conectar con mi ordenador").performClick()
        compose.onNodeWithTag("serverUrl").performTextInput("https://pc.tailnet.ts.net")
        compose.onNodeWithText("Continuar").performClick()
        compose.onNodeWithText("No coincide, cancelar").performScrollTo().performClick()
        compose.onNodeWithText("No se ha confiado en el certificado", substring = true).assertExists()
        assertEquals(null, controller.pairedWith)
    }
}
