package com.aicowork.remote.ui.space

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.store.InMemoryPreferencesStore
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import com.aicowork.remote.ui.theme.CoworkTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Sección del espacio digital: estados de carga, desconexión y sin datos, selección accesible de agentes y
 * navegación de ida y vuelta. Robolectric no tiene OpenGL, así que aquí se ve la alternativa sin 3D; la escena se
 * prueba aparte (SpaceSceneBuilderTest, OrbitCameraTest).
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SpaceScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val opened = mutableListOf<String>()
    private var retries = 0

    private fun show(state: CoworkUiState) = compose.setContent {
        CoworkTheme {
            SpaceScreen(
                state = state,
                onBack = { opened += "back" },
                onOpenAgent = { opened += "agent:$it" },
                onOpenTask = { opened += "task:$it" },
                onRetry = { retries++ },
            )
        }
    }

    @Test
    fun loadingWhileTheFirstSnapshotArrives() {
        show(SampleData.state().copy(snapshot = null, connection = Connection.Connecting))
        compose.onNodeWithText("Cargando el espacio digital…").assertIsDisplayed()
    }

    @Test
    fun disconnectedWithoutDataOffersRetry() {
        show(SampleData.state().copy(snapshot = null, connection = Connection.Offline("No se alcanza el servidor", null)))
        compose.onNodeWithText("Sin conexión con el ordenador").assertIsDisplayed()
        compose.onNodeWithText("Reintentar").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun emptyTeamExplainsWhatWillAppear() {
        show(SampleData.state().copy(snapshot = Snapshot()))
        compose.onNodeWithText("Todavía no hay agentes").assertIsDisplayed()
        compose.onNodeWithTag("space-summary").assertIsDisplayed()
        compose.onNodeWithText("Sin agentes").assertIsDisplayed()
    }

    @Test
    fun staleDataIsMarkedAndCanRetry() {
        show(SampleData.state(Connection.Offline("Se perdió la conexión", null)))
        compose.onNodeWithText("Sin conexión", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Reintentar").performClick()
        assertEquals(1, retries)
        // Los agentes se siguen viendo con su último estado conocido.
        compose.onNodeWithContentDescription("Constructor, Trabajando").assertIsDisplayed()
    }

    @Test
    fun selectingAnAgentShowsItsRealStateAndOpensDetails() {
        show(SampleData.state())
        compose.onNodeWithTag("space-summary").assertIsDisplayed()
        compose.onNodeWithText("1 trabajando").assertIsDisplayed()
        compose.onNodeWithTag("space-agent-dev").performClick()
        compose.onNodeWithTag("space-card").assertIsDisplayed()
        compose.onNodeWithText("«Construir pantallas»").assertIsDisplayed()
        compose.onNodeWithText("Editando MainActivity.kt").assertIsDisplayed()
        compose.onNodeWithText("Ver tarea").performClick()
        compose.onNodeWithText("Ver agente").performClick()
        assertEquals(listOf("task:t1", "agent:dev"), opened)
        compose.onNodeWithContentDescription("Cerrar").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("space-chips").assertIsDisplayed()
        compose.onNodeWithTag("space-back").performClick()
        assertTrue("back" in opened)
    }
}
