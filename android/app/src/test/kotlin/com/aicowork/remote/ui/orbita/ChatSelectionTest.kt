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
import androidx.compose.ui.test.hasText
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

/** En el chat, manteniendo el dedo sobre un mensaje se selecciona su texto para copiarlo, y en la caja de escribir se pega. */
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
    fun aLongPressOnAMessageSelectsItsTextToCopyAndTheComposerPastesIt() {
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

        // Mantener el dedo sobre una palabra la selecciona y ofrece Copiar.
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
}
