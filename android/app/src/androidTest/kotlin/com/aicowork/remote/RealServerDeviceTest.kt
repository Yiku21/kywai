package com.aicowork.remote

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.store.KeystoreTokenStore
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** APK normal, interfaz Compose y Android Keystore auténtico contra el servidor Node real. */
@RunWith(AndroidJUnit4::class)
class RealServerDeviceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun pairChatAndKeystore() {
        val args = InstrumentationRegistry.getArguments()
        val address = requireNotNull(args.getString("serverUrl"))
        val code = requireNotNull(args.getString("pairCode"))
        val pin = requireNotNull(args.getString("fingerprint"))
        val container = (compose.activity.application as CoworkApplication).container
        compose.onNodeWithText("Probar con el servidor simulado").assertDoesNotExist()
        compose.onNodeWithText("Conectar con mi ordenador").performClick()
        compose.onNodeWithTag("serverUrl").performTextInput(address)
        compose.onNodeWithText("Continuar").performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithTag("fingerprint").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Confiar en este certificado").assertIsNotEnabled()
        compose.onNodeWithTag("fingerprint").assertContentDescriptionEquals("Huella SHA-256: " + pin.replace(":", " "))
        compose.onNodeWithText("He comprobado que la huella coincide con la del ordenador").performScrollTo().performClick()
        compose.waitUntil(5_000) {
            compose.onAllNodes(hasText("Confiar en este certificado") and isEnabled()).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Confiar en este certificado").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithTag("pairCode").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("pairCode").performTextInput("incorrecto")
        compose.onNodeWithText("Emparejar").performScrollTo().performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithText("Código de acceso incorrecto").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("pairCode").performTextReplacement(code)
        compose.onNodeWithText("Emparejar").performScrollTo().performClick()
        compose.waitUntil(15_000) { container.repository.state.value.connection == Connection.Online }
        val token = requireNotNull(container.tokens.read())
        assertEquals(token, KeystoreTokenStore(compose.activity).read())
        val encrypted = compose.activity.getSharedPreferences("secure_session", 0).getString("token", null)
        assertNotNull(encrypted)
        assertNotEquals(token, encrypted)
        assertEquals(pin, container.repository.state.value.session?.pinnedSha256)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("Prueba desde APK instalada")
        compose.onNodeWithContentDescription("Enviar").performClick()
        compose.waitUntil(20_000) {
            container.repository.state.value.snapshot?.tasks?.any { it.status == "done" } == true
        }
        compose.onNodeWithTag("nav-Tasks").performClick()
        compose.onNodeWithText("Hechas").performClick()
        compose.onNodeWithText("Prueba móvil").assertIsDisplayed()
        container.repository.disconnect()
        container.repository.connect()
        compose.waitUntil(15_000) { container.repository.state.value.connection == Connection.Online }
        assertEquals(token, KeystoreTokenStore(compose.activity).read())
    }
}
