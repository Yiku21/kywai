package com.aicowork.remote.ui.components

import com.aicowork.remote.i18n.t

import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import java.text.DateFormat
import java.util.Date
import com.aicowork.remote.i18n.I18n
import java.util.Locale
import kotlin.math.abs

object Format {
    fun relative(ms: Long?, now: Long = System.currentTimeMillis()): String {
        if (ms == null || ms <= 0) return ""
        val diff = now - ms
        val minutes = abs(diff) / 60_000
        val future = diff < 0
        val text = when {
            minutes < 1 -> return if (future) t("en un momento") else "ahora"
            minutes < 60 -> t("{minutes} min", "minutes" to minutes)
            minutes < 24 * 60 -> "${minutes / 60} h"
            minutes < 7 * 24 * 60 -> "${minutes / (24 * 60)} d"
            else -> return DateFormat.getDateInstance(DateFormat.MEDIUM, I18n.locale).format(Date(ms))
        }
        return if (future) t("en {text}", "text" to text) else t("hace {text}", "text" to text)
    }

    fun time(ms: Long?): String =
        if (ms == null || ms <= 0) "" else DateFormat.getTimeInstance(DateFormat.SHORT, I18n.locale).format(Date(ms))

    fun dateTime(ms: Long?): String =
        if (ms == null || ms <= 0) "—" else DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, I18n.locale).format(Date(ms))

    fun tokens(value: Long): String = when {
        value >= 1_000_000 -> String.format(I18n.locale, "%.1f M", value / 1_000_000.0)
        value >= 1_000 -> String.format(I18n.locale, "%.1f k", value / 1_000.0)
        else -> value.toString()
    }

    fun duration(fromMs: Long?, toMs: Long?): String? {
        if (fromMs == null || toMs == null || toMs < fromMs) return null
        val seconds = (toMs - fromMs) / 1000
        return when {
            seconds < 60 -> "$seconds s"
            seconds < 3600 -> t("{v1} min {v2} s", "v1" to seconds / 60, "v2" to seconds % 60)
            else -> t("{v1} h {v2} min", "v1" to (seconds / 3600), "v2" to ((seconds % 3600) / 60))
        }
    }

    fun percent(value: Double): String = "${value.toInt()} %"

    fun initials(name: String): String =
        name.split(' ', '-', '_').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
}

object Labels {
    fun activity(activity: String) = when (activity) {
        "idle" -> t("Libre")
        "thinking" -> t("Pensando")
        "working" -> t("Trabajando")
        "waiting" -> t("Esperando")
        "error" -> t("Con error")
        "offline" -> t("Sin conexión")
        else -> activity
    }

    fun taskStatus(status: String) = when (status) {
        "pending" -> t("Pendiente")
        "blocked" -> t("Bloqueada")
        "running" -> t("En curso")
        "done" -> t("Hecha")
        "failed" -> t("Falló")
        "cancelled" -> t("Detenida")
        else -> status
    }

    fun difficulty(value: String?) = when (value) {
        "easy" -> t("Fácil")
        "medium" -> t("Media")
        "hard" -> t("Difícil")
        else -> null
    }

    fun memoryKind(kind: String) = when (kind) {
        "decision" -> t("Decisión")
        "fact" -> t("Hecho")
        "preference" -> t("Preferencia")
        "pending" -> t("Pendiente")
        else -> kind
    }

    fun memoryStatus(status: String) = when (status) {
        "confirmed" -> t("Confirmada")
        "provisional" -> t("Provisional")
        "superseded" -> t("Sustituida")
        else -> status
    }

    fun quotaSource(source: String) = when (source) {
        "real" -> t("Dato real")
        "estimate" -> t("Estimación")
        "config" -> t("Presupuesto propio")
        "demo" -> t("Demostración")
        else -> t("Sin datos")
    }

    fun provider(provider: String) = when (provider) {
        "claude" -> "Claude"
        "codex" -> "Codex"
        "gemini" -> "Gemini"
        "qwen" -> "Qwen"
        "ollama" -> t("Ollama (local)")
        "lmstudio" -> t("LM Studio (local)")
        "hermes" -> "Hermes"
        "muse" -> "Muse Code"
        else -> provider
    }
}

/** Texto de la petición del usuario que originó [requestId] (para agrupar tareas y elegir qué detener). */
fun Snapshot.requestLabel(requestId: String?): String {
    if (requestId == null) return t("Sin petición")
    val text = conversation.messages.firstOrNull { it.requestId == requestId && it.author.isUser }?.text
    return text?.lineSequence()?.firstOrNull()?.take(80) ?: t("Petición {v1}", "v1" to requestId.take(8))
}

fun Snapshot.agentName(agentId: String?): String =
    agents.firstOrNull { it.id == agentId }?.name ?: agentId.orEmpty().ifEmpty { t("Sin asignar") }

fun Snapshot.tasksOf(requestId: String): List<TaskItem> = tasks.filter { it.requestId == requestId }
