package com.aicowork.remote

import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.data.store.Session
import com.aicowork.remote.ui.space.SpaceColors
import com.aicowork.remote.ui.space.SpaceSceneBuilder
import com.aicowork.remote.ui.space.SpaceScreen
import com.aicowork.remote.ui.theme.CoworkTheme
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.abs

/**
 * Espacio digital en un dispositivo de verdad: aquí sí hay OpenGL, así que se comprueba que la escena se dibuja
 * (no la vista alternativa), que los gestos no la rompen y, con el servidor real, que muestra a sus agentes.
 */
@RunWith(AndroidJUnit4::class)
class SpaceDeviceTest {
    @get:Rule val compose = createComposeRule()

    private val snapshot = Snapshot(
        conversation = Conversation(id = "c1", title = "Demo", activeRequestIds = listOf("r1")),
        agents = listOf(
            Agent("coord", "Coordinador", provider = "claude", plannerOnly = true, activity = "thinking"),
            Agent("dev", "Constructor", provider = "codex", activity = "working", taskId = "t1", lastActivity = "Editando MainActivity.kt"),
            Agent("rev", "Revisora", provider = "gemini", activity = "waiting", waitingFor = "dev"),
            Agent("local", "Local", provider = "ollama", activity = "error", reason = "Modelo no disponible"),
        ),
        tasks = listOf(TaskItem("t1", "r1", "Construir pantallas", agentId = "dev", status = "running", progress = 0.4)),
    )

    @Test fun drawsTheSceneInOpenGlAndSurvivesGestures() {
        val opened = mutableListOf<String>()
        val state = CoworkUiState(
            session = Session("https://100.64.1.2:8788/", "Mac", "Pixel", pairedAt = 1),
            snapshot = snapshot,
            connection = Connection.Online,
            syncedAt = System.currentTimeMillis(),
        )
        compose.setContent {
            CoworkTheme {
                SpaceScreen(state, onBack = { opened += "back" }, onOpenAgent = { opened += "agent:$it" }, onOpenTask = { opened += "task:$it" }, onRetry = {})
            }
        }
        compose.onNodeWithTag("space-canvas").assertIsDisplayed()
        compose.onNodeWithTag("space-fallback").assertDoesNotExist()
        compose.onNodeWithText("1 trabajando · 1 pensando · 1 esperando · 1 con error").assertIsDisplayed()

        // Girar, pellizcar y doble toque: la vista 3D sigue en pie (si OpenGL fallara, aparecería la alternativa).
        compose.onNodeWithTag("space-canvas").performTouchInput { swipeLeft(); swipeUp() }
        compose.onNodeWithTag("space-canvas").performTouchInput { pinch(center - Offset(40f, 0f), center - Offset(200f, 0f), center + Offset(40f, 0f), center + Offset(200f, 0f)) }
        compose.onNodeWithTag("space-canvas").performTouchInput { doubleClick() }
        Thread.sleep(1_500)
        compose.waitForIdle()
        compose.onNodeWithTag("space-fallback").assertDoesNotExist()

        val shot = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "space-device.png").outputStream().use {
            shot.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        assertTrue("La escena 3D no dibuja nada", drawnFraction(shot) > 0.05f)

        compose.onNodeWithTag("space-chips").performScrollToNode(hasTestTag("space-agent-rev"))
        compose.onNodeWithContentDescription("Revisora, Esperando").performClick()
        compose.onNodeWithTag("space-card").assertIsDisplayed()
        compose.onNodeWithText("espera a Constructor", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Ver agente").performClick()
        assertEquals(listOf("agent:rev"), opened)
        compose.onNodeWithContentDescription("Cerrar").performClick()
        compose.onNodeWithTag("space-chips").assertIsDisplayed()
        compose.onNodeWithTag("space-back").performClick()
        assertEquals("back", opened.last())
    }

    /** Parte de la mitad central de la pantalla que no es el fondo liso del espacio. */
    private fun drawnFraction(bitmap: Bitmap): Float {
        val bg = SpaceColors.BACKGROUND
        var drawn = 0
        var total = 0
        for (y in bitmap.height / 4 until bitmap.height * 3 / 4 step 8) {
            for (x in 0 until bitmap.width step 8) {
                val p = bitmap.getPixel(x, y)
                val diff = abs(((p shr 16) and 0xFF) - ((bg shr 16) and 0xFF)) +
                    abs(((p shr 8) and 0xFF) - ((bg shr 8) and 0xFF)) + abs((p and 0xFF) - (bg and 0xFF))
                if (diff > 40) drawn++
                total++
            }
        }
        return drawn.toFloat() / total
    }
}

/** Con el servidor Node real (mismos argumentos que [RealServerDeviceTest]): el espacio muestra sus agentes y estados. */
@RunWith(AndroidJUnit4::class)
class SpaceRealServerDeviceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun showsTheRealTeamAndReturnsToNativeScreens() {
        val args = InstrumentationRegistry.getArguments()
        val address = args.getString("serverUrl")
        assumeTrue("Sin servidor real (serverUrl)", address != null)
        val repository = (compose.activity.application as CoworkApplication).container.repository
        val pairedHere = repository.state.value.session == null
        if (pairedHere) {
            runBlocking { repository.pair(address!!.toHttpUrl(), args.getString("pairCode")!!, "Emulador 3D", args.getString("fingerprint")) }
        }
        try {
            compose.waitUntil(20_000) { repository.state.value.connection == Connection.Online && repository.state.value.snapshot != null }
            val real = repository.state.value.snapshot!!
            assertTrue("El servidor no tiene agentes", real.agents.isNotEmpty())

            compose.onNodeWithTag("nav-more").performClick()
            compose.onNodeWithText("Espacio digital").performClick()
            compose.onNodeWithTag("space-canvas").assertIsDisplayed()
            compose.onNodeWithTag("space-fallback").assertDoesNotExist()
            compose.onNodeWithTag("nav-home").assertDoesNotExist()

            val scene = SpaceSceneBuilder.build(repository.state.value.snapshot!!)
            assertEquals(real.agents.map { it.id }.toSet(), scene.agents.map { it.id }.toSet())
            compose.onNodeWithTag("space-summary").assertTextEquals(scene.summary)
            for (agent in scene.agents) {
                compose.onNodeWithTag("space-chips").performScrollToNode(hasTestTag("space-agent-${agent.id}"))
                compose.onNodeWithTag("space-agent-${agent.id}").assertContentDescriptionEquals("${agent.name}, ${agent.activityLabel}")
            }

            // Abrir la ficha nativa de un agente desde el espacio y volver con él aún elegido.
            val first = scene.agents.first()
            compose.onNodeWithTag("space-chips").performScrollToNode(hasTestTag("space-agent-${first.id}"))
            compose.onNodeWithTag("space-agent-${first.id}").performClick()
            compose.onNodeWithTag("space-card").assertIsDisplayed()
            compose.onNodeWithText("Ver agente").performClick()
            compose.onNodeWithTag("space").assertDoesNotExist()
            compose.onNodeWithContentDescription("Atrás").performClick()
            compose.onNodeWithTag("space-card").assertIsDisplayed()
            compose.onNodeWithTag("space-back").performClick()
            compose.onNodeWithText("Memoria").assertIsDisplayed()
            compose.onNodeWithTag("nav-home").assertIsDisplayed()
        } finally {
            if (pairedHere) repository.forget()
        }
    }
}
