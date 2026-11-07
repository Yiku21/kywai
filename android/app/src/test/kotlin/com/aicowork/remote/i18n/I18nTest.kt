package com.aicowork.remote.i18n

import java.io.File
import java.util.Locale
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cada texto marcado con t("…") tiene su traducción al inglés, con los mismos {huecos}. */
class I18nTest {
    @After
    fun back() = I18n.setForTests("es")

    private val call = Regex("""(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"""")
    private val hole = Regex("\\{(\\w+)\\}")

    private fun unescape(s: String) = s.replace(Regex("""\\(.)""")) { m ->
        when (val c = m.groupValues[1]) { "n" -> "\n"; "t" -> "\t"; else -> c }
    }

    private fun keys(): Set<String> {
        val root = listOf(File("src/main/kotlin"), File("app/src/main/kotlin")).first { it.isDirectory }
        return root.walkTopDown().filter { it.isFile && it.extension == "kt" && it.name != "I18nEn.kt" }
            .flatMap { f -> call.findAll(f.readText()).map { unescape(it.groupValues[1]) } }
            .toSet()
    }

    @Test
    fun everyTextHasItsEnglishVersion() {
        val keys = keys()
        assertTrue("no se encontró ningún t(\"…\")", keys.size > 100)
        val missing = keys.filter { it !in EN }
        assertTrue("Sin traducir al inglés (añádelos a I18nEn.kt):\n" + missing.joinToString("\n"), missing.isEmpty())
        val holes = keys.filter { k -> hole.findAll(k).map { it.value }.toSet() != hole.findAll(EN.getValue(k)).map { it.value }.toSet() }
        assertTrue("Los huecos {…} no coinciden:\n" + holes.joinToString("\n"), holes.isEmpty())
        val unused = EN.keys - keys
        assertTrue("Sobran en I18nEn.kt:\n" + unused.joinToString("\n"), unused.isEmpty())
    }

    @Test
    fun translatesAndFillsHoles() {
        assertEquals("Hace 5 min", t("Hace {n} min", "n" to 5))
        I18n.setForTests("en")
        assertEquals("5 min ago", t("Hace {n} min", "n" to 5))
        assertEquals("Texto que no está", t("Texto que no está"))
        assertEquals(Locale.US, I18n.locale)
    }

    @Test
    fun systemChoiceFollowsThePhone() {
        assertEquals("es", I18n.resolve(AppLanguage.System, Locale.forLanguageTag("es-MX")))
        assertEquals("en", I18n.resolve(AppLanguage.System, Locale.FRANCE))
        assertEquals("es", I18n.resolve(AppLanguage.Es, Locale.US))
        assertEquals("en", I18n.resolve(AppLanguage.En, Locale.forLanguageTag("es-ES")))
    }
}
