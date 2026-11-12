package com.aicowork.remote.ui.orbita

import android.widget.Magnifier
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.TextToolbarStatus
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.text.AnnotatedString
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements

/**
 * En el chat, mantener pulsado un mensaje abre su menú: Copiar lo copia entero, «Seleccionar texto» deja elegir
 * palabras con los tiradores, y en un mensaje tuyo «Editar y reenviar» lo pone en una rama nueva. En la caja se pega.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp", shadows = [ChatSelectionTest.NoMagnifier::class])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChatSelectionTest {
    @get:Rule
    val compose = createComposeRule()

    /** La lupa que sale al arrastrar la selección no tiene superficie en Robolectric y falla al cerrarse; en la prueba no se dibuja. */
    @Implements(Magnifier::class)
    class NoMagnifier {
        @Implementation
        fun show(sourceCenterX: Float, sourceCenterY: Float) {}

        @Implementation
        fun show(sourceCenterX: Float, sourceCenterY: Float, magnifierCenterX: Float, magnifierCenterY: Float) {}

        @Implementation
        fun update() {}

        @Implementation
        fun dismiss() {}
    }

    /** El menú de Copiar / Pegar del sistema, apuntado para poder pulsarlo desde la prueba. */
    private class Toolbar : TextToolbar {
        var copy: (() -> Unit)? = null
        var paste: (() -> Unit)? = null
        override var status = TextToolbarStatus.Hidden
        override fun showMenu(rect: Rect, onCopyRequested: (() -> Unit)?, onPasteRequested: (() -> Unit)?, onCutRequested: (() -> Unit)?, onSelectAllRequested: (() -> Unit)?) {
            copy = onCopyRequested
            paste = onPasteRequested
            status = TextToolbarStatus.Shown
        }
        override fun hide() {
            status = TextToolbarStatus.Hidden
        }
    }

    private class Clipboard : ClipboardManager {
        var copied: AnnotatedString? = null
        override fun setText(annotatedString: AnnotatedString) {
            copied = annotatedString
        }
        override fun getText() = copied
    }

    @Test
    fun aLongPressOnAMessageOpensItsMenuToCopyOrSelectAndTheComposerPastes() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        val toolbar = Toolbar()
        val clipboard = Clipboard()
        compose.setContent {
            CompositionLocalProvider(LocalTextToolbar provides toolbar, LocalClipboardManager provides clipboard) {
                Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) }
            }
        }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasText("Haz la app Android"))

        // Mantener el dedo abre el menú; Copiar copia el mensaje entero.
        compose.onNodeWithText("Haz la app Android").performTouchInput { longClick(center) }
        compose.onNodeWithText("Copiar").performClick()
        compose.waitForIdle()
        assertEquals("Haz la app Android", clipboard.copied?.text)
        clipboard.copied = null

        // «Seleccionar texto»: ahí el dedo ya selecciona una palabra y ofrece el Copiar del sistema.
        compose.onNodeWithText("Haz la app Android").performTouchInput { longClick(center) }
        compose.onNodeWithText("Seleccionar texto").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Haz la app Android").performTouchInput { longClick(center) }
        compose.waitForIdle()
        assertNotNull("el menú no ofrece Copiar", toolbar.copy)
        toolbar.copy!!.invoke()
        compose.waitForIdle()
        val copied = clipboard.copied?.text.orEmpty()
        assertTrue("se copió «$copied»", copied.isNotBlank() && copied in "Haz la app Android")

        // Mantener el dedo en la caja de escribir ofrece Pegar, y pega lo copiado.
        toolbar.paste = null
        compose.onNodeWithTag("composer").performTouchInput { longClick(center) }
        compose.waitForIdle()
        assertNotNull("el menú no ofrece Pegar", toolbar.paste)
        toolbar.paste!!.invoke()
        compose.waitForIdle()
        assertEquals(copied, model.chatDraft.text)
    }

    @Test
    fun editKeepsTheSameChatAndTheArrowsSwitchVersions() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val conv = snap.conversation
        val state = base.copy(snapshot = snap.copy(
            capabilities = snap.capabilities.copy(messageActions = true, editInPlace = true),
            conversation = conv.copy(
                chat = com.aicowork.remote.data.model.OpenChat("ch1", "Demo"),
                messages = conv.messages.map { if (it.id == "m3") it.copy(versions = com.aicowork.remote.data.model.MessageVersions(1, listOf(com.aicowork.remote.data.model.VersionRef(0)))) else it },
            ),
        ))
        val controller = FakeController(state)
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasText("Haz la app Android"))

        // Editar: el texto vuelve al cuadro y, al enviarlo, va con editOf (mismo chat, sin copias).
        compose.onNodeWithText("Haz la app Android").performTouchInput { longClick(center) }
        compose.onNodeWithText("Editar").performClick()
        compose.waitForIdle()
        assertEquals("Haz la app Android", model.chatDraft.text)
        compose.onNodeWithTag("edit-bar").assertExists()
        model.chatDraft = androidx.compose.ui.text.input.TextFieldValue("Haz la app Android en Kotlin")
        compose.onNodeWithTag("send").performClick()
        compose.waitForIdle()
        assertTrue(controller.calls.toString(), "edit:m1:Haz la app Android en Kotlin" in controller.calls)
        assertTrue(controller.calls.none { it.startsWith("forkChatAt") })

        // ‹ 2/2 ›: la flecha de la izquierda pide la versión 1.
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("versions-m3"))
        compose.onNodeWithText("2/2").assertExists()
        compose.onNodeWithContentDescription("Versión anterior").performClick()
        compose.waitForIdle()
        assertTrue(controller.calls.toString(), "version:m3:0" in controller.calls)
    }
}
