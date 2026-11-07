package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.i18n.I18n
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar

/** Texto del buscador y grupos del Historial, igual que en el escritorio. */
class SearchTextTest {
    @Test
    fun separaPalabrasYFrasesEntreComillas() {
        assertEquals(listOf("barra", "lateral"), searchTerms("Barra  LATERAL"))
        assertEquals(listOf("modo oscuro", "boton"), searchTerms("«modo oscuro» botón"))
        assertEquals(emptyList<String>(), searchTerms("x"))
    }

    @Test
    fun marcaSinTildesNiMayusculas() {
        assertEquals(listOf(3 until 15), findRanges("La Verificación", listOf("verificacion")))
        assertEquals(listOf(0 until 5), findRanges("abcdef", listOf("abc", "cde")))
    }

    @Test
    fun agrupaPorFecha() {
        I18n.setForTests("es")
        val now = Calendar.getInstance().apply { set(2026, 10, 7, 18, 0) }.timeInMillis
        val day = 86_400_000L
        fun c(id: String, at: Long) = ChatSummary(id, "p", id, at, at, 1)
        val groups = groupChatsByDate(listOf(c("vieja", now - 120 * day), c("hoy", now - 3_600_000), c("ayer", now - day), c("semana", now - 4 * day), c("mes", now - 20 * day)), now)
        assertEquals(listOf("today", "yesterday", "week", "month"), groups.take(4).map { it.key })
        assertEquals(listOf("hoy", "ayer", "semana", "mes", "vieja"), groups.flatMap { g -> g.chats.map { it.id } })
    }
}
