package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Agent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Las mismas reglas que src/shared/directMessage.test.ts del servidor. */
class DirectMentionTest {
    private val agents = listOf(
        Agent(id = "qwen", name = "Qwen"),
        Agent(id = "lmstudio", name = "LM Studio"),
        Agent(id = "claude", name = "Claude"),
        Agent(id = "becario", name = "Becario", isSubagent = true),
    )
    private val targets = DirectMention.targets(agents)

    @Test
    fun reconoceElAgente() {
        assertEquals("qwen", DirectMention.target("@Qwen hola", targets)?.id)
        assertEquals("qwen", DirectMention.target("  @qwen: hola", targets)?.id)
        assertEquals("lmstudio", DirectMention.target("@LM Studio hola", targets)?.id)
        assertEquals("lmstudio", DirectMention.target("@LMStudio hola", targets)?.id)
        assertEquals("claude", DirectMention.target("/directo Claude revisa", targets)?.id)
        assertNull(DirectMention.target("@Qwen3 hola", targets))
        assertNull(DirectMention.target("@alguien hola", targets))
        assertNull(DirectMention.target("Escribe a qwen@correo.com", targets))
        assertNull(DirectMention.target("Mira `@Qwen` en el código", targets))
    }

    @Test
    fun reconoceLaMencionEnMedioOAlFinal() {
        assertEquals("qwen", DirectMention.target("Pregunta a @Qwen qué opina", targets)?.id)
        assertEquals("claude", DirectMention.target("Revisa el archivo y dime qué ves @Claude", targets)?.id)
        assertEquals("claude", DirectMention.target("¿Lo miras tú, @Claude?", targets)?.id)
        assertNull(DirectMention.target("Que lo haga @Qwen y lo revise @Claude", targets))
        assertNull(DirectMention.target("Abre @Qwen.ts", targets))
    }

    @Test
    fun sugiereEnMedioDelMensaje() {
        assertEquals(DirectMention.Query("@", "Qw", 12, 15), DirectMention.query("revisa esto @Qw"))
        assertEquals(DirectMention.Query("@", "", 11, 12), DirectMention.query("pregunta a @ qué opina", 12))
        assertNull(DirectMention.query("pregunta a @Qw", 13))
        assertNull(DirectMention.query("escribe a yo@cor"))
        val text = "pregunta a @q qué opina"
        val q = DirectMention.query(text, 13)!!
        assertEquals("pregunta a @Qwen qué opina" to 17, DirectMention.insert(text, q, targets[0]))
    }

    @Test
    fun sugiereMientrasSeEscribe() {
        assertEquals(3, targets.size)
        assertEquals(DirectMention.Query("@", "Qw", 0, 3), DirectMention.query("@Qw"))
        assertEquals(DirectMention.Query("/directo ", "cl", 0, 11), DirectMention.query("/directo cl"))
        assertNull(DirectMention.query("@Qwen hola"))
        assertEquals(listOf("lmstudio"), DirectMention.matches("stu", targets).map { it.id })
        assertEquals("@LMStudio ", DirectMention.text("@", targets[1]))
        assertEquals("/directo Qwen ", DirectMention.text("/directo ", targets[0]))
    }
}
