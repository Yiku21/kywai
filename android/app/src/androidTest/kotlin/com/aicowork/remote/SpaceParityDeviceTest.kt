package com.aicowork.remote

import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pinch
import androidx.compose.ui.test.swipe
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.RobotAvatar
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.data.store.Session
import com.aicowork.remote.ui.space.SpaceColors
import com.aicowork.remote.ui.space.SpaceScreen
import com.aicowork.remote.ui.space.SpaceZone
import com.aicowork.remote.ui.theme.CoworkTheme
import java.io.File
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * El espacio con el equipo por defecto del escritorio (Hermes, Gemini, Qwen, Claude, Codex y un becario en sus
 * estaciones): se dibuja en OpenGL, los gestos y los botones de cámara no lo rompen, las zonas responden y se guarda
 * una captura (`space-parity.png` en los archivos de la app) para compararla con el escritorio.
 */
@RunWith(AndroidJUnit4::class)
class SpaceParityDeviceTest {
    @get:Rule val compose = createComposeRule()

    private val team = Snapshot(
        conversation = Conversation(id = "c1", title = "Mi primer proyecto", activeRequestIds = listOf("r1")),
        agents = listOf(
            Agent("hermes", "Hermes", provider = "hermes", modelLabel = "Hermes Agent", color = "#ffe6ba", stationId = "st-hermes", plannerOnly = true, activity = "thinking", lastActivity = "Coordinando",
                avatar = RobotAvatar("dome", "hair", "round", "hermes", "#ffc65a", "#141419", "#d6a743")),
            Agent("gemini", "Gemini", provider = "gemini", modelLabel = "3.8 Flash", color = "#2a7bff", stationId = "st-gemini", activity = "working", taskId = "t1", lastActivity = "Investigando",
                avatar = RobotAvatar("capsule", "ears", "round", "gemini", "#6ef3ff", "#3ab8ff")),
            Agent("qwen", "Qwen", provider = "ollama", modelLabel = "Local 14B", color = "#8a55ff", stationId = "st-qwen",
                avatar = RobotAvatar("egg", "none", "pill", "qwen", "#ecdcff")),
            Agent("claude", "Claude", provider = "claude", modelLabel = "Sonnet", color = "#ff7a1f", stationId = "st-claude", activity = "working", taskId = "t2", lastActivity = "Diseñando",
                avatar = RobotAvatar("blob", "tuft", "arc", "claude", "#fff0c8")),
            Agent("codex", "Codex", provider = "codex", modelLabel = "GPT-6.1 Sol", color = "#21c07c", stationId = "st-codex", activity = "waiting", waitingFor = "claude",
                avatar = RobotAvatar("cube", "vents", "chevron", "openai", "#8cffd0")),
            Agent("becario-1", "Becario", provider = "claude", modelLabel = "Haiku", color = "#ffc21a", stationId = "st-sub-1", isSubagent = true, activity = "error", reason = "Cuota agotada"),
        ),
        tasks = listOf(
            TaskItem("t1", "r1", "Investigar competidores", agentId = "gemini", status = "running", progress = 0.45),
            TaskItem("t2", "r1", "Diseñar la portada", agentId = "claude", status = "running"),
        ),
        memory = listOf(MemoryEntry("m1", kind = "decision", text = "App nativa"), MemoryEntry("m2", kind = "preference", text = "Español")),
    )

    @Test fun desktopSceneOnThePhone() {
        val opened = mutableListOf<String>()
        val state = CoworkUiState(
            session = Session("https://100.64.1.2:8788/", "Mac", "Pixel", pairedAt = 1),
            snapshot = team,
            connection = Connection.Online,
            syncedAt = System.currentTimeMillis(),
        )
        compose.setContent {
            CoworkTheme {
                SpaceScreen(
                    state,
                    onBack = { opened += "back" },
                    onOpenAgent = { opened += "agent:$it" },
                    onOpenTask = { opened += "task:$it" },
                    onRetry = {},
                    onOpenZone = { opened += "zone:${it.name}" },
                )
            }
        }
        compose.onNodeWithTag("space-canvas").assertIsDisplayed()
        compose.onNodeWithTag("space-fallback").assertDoesNotExist()
        compose.onNodeWithText("2 trabajando · 1 pensando · 1 esperando · 1 con error").assertIsDisplayed()
        Thread.sleep(4_000)
        compose.waitForIdle()
        val overview = screenshot("space-parity.png")
        assertTrue("La escena 3D no dibuja nada", drawnFraction(overview) > 0.3f)

        // Botones de cámara y gestos: un dedo gira, dos dedos desplazan y pellizcan.
        compose.onNodeWithContentDescription("Acercar").performClick()
        compose.onNodeWithContentDescription("Alejar").performClick()
        compose.onNodeWithTag("space-canvas").performTouchInput { swipe(center, center + Offset(-200f, 80f), 400) }
        compose.onNodeWithTag("space-canvas").performTouchInput { pinch(center - Offset(60f, 0f), center - Offset(260f, 0f), center + Offset(60f, 0f), center + Offset(260f, 0f)) }
        compose.onNodeWithContentDescription("Vista general").performClick()
        Thread.sleep(1_500)
        compose.waitForIdle()
        compose.onNodeWithTag("space-fallback").assertDoesNotExist()
        assertTrue(drawnFraction(screenshot("space-parity-gestures.png")) > 0.3f)

        // Elegir un robot desde las fichas: ficha con su estado y cámara sobre su estación.
        compose.onNodeWithTag("space-agent-gemini").performClick()
        compose.onNodeWithTag("space-card").assertIsDisplayed()
        compose.onNodeWithText("«Investigar competidores»").assertIsDisplayed()
        Thread.sleep(1_500)
        screenshot("space-parity-focus.png")
        compose.onNodeWithText("Ver tarea").performClick()
        assertEquals(listOf("task:t1"), opened)
        compose.onNodeWithContentDescription("Cerrar").performClick()
        compose.onNodeWithTag("space-chips").assertIsDisplayed()
        compose.onNodeWithTag("space-back").performClick()
        assertEquals("back", opened.last())
        assertTrue(SpaceZone.entries.isNotEmpty())
    }

    private fun screenshot(name: String): Bitmap {
        val shot = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, name).outputStream().use {
            shot.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        return shot
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
                if (diff > 12) drawn++
                total++
            }
        }
        return drawn.toFloat() / total
    }
}
