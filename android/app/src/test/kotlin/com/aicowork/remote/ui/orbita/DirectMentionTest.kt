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
        assertNull(DirectMention.target("Pregunta a @Qwen", targets))
    }

    @Test
    fun sugiereMientrasSeEscribe() {
        assertEquals(3, targets.size)
        assertEquals(DirectMention.Query("@", "Qw"), DirectMention.query("@Qw"))
        assertEquals(DirectMention.Query("/directo ", "cl"), DirectMention.query("/directo cl"))
        assertNull(DirectMention.query("@Qwen hola"))
        assertEquals(listOf("lmstudio"), DirectMention.matches("stu", targets).map { it.id })
        assertEquals("@LMStudio ", DirectMention.text("@", targets[1]))
        assertEquals("/directo Qwen ", DirectMention.text("/directo ", targets[0]))
    }
}
