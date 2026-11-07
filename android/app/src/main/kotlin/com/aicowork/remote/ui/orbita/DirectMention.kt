package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Agent
import java.text.Normalizer

/**
 * Mensaje directo a un agente: «@Qwen hola» o «/directo Qwen hola». El servidor manda el texto tal cual a ese agente,
 * sin pasar por el plan de Hermes. Copia de src/shared/directMessage.ts: si cambian las reglas, cambiarlas en los dos.
 */
object DirectMention {
    private val COMMAND = Regex("^/(directo|direct|dm)\\s+", RegexOption.IGNORE_CASE)
    private val AT_QUERY = Regex("^@([^\\s:,]*)$")
    private val COMMAND_QUERY = Regex("^(/(?:directo|direct|dm)\\s+)([^\\s:,]*)$", RegexOption.IGNORE_CASE)

    /** Lo que se está escribiendo como agente al principio del cuadro: «@Qw» → ("@", "Qw"). */
    data class Query(val prefix: String, val query: String)

    private fun fold(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

    private fun keysOf(a: Agent): List<String> =
        listOf(a.name.trim(), a.name.replace(Regex("\\s+"), ""), a.id).filter { it.isNotEmpty() }.distinct()

    /** Agentes a los que se puede escribir: los del equipo, sin becarios. */
    fun targets(agents: List<Agent>): List<Agent> = agents.filter { it.enabled && !it.isSubagent }

    fun query(text: String): Query? {
        AT_QUERY.find(text)?.let { return Query("@", it.groupValues[1]) }
        COMMAND_QUERY.find(text)?.let { return Query(it.groupValues[1], it.groupValues[2]) }
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

    /** El agente al que va directo el mensaje, o null si es un mensaje normal para el equipo. */
    fun target(raw: String, agents: List<Agent>): Agent? {
        val text = raw.trimStart()
        val cmd = COMMAND.find(text)
        val rest = when {
            cmd != null -> text.substring(cmd.value.length)
            text.startsWith("@") -> text.substring(1)
            else -> return null
        }
        var best: Pair<Agent, Int>? = null
        for (a in agents) for (k in keysOf(a)) {
            if (rest.length < k.length || fold(rest.substring(0, k.length)) != fold(k)) continue
            val next = rest.getOrNull(k.length)
            if (next != null && !(next.isWhitespace() || next == ':' || next == ',')) continue
            if (best == null || k.length > best.second) best = a to k.length
        }
        return best?.first
    }
}
