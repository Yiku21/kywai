package com.aicowork.remote.ui.components

import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

object Format {
    fun relative(ms: Long?, now: Long = System.currentTimeMillis()): String {
        if (ms == null || ms <= 0) return ""
        val diff = now - ms
        val minutes = abs(diff) / 60_000
        val future = diff < 0
        val text = when {
            minutes < 1 -> return if (future) "en un momento" else "ahora"
            minutes < 60 -> "$minutes min"
            minutes < 24 * 60 -> "${minutes / 60} h"
            minutes < 7 * 24 * 60 -> "${minutes / (24 * 60)} d"
            else -> return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(Date(ms))
        }
        return if (future) "en $text" else "hace $text"
    }

    fun time(ms: Long?): String =
        if (ms == null || ms <= 0) "" else DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(Date(ms))

    fun dateTime(ms: Long?): String =
        if (ms == null || ms <= 0) "—" else DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.getDefault()).format(Date(ms))

    fun tokens(value: Long): String = when {
        value >= 1_000_000 -> String.format(Locale.getDefault(), "%.1f M", value / 1_000_000.0)
        value >= 1_000 -> String.format(Locale.getDefault(), "%.1f k", value / 1_000.0)
        else -> value.toString()
    }

    fun duration(fromMs: Long?, toMs: Long?): String? {
        if (fromMs == null || toMs == null || toMs < fromMs) return null
        val seconds = (toMs - fromMs) / 1000
        return when {
            seconds < 60 -> "$seconds s"
            seconds < 3600 -> "${seconds / 60} min ${seconds % 60} s"
            else -> "${seconds / 3600} h ${(seconds % 3600) / 60} min"
        }
    }

    fun percent(value: Double): String = "${value.toInt()} %"

    fun initials(name: String): String =
        name.split(' ', '-', '_').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
}

object Labels {
    fun activity(activity: String) = when (activity) {
        "idle" -> "Libre"
        "thinking" -> "Pensando"
        "working" -> "Trabajando"
        "waiting" -> "Esperando"
        "error" -> "Con error"
        "offline" -> "Sin conexión"
        else -> activity
    }

    fun taskStatus(status: String) = when (status) {
        "pending" -> "Pendiente"
        "blocked" -> "Bloqueada"
        "running" -> "En curso"
        "done" -> "Hecha"
        "failed" -> "Falló"
        "cancelled" -> "Detenida"
        else -> status
    }

    fun difficulty(value: String?) = when (value) {
        "easy" -> "Fácil"
        "medium" -> "Media"
        "hard" -> "Difícil"
        else -> null
    }

    fun memoryKind(kind: String) = when (kind) {
        "decision" -> "Decisión"
        "fact" -> "Hecho"
        "preference" -> "Preferencia"
        "pending" -> "Pendiente"
        else -> kind
    }

    fun memoryStatus(status: String) = when (status) {
        "confirmed" -> "Confirmada"
        "provisional" -> "Provisional"
        "superseded" -> "Sustituida"
        else -> status
    }

    fun quotaSource(source: String) = when (source) {
        "real" -> "Dato real"
        "estimate" -> "Estimación"
        "config" -> "Presupuesto propio"
        "demo" -> "Demostración"
        else -> "Sin datos"
    }

    fun provider(provider: String) = when (provider) {
        "claude" -> "Claude"
        "codex" -> "Codex"
        "gemini" -> "Gemini"
        "qwen" -> "Qwen"
        "ollama" -> "Ollama (local)"
        "lmstudio" -> "LM Studio (local)"
        "hermes" -> "Hermes"
        "muse" -> "Muse Code"
        else -> provider
    }
}

/** Texto de la petición del usuario que originó [requestId] (para agrupar tareas y elegir qué detener). */
fun Snapshot.requestLabel(requestId: String?): String {
    if (requestId == null) return "Sin petición"
    val text = conversation.messages.firstOrNull { it.requestId == requestId && it.author.isUser }?.text
    return text?.lineSequence()?.firstOrNull()?.take(80) ?: "Petición ${requestId.take(8)}"
}

fun Snapshot.agentName(agentId: String?): String =
    agents.firstOrNull { it.id == agentId }?.name ?: agentId.orEmpty().ifEmpty { "Sin asignar" }

fun Snapshot.tasksOf(requestId: String): List<TaskItem> = tasks.filter { it.requestId == requestId }
