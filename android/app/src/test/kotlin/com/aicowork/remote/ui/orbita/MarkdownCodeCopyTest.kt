package com.aicowork.remote.ui.orbita

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.AnnotatedString
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Cada bloque de código o de comandos del chat lleva su botón de copiar en la esquina, como en Claude y ChatGPT. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MarkdownCodeCopyTest {
    @get:Rule
    val compose = createComposeRule()

    private class Clipboard : ClipboardManager {
        var copied: AnnotatedString? = null
        override fun setText(annotatedString: AnnotatedString) {
            copied = annotatedString
        }
        override fun getText() = copied
    }

    @Test
    fun oneTapCopiesTheBlockAsIs() {
        val clipboard = Clipboard()
        compose.setContent {
            CompositionLocalProvider(LocalClipboardManager provides clipboard) {
                MarkdownText("Entra:\n\n```bash\napt update && apt install -y samba\nuseradd -M invitado\n```\n\nY luego `ls`.")
            }
        }
        compose.onAllNodesWithTag("code-copy").assertCountEquals(1)
        compose.onNodeWithContentDescription("Copiar el código").performClick()
        assertEquals("apt update && apt install -y samba\nuseradd -M invitado", clipboard.copied?.text)
        compose.onNodeWithContentDescription("Copiado").assertExists()
    }
}
