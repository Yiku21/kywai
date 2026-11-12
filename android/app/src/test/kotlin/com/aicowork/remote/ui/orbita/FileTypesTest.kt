package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Artifact
import org.junit.Assert.assertEquals
import org.junit.Test

/** Misma regla que src/shared/fileTypes.test.ts del escritorio. */
class FileTypesTest {
    @Test
    fun reconoceElTipoPorLaExtension() {
        assertEquals(FileType.Video, FileTypes.of("videos/where-your-ai-quota-lives.MP4"))
        assertEquals(FileType.Image, FileTypes.of("portada.png"))
        assertEquals(FileType.Audio, FileTypes.of("voz/escena-1.mp3"))
        assertEquals(FileType.Document, FileTypes.of("informe.pdf"))
        assertEquals(FileType.Document, FileTypes.of("index.html"))
        assertEquals(FileType.Code, FileTypes.of("beats.json"))
        assertEquals(FileType.Other, FileTypes.of("paquete.zip"))
    }

    @Test
    fun sinExtensionUsaElMimeYLaClase() {
        assertEquals(FileType.Audio, FileTypes.of("nota-de-voz.webm", "audio/webm"))
        assertEquals(FileType.Image, FileTypes.of("foto", "image/jpeg"))
        assertEquals(FileType.Document, FileTypes.of(Artifact(id = "a", name = "notas", kind = "markdown")))
        assertEquals(FileType.Code, FileTypes.of(Artifact(id = "b", name = "script", kind = "code")))
    }
}
