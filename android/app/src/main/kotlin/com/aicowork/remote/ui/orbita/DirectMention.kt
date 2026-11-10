package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Agent
import java.text.Normalizer

/**
 * Mensaje directo a un agente: «@Qwen hola», «revisa esto @Qwen» o «/directo Qwen hola». El servidor manda el texto
 * a ese agente, sin pasar por el plan de Hermes. Copia de src/shared/directMessage.ts: si cambian las reglas,
 * cambiarlas en los dos.
 */
object DirectMention {
    private val COMMAND = Regex("^/(directo|direct|dm)\\s+", RegexOption.IGNORE_CASE)
    private val COMMAND_QUERY = Regex("^(/(?:directo|direct|dm)\\s+)([^\\s:,]*)$", RegexOption.IGNORE_CASE)
    /** Una «@» al principio o detrás de un espacio o un signo: «yo@correo.com» no cuenta. */
    private val AT = Regex("(^|[^\\p{L}\\p{N}_.@+\\-])@")
    private val AT_QUERY = Regex("(^|[^\\p{L}\\p{N}_.@+\\-])@([^\\s:,@]*)$")
    private val CODE = Regex("```[\\s\\S]*?(```|$)|`[^`\\n]*`")

    /** Lo que se está escribiendo como agente antes del cursor: «revisa @Qw» → ("@", "Qw", 7, 10). */
    data class Query(val prefix: String, val query: String, val start: Int = 0, val end: Int = 0)

    private fun fold(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

    private fun keysOf(a: Agent): List<String> =
        listOf(a.name.trim(), a.name.replace(Regex("\\s+"), ""), a.id).filter { it.isNotEmpty() }.distinct()

    /** El código («`…`» y «```…```») tapado con espacios: una «@» dentro de código no es una mención. */
    private fun maskCode(text: String): String = CODE.replace(text) { " ".repeat(it.value.length) }

    /** Agentes a los que se puede escribir: los del equipo, sin becarios. */
    fun targets(agents: List<Agent>): List<Agent> = agents.filter { it.enabled && !it.isSubagent }

    /** Lo que se escribe justo antes del cursor (sin cursor, al final). Vale al principio, en medio o al final. */
    fun query(text: String, caret: Int = text.length): Query? {
        val at = caret.coerceIn(0, text.length)
        val before = text.substring(0, at)
        // Con el cursor en medio de una palabra no se abre la lista.
        if (at < text.length && !text[at].isWhitespace()) return null
        COMMAND_QUERY.find(before)?.let { return Query(it.groupValues[1], it.groupValues[2], 0, at) }
        AT_QUERY.find(maskCode(before))?.let {
            val start = it.range.first + it.groupValues[1].length
            return Query("@", before.substring(start + 1), start, at)
        }
        return null
    }

    /** Los que encajan con lo escrito (por el principio de su nombre, de una palabra o de su id). */
    fun matches(query: String, agents: List<Agent>): List<Agent> {
        val q = fold(query)
        if (q.isEmpty()) return agents
        return agents.filter { a -> keysOf(a).any { fold(it).startsWith(q) } || fold(a.name).split(Regex("\\s+")).any { it.startsWith(q) } }
    }

    /** Cómo queda el cuadro al elegir un agente: «@Nombre » con el nombre sin espacios. */
    fun text(prefix: String, a: Agent): String = (if (prefix.startsWith("@")) "@" else prefix) + a.name.replace(Regex("\\s+"), "") + " "

    /** El cuadro tras elegir un agente: «@Nombre » donde estaba lo escrito, y dónde queda el cursor. */
    fun insert(text: String, q: Query, a: Agent): Pair<String, Int> {
        val head = text.substring(0, q.start) + text(q.prefix, a)
        val tail = text.substring(q.end.coerceIn(q.start, text.length)).removePrefix(" ")
        return (head + tail) to head.length
    }

    /** Detrás del nombre: nada, un espacio, «:», «,» o un signo que cierra la frase («@Qwen.», no «@Qwen.ts»). */
    private fun endsName(rest: String, at: Int): Boolean {
        val next = rest.getOrNull(at) ?: return true
        if (next.isWhitespace() || next == ':' || next == ',') return true
        val after = rest.getOrNull(at + 1)
        return next in ".!?;)]»\"'" && (after == null || !(after.isLetterOrDigit() || after == '_'))
    }

    private fun matchAgent(rest: String, agents: List<Agent>): Agent? {
        var best: Pair<Agent, Int>? = null
        for (a in agents) for (k in keysOf(a)) {
            if (rest.length < k.length || fold(rest.substring(0, k.length)) != fold(k)) continue
            if (!endsName(rest, k.length)) continue
            if (best == null || k.length > best.second) best = a to k.length
        }
        return best?.first
    }

    /**
     * El agente al que va directo el mensaje, o null si es un mensaje normal para el equipo. La mención puede ir en
     * cualquier sitio; si se nombra a dos agentes distintos, va a Hermes.
     */
    fun target(raw: String, agents: List<Agent>): Agent? {
        val text = raw.trimStart()
        COMMAND.find(text)?.let { return matchAgent(text.substring(it.value.length), agents) }
        val masked = maskCode(text)
        val found = AT.findAll(masked).mapNotNull { m ->
            val start = m.range.first + m.groupValues[1].length
            matchAgent(masked.substring(start + 1), agents)
        }.distinctBy { it.id }.toList()
        return found.singleOrNull()
    }
}
