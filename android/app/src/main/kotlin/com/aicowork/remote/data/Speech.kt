package com.aicowork.remote.data

import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.TaskWork

/** Algo que dice un agente: una frase de su tarea ([note]) o su texto; [reveal]: se escribe a la vez que habla. */
data class Said(val text: String, val note: Boolean = false, val reveal: Boolean = true)

/** Qué acaba de «decir» un agente en el chat, para su voz (como `audioEvents.ts` en el escritorio). */
object Speech {
    /** Un mensaje que no conocíamos y ya es viejo (se repite al reconectar) no suena. */
    private const val FRESH_MS = 20_000L

    private fun TaskWork.notes(): List<String> = steps.filter { it.kind == "note" }.mapNotNull { it.text?.trim()?.ifEmpty { null } }

    /**
     * Lo nuevo de [message] respecto a como estaba ([previous]): cada frase que cuenta mientras hace su tarea y su
     * texto (entero, si llega de golpe; lo que crece, si llega por trozos). El texto final de una tarea es su última
     * frase, que ya sonó: no se repite.
     */
    fun newlySaid(previous: ChatMessage?, message: ChatMessage, now: Long): List<Said> {
        if (previous == null && (message.createdAt ?: now) < now - FRESH_MS) return emptyList()
        val oldNotes = previous?.work?.notes().orEmpty().toSet()
        val notes = message.work?.notes().orEmpty()
        val said = notes.filter { it !in oldNotes }.map { Said(it, note = true) }.toMutableList()
        val oldText = previous?.text.orEmpty()
        val text = message.text
        when {
            text.isBlank() || text == oldText -> Unit
            oldText.isNotEmpty() && text.startsWith(oldText) -> said += Said(text.substring(oldText.length).trim(), reveal = false)
            message.work == null || text.trim() !in oldNotes + notes -> said += Said(text.trim())
        }
        return said.filter { it.text.isNotBlank() }
    }
}
