package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Artifact
import org.junit.Assert.assertEquals
import org.junit.Test

/** Resultados en carpetas: la misma regla que el escritorio (src/shared/resultGroups.test.ts). */
class ResultGroupsTest {
    private var n = 0
    private fun art(rel: String, kind: String, at: Long, task: String? = null) =
        Artifact(id = "a${++n}", taskId = task, agentId = "claude", name = rel.substringAfterLast('/'), relPath = rel, kind = kind, createdAt = at)

    @Test
    fun elVideoMandaYLoDemasEsDeTrabajo() {
        val (main, work) = ResultGroups.splitMain(listOf(
            art("v/escena-2.png", "image", 10), art("v/escena-10.png", "image", 11), art("v/escena-1.png", "image", 12),
            art("v/voz-1.wav", "other", 13), art("v/guion.json", "code", 14), art("v/nino.mp4", "other", 20),
        ))
        assertEquals(listOf("nino.mp4"), main.map { it.name })
        assertEquals(listOf("escena-1.png", "escena-2.png", "escena-10.png", "guion.json", "voz-1.wav"), work.map { it.name })
    }

    @Test
    fun siTodoEsCodigoNoEscondeNada() {
        val (main, work) = ResultGroups.splitMain(listOf(art("s/b.ts", "code", 1), art("s/a.ts", "code", 2)))
        assertEquals(listOf("a.ts", "b.ts"), main.map { it.name })
        assertEquals(emptyList<Artifact>(), work)
    }

    @Test
    fun unaCarpetaPorTareaYLaMasRecientePrimero() {
        val groups = ResultGroups.group(listOf(
            art("video/nino/escena-1.png", "image", 10, "t1"),
            art("video/nino/nino.mp4", "other", 30, "t1"),
            art("informes/q3/informe.pdf", "other", 40),
            art("artifacts/suelto.md", "markdown", 5),
            art("otra/cosa.png", "image", 50, "vieja"),
        )) { if (it == "t1") "Vídeo: el niño" else null }
        assertEquals(listOf("task:vieja", "dir:informes/q3", "task:t1", "dir:artifacts"), groups.map { it.key })
        assertEquals(listOf("otra", "q3", "Vídeo: el niño", "Otros archivos"), groups.map { it.title })
        assertEquals("nino.mp4", groups[2].main.first().name)
        assertEquals(30L, groups[2].newest)
    }
}
