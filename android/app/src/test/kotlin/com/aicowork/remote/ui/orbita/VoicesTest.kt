package com.aicowork.remote.ui.orbita

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Las voces de los agentes suenan como en el escritorio: mismo timbre por proveedor y una sílaba por letra. */
class VoicesTest {
    @Test
    fun eachProviderHasItsOwnVoiceAndTheBecarioSpeaksHigherAndFaster() {
        assertEquals(VoiceProfile(392.0, Wave.Triangle, 17.0, 0.10, 1.06), Voices.profile("hermes"))
        assertEquals(Wave.Square, Voices.profile("codex").wave)
        val boss = Voices.profile("claude")
        val becario = Voices.profile("claude", becario = true)
        assertEquals(boss.base * 1.5, becario.base, 1e-9)
        assertEquals(boss.rate * 1.2, becario.rate, 1e-9)
        // Uno desconocido recibe siempre la misma voz.
        assertEquals(Voices.profile("nuevo-agente"), Voices.profile("nuevo-agente"))
        assertNotEquals(Voices.profile("nuevo-agente"), Voices.profile("otro"))
    }

    @Test
    fun codeAndLinksAreNotPronounced() {
        assertEquals("Mira   y la web", Voices.spoken("Mira `npm test` y la [web](https://x.dev)"))
        assertEquals("Listo", Voices.spoken("```\ncodigo\n```Listo").trim())
        assertEquals("ver   ya", Voices.spoken("ver https://ejemplo.com ya"))
    }

    @Test
    fun oneSyllablePerLetterUpToALimit() {
        val p = Voices.profile("claude")
        assertNull(Voices.render(p, "… !!"))
        val short = Voices.render(p, "Hola")!!
        val longer = Voices.render(p, "Hola, reviso el formulario")!!
        assertTrue(longer.size > short.size)
        // Como mucho MAX_SYLLABLES letras: un texto enorme dura lo mismo que uno de ese tamaño.
        val capped = Voices.render(p, "a".repeat(500))!!
        val exact = Voices.render(p, "a".repeat(Voices.MAX_SYLLABLES))!!
        assertEquals(exact.size, capped.size)
        // Suena (no es silencio) y no satura.
        assertTrue(short.any { it.toInt() != 0 })
        assertTrue(longer.all { it.toInt() in -32767..32767 })
    }

    @Test
    fun theTextIsWrittenAtTheVoiceRhythmAndTheRestQuickly() {
        val rate = 10.0 // una sílaba cada 100 ms
        val t = Voices.revealTimes("Hola, sí", rate)
        // Cada letra a su sílaba; la coma hace una pausa y el espacio media.
        assertEquals(listOf(10.0, 110.0, 210.0, 310.0, 410.0, 510.0, 560.0, 660.0), t.toList())
        // Pasadas las sílabas que dice, lo que queda sale deprisa y como mucho en 1,5 s.
        val long = Voices.revealTimes("a".repeat(Voices.MAX_SYLLABLES) + "b".repeat(1000), rate)
        val spoken = long[Voices.MAX_SYLLABLES]
        assertEquals(10.0 + Voices.MAX_SYLLABLES * 100, spoken, 1e-9)
        assertTrue(long.last() - spoken <= 1500.0 + 1e-9)
        val reveal = Reveal("Hola", start = 1000, times = Voices.revealTimes("Hola", rate))
        assertEquals(listOf(0, 1, 2, 4), listOf(1000L, 1010L, 1150L, 2000L).map { reveal.visibleAt(it) })
    }

    @Test
    fun anErrorSoundsLower() {
        val p = Voices.profile("gemini")
        fun crossings(pcm: ShortArray) = pcm.toList().zipWithNext().count { (a, b) -> a < 0 && b >= 0 }
        assertTrue(crossings(Voices.render(p, "Fallo", error = true)!!) < crossings(Voices.render(p, "Fallo")!!))
    }
}
