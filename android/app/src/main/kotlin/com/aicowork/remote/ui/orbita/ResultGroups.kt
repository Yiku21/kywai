package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.i18n.t

/**
 * Pestaña Resultados agrupada en carpetas: una por tarea, con el resultado principal delante y los archivos de trabajo
 * (escenas, voces, json, código…) aparte. Es la misma regla que el escritorio (src/shared/resultGroups.ts): si cambias
 * una, cambia la otra.
 */
data class ResultGroup(
    /** Clave estable para recordar si está abierta: «task:<id>» o «dir:<carpeta>». */
    val key: String,
    val title: String,
    val taskId: String?,
    /** El vídeo, la página o el documento final (lo más nuevo primero). */
    val main: List<Artifact>,
    /** Archivos de trabajo, plegados aparte (por nombre). Vacío si todo es principal. */
    val work: List<Artifact>,
    val newest: Long,
) {
    val all: List<Artifact> get() = main + work
}

object ResultGroups {
    private val video = Regex("""\.(mp4|mov|webm|mkv|m4v|avi)$""", RegexOption.IGNORE_CASE)
    private val page = Regex("""\.(html?|pdf|docx?|pptx?|xlsx?|odt|key|pages|epub)$""", RegexOption.IGNORE_CASE)
    private val media = Regex("""\.(png|jpe?g|webp|gif|svg|avif|mp3|wav|m4a|ogg|flac|md|markdown)$""", RegexOption.IGNORE_CASE)

    /** 3 vídeo, 2 página o documento final, 1 imagen, audio o Markdown, 0 lo demás (código, json, textos). */
    fun weight(a: Artifact): Int {
        val name = a.name.ifEmpty { a.relPath }
        return when {
            video.containsMatchIn(name) -> 3
            a.kind == "html" || page.containsMatchIn(name) -> 2
            a.kind == "image" || a.kind == "markdown" || media.containsMatchIn(name) -> 1
            else -> 0
        }
    }

    /** Orden natural por nombre: escena-2 antes que escena-10. */
    private val byName = Comparator<Artifact> { x, y -> naturalCompare(x.name, y.name) }

    private fun naturalCompare(a: String, b: String): Int {
        val ra = Regex("""\d+|\D+""").findAll(a.lowercase()).map { it.value }.toList()
        val rb = Regex("""\d+|\D+""").findAll(b.lowercase()).map { it.value }.toList()
        for (i in 0 until minOf(ra.size, rb.size)) {
            val x = ra[i]; val y = rb[i]
            val c = if (x[0].isDigit() && y[0].isDigit()) (x.toBigInteger().compareTo(y.toBigInteger())) else x.compareTo(y)
            if (c != 0) return c
        }
        return ra.size - rb.size
    }

    fun splitMain(list: List<Artifact>): Pair<List<Artifact>, List<Artifact>> {
        val top = list.maxOfOrNull { weight(it) } ?: 0
        if (top == 0) return list.sortedWith(byName) to emptyList()
        val main = list.filter { weight(it) == top }.sortedWith(compareByDescending<Artifact> { it.createdAt ?: 0 }.then(byName))
        val work = list.filter { weight(it) != top }.sortedWith(byName)
        return main to work
    }

    private fun dirOf(relPath: String) = relPath.replace('\\', '/').split('/').filter { it.isNotEmpty() }.dropLast(1).joinToString("/")

    /** Una carpeta por tarea (con su título) y, lo que no viene de una tarea, por la carpeta del disco. */
    fun group(artifacts: List<Artifact>, taskTitle: (String) -> String?): List<ResultGroup> {
        val groups = LinkedHashMap<String, Triple<String, String?, MutableList<Artifact>>>()
        for (a in artifacts) {
            val dir = dirOf(a.relPath)
            val key = a.taskId?.let { "task:$it" } ?: "dir:$dir"
            val g = groups.getOrPut(key) {
                val title = a.taskId?.let(taskTitle)?.trim()?.takeIf { it.isNotEmpty() }
                    ?: if (dir.isNotEmpty() && dir != "artifacts") Deliverables.folderName(dir) else t("Otros archivos")
                Triple(title, a.taskId, mutableListOf())
            }
            g.third.add(a)
        }
        return groups.map { (key, g) ->
            val (main, work) = splitMain(g.third)
            ResultGroup(key, g.first, g.second, main, work, g.third.maxOf { it.createdAt ?: 0 })
        }.sortedByDescending { it.newest }
    }
}
