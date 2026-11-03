package com.aicowork.remote.ui.orbita

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.PlanProposal
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.ui.components.parseColor

/** Entregables de una tarea agrupados en una carpeta (igual que en el escritorio: src/shared/deliverables.ts). */
object Deliverables {
    /** Carpeta común de unos archivos («artifacts/conceptos»), o "" si no comparten ninguna. */
    fun commonFolder(paths: List<String>): String {
        val dirs = paths.map { p -> p.replace('\\', '/').split('/').filter { it.isNotEmpty() }.dropLast(1) }
        val first = dirs.firstOrNull() ?: return ""
        var n = 0
        while (n < first.size && dirs.all { it.getOrNull(n) == first[n] }) n++
        return first.take(n).joinToString("/")
    }

    fun folderName(folder: String): String = folder.split('/').lastOrNull { it.isNotEmpty() } ?: "Entregables"

    private val words = mapOf(
        "image" to ("imagen" to "imágenes"),
        "html" to ("página" to "páginas"),
        "markdown" to ("documento" to "documentos"),
        "code" to ("archivo de código" to "archivos de código"),
        "text" to ("texto" to "textos"),
    )

    /**
     * «5 imágenes y 2 páginas»: qué hay dentro, de lo más a lo menos abundante. Vacío si no añade nada al número de
     * archivos (más de tres tipos, o todos sin tipo conocido).
     */
    fun kindsSummary(kinds: List<String>): String {
        val counts = LinkedHashMap<String, Int>()
        for (k in kinds) {
            val key = if (k in words) k else "other"
            counts[key] = (counts[key] ?: 0) + 1
        }
        if (counts.size > 3 || counts.keys == setOf("other")) return ""
        val parts = counts.entries.sortedByDescending { it.value }.map { (k, n) ->
            val (one, many) = words[k] ?: ("archivo" to "archivos")
            "$n ${if (n == 1) one else many}"
        }
        return if (parts.size > 1) parts.dropLast(1).joinToString(", ") + " y " + parts.last() else parts.firstOrNull().orEmpty()
    }

    /** «7 archivos · 5 imágenes y 2 páginas · por Codex»: lo que se ve de una carpeta plegada. */
    fun folderSummary(kinds: List<String>, authors: List<String>): String = listOf(
        "${kinds.size} ${if (kinds.size == 1) "archivo" else "archivos"}",
        kindsSummary(kinds),
        if (authors.isEmpty()) "" else "por ${authors.joinToString(" y ")}",
    ).filter { it.isNotEmpty() }.joinToString(" · ")
}

private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"

private val DIFFICULTY = mapOf("easy" to "fácil", "medium" to "normal", "hard" to "difícil")

/**
 * Plan que propone Hermes: cada tarea con su agente (toca una para ver qué hará). Nada empieza hasta que lo
 * apruebes; si algo no encaja, se le escribe en el chat.
 */
@Composable
fun ProposalCard(message: ChatMessage, proposal: PlanProposal, snapshot: Snapshot, model: OrbitaModel) {
    val pending = proposal.isPending
    var busy by remember { mutableStateOf<Boolean?>(null) }
    var showTasks by rememberSaveable(message.id, pending) { mutableStateOf(pending) }
    val agents = proposal.tasks.map { it.agentId }.toSet().size
    val index = proposal.tasks.withIndex().associate { (i, t) -> t.key to i + 1 }
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier
            .padding(top = 8.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(if (pending) Color(0x1F4FC3D6) else Orbita.Card)
            .border(1.dp, if (pending) Orbita.AccentEdge else Orbita.CardEdge, shape)
            .animateContentSize()
            .padding(12.dp)
            .testTag("proposal-${message.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).tappable(enabled = !pending, haptic = Haptic.Tap) { showTasks = !showTasks }) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(if (pending) Orbita.AccentSoft else Color(0x22B4CCF5)), contentAlignment = Alignment.Center) {
                Icon(
                    when (proposal.status) {
                        "pending" -> Icons.Outlined.Checklist
                        "revised" -> Icons.Outlined.EditNote
                        else -> Icons.Outlined.Close
                    },
                    contentDescription = null, tint = if (pending) Orbita.Accent else Orbita.TextSoft, modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    when (proposal.status) {
                        "pending" -> "Plan propuesto: espera tu visto bueno"
                        "revised" -> "Plan cambiado por tu respuesta"
                        "approved" -> "Plan aprobado"
                        else -> "Plan descartado"
                    },
                    color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                )
                Text("${plural(agents, "agente", "agentes")} · ${plural(proposal.tasks.size, "tarea", "tareas")}", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            if (!pending) Icon(Icons.Outlined.ExpandMore, contentDescription = if (showTasks) "Ocultar el plan" else "Ver el plan", tint = Orbita.TextSoft, modifier = Modifier.rotate(if (showTasks) 180f else 0f))
        }
        AnimatedVisibility(showTasks, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                proposal.tasks.forEachIndexed { i, t ->
                    ProposedTaskRow(i + 1, t, t.dependsOn.mapNotNull { index[it] }, snapshot)
                }
            }
        }
        if (pending) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OrbitaButton(
                    "Aprobar y empezar",
                    onClick = {
                        busy = true
                        model.run({ model.controller.decidePlan(message.id, approve = true) }) { busy = null }
                    },
                    icon = Icons.Outlined.PlayArrow,
                    busy = busy == true,
                    enabled = busy == null && snapshot.capabilities.planApproval,
                    height = 44.dp,
                    modifier = Modifier.weight(1f).testTag("plan-approve"),
                )
                OrbitaButton(
                    "Descartar",
                    onClick = {
                        busy = false
                        model.run({ model.controller.decidePlan(message.id, approve = false) }) { busy = null }
                    },
                    style = ButtonStyle.Secondary,
                    busy = busy == false,
                    enabled = busy == null && snapshot.capabilities.planApproval,
                    haptic = Haptic.Tap,
                    height = 44.dp,
                    modifier = Modifier.testTag("plan-reject"),
                )
            }
            Spacer(Modifier.height(6.dp))
            Text("¿Algo no encaja? Escríbele aquí abajo qué cambiar.", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ProposedTaskRow(number: Int, task: com.aicowork.remote.data.model.ProposedTask, after: List<Int>, snapshot: Snapshot) {
    var open by rememberSaveable(task.key) { mutableStateOf(false) }
    val agent = snapshot.agents.firstOrNull { it.id == task.agentId }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (open) Color(0x22B4CCF5) else Color.Transparent)
            .tappable(haptic = Haptic.Tap) { open = !open }
            .semantics { stateDescription = if (open) "Desplegada" else "Plegada" }
            .padding(horizontal = 6.dp, vertical = 6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(22.dp).clip(CircleShape).background(Color(0x26B4CCF5)), contentAlignment = Alignment.Center) {
                Text("$number", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.width(8.dp))
            RobotFace(agent, 24.dp)
            Spacer(Modifier.width(6.dp))
            Text(agent?.name ?: task.agentId, color = agent?.let { parseColor(it.color) } ?: Orbita.Accent, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(8.dp))
            Text(task.title, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = if (open) 4 else 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (after.isNotEmpty()) Text(" tras ${after.joinToString(", ")}", color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium)
        }
        if (open) {
            Spacer(Modifier.height(6.dp))
            Column(Modifier.padding(start = 30.dp)) {
                MarkdownText(task.description)
                val meta = listOfNotNull("Dificultad ${DIFFICULTY[task.difficulty] ?: task.difficulty}", task.acceptance?.takeIf { it.isNotBlank() }?.let { "Hecha cuando: $it" })
                Text(meta.joinToString(" · "), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

/** Tareas del plan ya en marcha, con su estado en vivo: toca una para verla en Tareas. */
@Composable
fun PlanTasksCard(taskIds: List<String>, snapshot: Snapshot, model: OrbitaModel) {
    val tasks = taskIds.mapNotNull { id -> snapshot.tasks.firstOrNull { it.id == id } }
    if (tasks.isEmpty()) return
    val done = tasks.count { it.status == "done" }
    val active = snapshot.conversation.activeRequestIds
    Column(Modifier.padding(top = 8.dp).fillMaxWidth().card(radius = 16.dp).padding(horizontal = 6.dp, vertical = 6.dp)) {
        Text(
            if (done == tasks.size) "Plan completado · ${plural(tasks.size, "tarea", "tareas")}" else "Plan en marcha · $done de ${tasks.size} hechas",
            color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp, top = 2.dp, bottom = 4.dp),
        )
        tasks.forEach { t ->
            val agent = snapshot.agents.firstOrNull { it.id == t.agentId }
            val (label, color) = statusOf(t, active)
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).tappable(haptic = Haptic.Tap) { model.openTask(t.id) }.padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RobotFace(agent, 22.dp)
                Spacer(Modifier.width(8.dp))
                Text(t.title, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Dot(color, 7.dp, pulse = t.status == "running")
                Spacer(Modifier.width(6.dp))
                Text(label, color = color, style = MaterialTheme.typography.labelMedium, maxLines = 1)
            }
        }
    }
}

/** Lo que entrega una tarea: un archivo se enseña tal cual; varios, juntos en una carpeta que se despliega. */
@Composable
fun DeliverablesCard(messageId: String, artifactIds: List<String>, snapshot: Snapshot, model: OrbitaModel) {
    val list = artifactIds.mapNotNull { id -> snapshot.conversation.artifacts.firstOrNull { it.id == id } }
    if (list.isEmpty()) return
    if (list.size == 1) {
        Box(Modifier.padding(top = 8.dp)) { DeliverableRow(list.first(), snapshot, model) }
        return
    }
    var open by rememberSaveable(messageId) { mutableStateOf(false) }
    val folder = Deliverables.commonFolder(list.map { it.relPath })
    val name = Deliverables.folderName(folder)
    val authors = list.mapNotNull { a -> snapshot.agents.firstOrNull { it.id == a.agentId }?.name }.distinct()
    val tint = snapshot.agents.firstOrNull { it.id == list.first().agentId }?.let { parseColor(it.color) } ?: Orbita.Accent
    Column(Modifier.padding(top = 8.dp).fillMaxWidth().card(radius = 18.dp, selected = open).animateContentSize().testTag("deliverables-$messageId")) {
        Row(
            Modifier
                .fillMaxWidth()
                .tappable(role = Role.Button, haptic = Haptic.Tap) { open = !open }
                .semantics { stateDescription = if (open) "Desplegada" else "Plegada" }
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.16f)).border(1.dp, tint.copy(alpha = 0.35f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(if (open) Icons.Outlined.FolderOpen else Icons.Outlined.Folder, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(name, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    Deliverables.folderSummary(list.map { it.kind }, authors),
                    color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(Icons.Outlined.ExpandMore, contentDescription = if (open) "Plegar la carpeta" else "Desplegar la carpeta", tint = Orbita.TextSoft, modifier = Modifier.rotate(if (open) 180f else 0f))
        }
        if (open) {
            Column(Modifier.padding(start = 10.dp, end = 10.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                list.forEach { DeliverableRow(it, snapshot, model) }
            }
        }
    }
}

@Composable
private fun DeliverableRow(a: Artifact, snapshot: Snapshot, model: OrbitaModel) {
    val (icon, color) = kindIcon(a.kind, a.name)
    val canOpen = snapshot.capabilities.artifacts
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0x2E0B1324))
            .border(1.dp, Orbita.CardEdge, RoundedCornerShape(14.dp))
            .tappable(enabled = canOpen, haptic = Haptic.Tap) { model.viewer = ViewerTarget.Result(a.id, a.name, a.kind) }
            .semantics { contentDescription = "Abrir ${a.name}" }
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(a.name, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(a.relPath, color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (canOpen) Text("Abrir", color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 8.dp))
    }
}
