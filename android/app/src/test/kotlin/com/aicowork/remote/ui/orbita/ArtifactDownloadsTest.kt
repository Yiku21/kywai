package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.net.RawContent
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ArtifactDownloadsTest {
    private val first = Artifact("a", name = "concepto ñ.md", relPath = "tema/concepto ñ.md")
    private val second = Artifact("b", name = "imagen.png", relPath = "tema/imagen.png")
    private val content = mapOf("a" to "# Diseño\n".toByteArray(), "b" to byteArrayOf(0, 1, -1, 9, 0, -128))

    @Test fun `un archivo conserva sus bytes originales`() = runBlocking {
        val out = ByteArrayOutputStream()
        writeArtifactSelection(listOf(second), { Result.success(RawContent(content.getValue(it), "application/octet-stream")) }, out)
        assertArrayEquals(content["b"], out.toByteArray())
    }

    @Test fun `el zip solo contiene los archivos seleccionados con sus nombres y contenido`() = runBlocking {
        val out = ByteArrayOutputStream()
        val requested = mutableListOf<String>()
        writeArtifactSelection(listOf(first, second), { requested += it; Result.success(RawContent(content.getValue(it), "application/octet-stream")) }, out)
        val found = mutableMapOf<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(out.toByteArray())).use { zip ->
            while (true) { val entry = zip.nextEntry ?: break; found[entry.name] = zip.readBytes() }
        }
        assertEquals(listOf("a", "b"), requested)
        assertEquals(setOf(first.name, second.name), found.keys)
        assertArrayEquals(content["a"], found[first.name])
        assertArrayEquals(content["b"], found[second.name])
    }

    @Test fun `rechaza rutas que escapan al extraer y nombres duplicados`() {
        assertThrows(IllegalArgumentException::class.java) { artifactDownloadNames(listOf(first.copy(relPath = "../privado.txt"))) }
        assertThrows(IllegalArgumentException::class.java) { artifactDownloadNames(listOf(first, first.copy(id = "otra"))) }
    }
}
