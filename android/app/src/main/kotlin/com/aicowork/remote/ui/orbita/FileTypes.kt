package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Artifact

/**
 * Tipo de archivo para filtrar Resultados (Fotos, Vídeos, Audio, Documentos, Código, Otros). Es la misma regla que el
 * escritorio (src/shared/fileTypes.ts): si cambias una, cambia la otra.
 */
enum class FileType { Image, Video, Audio, Document, Code, Other }

object FileTypes {
    private val ext: Map<String, FileType> = buildMap {
        listOf("png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico", "heic", "heif", "tif", "tiff").forEach { put(it, FileType.Image) }
        listOf("mp4", "mov", "webm", "mkv", "m4v", "avi", "mpg", "mpeg", "wmv", "3gp").forEach { put(it, FileType.Video) }
        listOf("mp3", "wav", "m4a", "ogg", "oga", "opus", "flac", "aac", "aiff", "aif", "wma", "mid", "midi").forEach { put(it, FileType.Audio) }
        listOf(
            "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "markdown", "ppt", "pptx", "odp", "key", "xls", "xlsx", "ods",
            "csv", "tsv", "epub", "pages", "numbers", "html", "htm", "srt", "vtt",
        ).forEach { put(it, FileType.Document) }
        listOf(
            "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cpp", "hpp",
            "cs", "php", "sh", "bash", "zsh", "ps1", "bat", "sql", "json", "jsonl", "yaml", "yml", "toml", "xml", "css", "scss",
            "less", "vue", "svelte", "lua", "r", "dart", "ini", "env", "gradle", "ipynb",
        ).forEach { put(it, FileType.Code) }
    }

    private fun extOf(name: String): String {
        val base = name.replace('\\', '/').substringAfterLast('/')
        val i = base.lastIndexOf('.')
        return if (i > 0) base.substring(i + 1).lowercase() else ""
    }

    /** Un MIME de imagen, vídeo o audio manda; si no, la extensión; y si tampoco, la clase que le dio el equipo. */
    fun of(name: String, mime: String? = null, kind: String? = null): FileType {
        when {
            mime?.startsWith("image/") == true -> return FileType.Image
            mime?.startsWith("video/") == true -> return FileType.Video
            mime?.startsWith("audio/") == true -> return FileType.Audio
        }
        ext[extOf(name)]?.let { return it }
        if (mime == "application/pdf" || mime?.startsWith("text/") == true) return FileType.Document
        return when (kind) {
            "image" -> FileType.Image
            "html", "markdown", "text" -> FileType.Document
            "code" -> FileType.Code
            else -> FileType.Other
        }
    }

    fun of(a: Artifact): FileType = of(a.name.ifEmpty { a.relPath }, null, a.kind)
}
