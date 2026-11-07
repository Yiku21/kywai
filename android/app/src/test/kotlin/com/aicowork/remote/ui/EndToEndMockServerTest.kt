package com.aicowork.remote.ui

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.mock.MockCoworkServer
import com.aicowork.remote.data.CoworkRepository
import com.aicowork.remote.data.store.InMemoryPreferencesStore
import com.aicowork.remote.data.store.InMemorySessionStore
import com.aicowork.remote.data.store.InMemorySnapshotCache
import com.aicowork.remote.data.store.InMemoryTokenStore
import com.aicowork.remote.ui.orbita.OrbitaApp
import com.aicowork.remote.ui.orbita.orbitaModelForTests
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode

/**
 * La interfaz completa (Órbita, plegado) con el repositorio real hablando con el servidor simulado: emparejar, pedir
 * y ver el resultado.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w475dp-h751dp")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class EndToEndMockServerTest {
    @get:Rule
    val compose = createComposeRule()

    private val server = MockCoworkServer(tickMillis = 40).also { it.start() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @After
    fun tearDown() {
        scope.cancel()
        server.close()
    }

    @Test
    fun pairsAndCompletesARequestAgainstTheMockServer() {
        val repository = CoworkRepository(InMemorySessionStore(), InMemoryTokenStore(), InMemorySnapshotCache(), scope, backoff = { 100L })
        val model = orbitaModelForTests(repository, InMemoryPreferencesStore())
        compose.setContent { OrbitaApp(model, "Pixel", null) }

        compose.onNodeWithText("Conectar con mi ordenador").performClick()
        compose.onNodeWithTag("serverUrl").performTextInput(server.baseUrl)
        compose.onNodeWithText("Continuar").performClick()
        compose.waitUntil(10_000) { compose.onAllNodes(hasText("Introduce el código de acceso")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("pairCode").performTextReplacement(server.pairingCode)
        compose.onNodeWithText("Emparejar").performScrollTo().performClick()

        compose.waitUntil(10_000) { compose.onAllNodes(hasContentDescription("En vivo", substring = true)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("Hazme un resumen")
        compose.onNodeWithContentDescription("Enviar").performClick()
        compose.waitUntil(20_000) { compose.onAllNodes(hasText("Petición terminada.")).fetchSemanticsNodes().isNotEmpty() }

        compose.onNodeWithTag("nav-Tasks").performClick()
        compose.onNodeWithText("Hechas").performClick()
        compose.onNodeWithText("Construir la solución").performClick()
        compose.onNodeWithTag("tasks-list").performScrollToNode(hasText("Hecha cuando: Las pruebas pasan"))
        compose.onNodeWithText("Hecha cuando: Las pruebas pasan").assertExists()
    }
}
