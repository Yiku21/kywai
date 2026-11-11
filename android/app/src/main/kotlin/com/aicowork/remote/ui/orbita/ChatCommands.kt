package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskTemplate
import com.aicowork.remote.i18n.t

/**
 * Las órdenes «/…» del chat, para la lista que sale al escribir «/» (cada una con lo que hace a la derecha).
 * Copia de src/shared/chatCommands.ts: si se añade o cambia una orden, cambiarla en los dos sitios.
 */
object ChatCommands {
    data class Command(val name: String, val aliases: List<String>, val args: String?, val description: String, val icon: ImageVector)

    /** Las órdenes de kywai, en el orden en que salen, en el idioma de Órbita. */
    fun builtin(): List<Command> = listOf(
        Command("video", emptyList(), t("tema"), t("Crea un vídeo completo en el estilo que elijas y te da solo el MP4"), Icons.Outlined.Movie),
        Command("serie", listOf("series", "episodios"), t("idea [en 5 episodios]"), t("Una historia en episodios con los mismos personajes, cada uno acaba en suspense"), Icons.Outlined.VideoLibrary),
        Command("aprende", listOf("aprender", "learn"), t("enlace o vídeo"), t("Convierte lo que enseña un vídeo en una habilidad"), Icons.Outlined.School),
        Command("instagram", listOf("insta", "ig"), t("qué quieres en el texto"), t("Prepara el último vídeo para el Instagram de kywai y lo publica con tu visto bueno"), Icons.Outlined.Send),
        Command("tiktok", listOf("tt"), t("qué quieres en el texto"), t("Prepara el último vídeo para el TikTok de kywai y lo envía como borrador o lo publica con tu visto bueno"), Icons.Outlined.Send),
        Command("ig-plan", emptyList(), t("qué quieres esta semana"), t("Plan de la semana para el Instagram de kywai: qué publicar, cuándo y con quién interactuar"), Icons.Outlined.Send),
        Command("ig-viral", emptyList(), t("nicho o cuentas"), t("Busca los reels que funcionan en tu nicho y por qué, para copiar la fórmula"), Icons.Outlined.School),
        Command("ig-reel", emptyList(), t("idea"), t("Convierte una idea en guion de reel con tres ganchos puntuados"), Icons.Outlined.Movie),
        Command("ig-profile", emptyList(), null, t("Puntúa el perfil de Instagram de kywai sobre 100 y dice cómo mejorarlo"), Icons.Outlined.Send),
        Command("ig-audit", emptyList(), null, t("Repasa lo publicado en Instagram y dice qué funcionó de verdad"), Icons.Outlined.Speed),
        Command("ig-reply", emptyList(), t("qué comentarios"), t("Escribe las respuestas a los comentarios del Instagram de kywai"), Icons.Outlined.Send),
        Command("ig-comment", emptyList(), t("post de otra cuenta"), t("Escribe dos comentarios para un post de otra cuenta (lo pegas tú)"), Icons.Outlined.AlternateEmail),
        Command("rutina", listOf("rutinas", "routine"), t("cuándo: qué"), t("Programa una tarea a una hora o que se repita"), Icons.Outlined.Schedule),
        Command("directo", listOf("direct", "dm"), t("Agente mensaje"), t("Habla con un agente sin pasar por Hermes"), Icons.Outlined.AlternateEmail),
        Command("recuerda", listOf("recordar", "memoria", "remember"), t("texto"), t("Guarda un dato en la memoria del proyecto"), Icons.Outlined.Psychology),
        Command("model", listOf("modelo", "models", "modelos"), null, t("Cambia el modelo de Hermes"), Icons.Outlined.Memory),
        Command("uso", listOf("usage", "cuotas", "cuota", "quota", "quotas", "limits", "limit"), null, t("Mira cuánta cuota le queda a cada agente"), Icons.Outlined.Speed),
        Command("nuevo", listOf("new", "clear", "limpiar"), null, t("Empieza un chat nuevo en este proyecto"), Icons.Outlined.EditNote),
    )

    enum class Kind { Builtin, Template, Mod }

    /** Una fila de la lista. `runs`: hace su trabajo nada más elegirla (no lleva nada detrás). */
    data class Suggestion(val key: String, val kind: Kind, val command: String, val args: String?, val description: String, val icon: ImageVector, val runs: Boolean)

    data class ModCommand(val name: String, val description: String, val mod: String)

    private val USAGE = Regex("^/(uso|usage|cuotas?|quotas?|limits?)$", RegexOption.IGNORE_CASE)
    private val CLEAR = Regex("^/(nuevo|new|clear|limpiar)(\\s+(chat|conversaci[oó]n))?$", RegexOption.IGNORE_CASE)

    /** «/uso» y sus variantes: abre «Uso y coste» en vez de ir a los agentes. */
    fun isUsageCommand(text: String): Boolean = USAGE.matches(text.trim())

    /** «/nuevo» y sus variantes: chat nuevo en el proyecto. */
    fun isClearCommand(text: String): Boolean = CLEAR.matches(text.trim())

    /**
     * Todas las que empiezan por lo escrito (sin la «/»): las de kywai, luego tus plantillas y luego las de los mods.
     * Una plantilla o un mod con el nombre de una orden de kywai no sale.
     */
    fun suggestions(query: String, templates: List<TaskTemplate> = emptyList(), mods: List<ModCommand> = emptyList()): List<Suggestion> {
        val q = query.lowercase()
        val out = mutableListOf<Suggestion>()
        val taken = mutableSetOf<String>()
        for (c in builtin()) {
            taken += c.name
            taken += c.aliases
            val name = if (c.name.startsWith(q)) c.name else c.aliases.firstOrNull { it.startsWith(q) } ?: continue
            out += Suggestion("b:${c.name}", Kind.Builtin, name, c.args, c.description, c.icon, c.args == null)
        }
        for (tpl in templates) {
            if (tpl.command.isEmpty() || tpl.command in taken || !tpl.command.startsWith(q)) continue
            taken += tpl.command
            out += Suggestion("t:${tpl.id}", Kind.Template, tpl.command, null, tpl.name, Icons.Outlined.Dashboard, false)
        }
        for (m in mods) {
            if (m.name in taken || !m.name.startsWith(q)) continue
            taken += m.name
            out += Suggestion("m:${m.mod}:${m.name}", Kind.Mod, m.name, null, m.description.ifBlank { t("Orden del mod «{mod}»", "mod" to m.mod) }, Icons.Outlined.Extension, false)
        }
        return out
    }
}

/**
 * La lista del «/» encima del cuadro del chat: la orden a la izquierda y lo que hace a la derecha. Las que no llevan
 * nada detrás se hacen al tocarlas (`onRun`); las demás dejan «/orden » en el cuadro.
 */
@Composable
fun ChatCommandList(model: OrbitaModel, snapshot: Snapshot?, onRun: (String) -> Unit) {
    if (snapshot == null) return
    val q = TemplateRules.commandQuery(model.chatDraft.text) ?: return
    val templates = if (snapshot.capabilities.templates) TemplateRules.forProject(snapshot.templates, snapshot.conversation.id) else emptyList()
    val mods = snapshot.modCommands.map { ChatCommands.ModCommand(it.name, it.description, it.mod) }
    val list = ChatCommands.suggestions(q, templates, mods)
    if (list.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("template-commands")) {
        Text(t("Órdenes: elige una o sigue escribiendo para filtrar"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(6.dp))
        Column(
            Modifier.fillMaxWidth().heightIn(max = 232.dp).clip(RoundedCornerShape(16.dp)).background(Orbita.GlassPopover).verticalScroll(rememberScrollState()).padding(4.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            list.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).tappable {
                        if (c.runs) onRun("/${c.command}")
                        else {
                            val next = "/${c.command} "
                            model.chatDraft = TextFieldValue(next, selection = TextRange(next.length))
                        }
                    }.padding(horizontal = 12.dp, vertical = 9.dp).testTag("command-${c.key}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Icono de línea, del mismo estilo que el resto de Órbita, con el color del tema.
                    Box(
                        Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(Orbita.AccentSoft),
                        contentAlignment = Alignment.Center,
                    ) { Icon(c.icon, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(17.dp)) }
                    Spacer(Modifier.width(10.dp))
                    Text("/${c.command}", color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    c.args?.let {
                        Spacer(Modifier.width(4.dp))
                        Text(it, color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 110.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        c.description,
                        color = Orbita.TextSoft,
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.End,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        Spacer(Modifier.height(4.dp))
    }
}
