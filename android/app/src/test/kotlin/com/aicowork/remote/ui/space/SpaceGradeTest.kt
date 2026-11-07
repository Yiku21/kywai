package com.aicowork.remote.ui.space

import com.aicowork.remote.ui.orbita.OrbitaThemes
import com.aicowork.remote.ui.space.gl.Shaders
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class SpaceGradeTest {
    private fun close(expected: Int, actual: Int, tolerance: Int = 6) {
        for (sh in listOf(16, 8, 0)) {
            val e = (expected shr sh) and 0xFF
            val a = (actual shr sh) and 0xFF
            assertTrue("%06X frente a %06X".format(expected and 0xFFFFFF, actual and 0xFFFFFF), abs(e - a) <= tolerance)
        }
    }

    @Test
    fun theClassicColorsBecomeTheThemeOnes() {
        val grafito = SpaceGrade.of("grafito")!!
        close(0xFFD9A24A.toInt(), grafito.apply(0xFF3F7BFF.toInt()))
        close(0xFFF0C070.toInt(), grafito.apply(0xFF38D6FF.toInt()))
        close(0xFF0C0D0F.toInt(), grafito.apply(0xFF04051A.toInt()), tolerance = 3)
        // Fuera de la gama de azules no cambia nada (rojos de error, naranjas, verdes de «hecho»).
        assertEquals(0xFFFF6B7A.toInt(), grafito.apply(0xFFFF6B7A.toInt()))
        assertEquals(0xFF5FF0A6.toInt(), grafito.apply(0xFF5FF0A6.toInt()))
    }

    @Test
    fun mapsUseTheColorsOfTheirNameAndTheClassicIsUntouched() {
        assertNull(SpaceGrade.of(null))
        assertNull(SpaceGrade.of("clasico"))
        assertNull(SpaceGrade.of("orbita"))
        assertNull(SpaceGrade.of("tema-que-no-existe"))
        close(0xFF7FD6A0.toInt(), SpaceGrade.of("mundo-bosque")!!.apply(0xFF3F7BFF.toInt()))
        assertTrue(SpaceGrade.of("mundo-orbita") != null)
        // En los temas claros el espacio sigue siendo de noche.
        val marfil = SpaceGrade.of("marfil")!!.apply(0xFF04051A.toInt())
        assertTrue(((marfil shr 8) and 0xFF) < 60)
    }

    @Test
    fun theShaderGetsTheThemeOnlyWhenThereIsOne() {
        assertEquals(Shaders.BASIC_FS, Shaders.themed(Shaders.BASIC_FS, null))
        val themed = Shaders.themed(Shaders.BASIC_FS, SpaceGrade.of("eva"))
        assertFalse("/*THEME*/" in themed)
        assertTrue("themeRgb(o)" in themed)
    }

    @Test
    fun theInterfaceFollowsTheThemeOfTheComputer() {
        assertEquals(OrbitaThemes.Default, OrbitaThemes.tokens(null))
        assertEquals(OrbitaThemes.Default, OrbitaThemes.tokens("algo-raro"))
        assertEquals(0xFFE0A34A, OrbitaThemes.tokens("grafito").accent)
        // Un mapa usa los colores de la interfaz del color con su nombre, como el escritorio.
        assertEquals(OrbitaThemes.tokens("bosque"), OrbitaThemes.tokens("mundo-bosque"))
        assertTrue(OrbitaThemes.tokens("marfil").light)
        assertNotEquals(OrbitaThemes.tokens("clasico"), OrbitaThemes.Default)
    }
}
