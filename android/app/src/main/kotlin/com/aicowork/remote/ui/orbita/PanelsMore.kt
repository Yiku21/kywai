package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.AppLanguage
import com.aicowork.remote.i18n.I18n
import com.aicowork.remote.i18n.restartApp
import com.aicowork.remote.i18n.t

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DataUsage
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LinkOff
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material.icons.outlined.Undo
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.MemoryEntry
import com.aicowork.remote.data.model.ServerUpdate
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.store.EffectsPreference
import com.aicowork.remote.data.store.MotionPreference
import com.aicowork.remote.data.update.AppUpdater
import com.aicowork.remote.data.update.UpdateState
import com.aicowork.remote.ui.components.Format
import com.aicowork.remote.ui.components.Labels
import kotlinx.coroutines.launch

private val listPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp)

@Composable
private fun Badge(text: String, color: Color) {
    Text(
        text,
        color = color,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.clip(Orbita.PillShape).background(color.copy(alpha = 0.14f)).border(1.dp, color.copy(alpha = 0.35f), Orbita.PillShape).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

// ---------------------------------------------------------------------------------------------- Memoria

@Composable
fun MemoryPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val canEdit = snapshot?.capabilities?.memoryEdit == true
    val memory = snapshot?.memory.orEmpty()
    val pending = memory.filter { it.status == "provisional" }
    val confirmed = memory.filter { it.status == "confirmed" }
    val superseded = memory.filter { it.status == "superseded" }
    var editingInstructions by remember { mutableStateOf(false) }
    var instructionsDraft by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var showArchived by remember { mutableStateOf(false) }
    PanelColumn {
        PanelHeader(model, t("Memoria"), icon = Icons.Outlined.Psychology)
        LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("memory-list"), state = model.memoryList, contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                SectionLabel(t("Instrucciones del proyecto"))
                Column(Modifier.fillMaxWidth().card().padding(14.dp).animateContentSize()) {
                    if (!editingInstructions) {
                        Row(verticalAlignment = Alignment.Top) {
                            val text = snapshot?.conversation?.instructions.orEmpty()
                            Text(text.ifBlank { t("Sin instrucciones. Escribe cómo quieres que trabaje el equipo en este proyecto (estilo, qué no tocar, cómo probar…).") }, color = if (text.isBlank()) Orbita.TextSoft else Orbita.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                            if (canEdit) IconAction(Icons.Outlined.Edit, t("Editar las instrucciones"), onClick = { instructionsDraft = text; editingInstructions = true }, size = 40.dp)
                        }
                    } else {
                        OrbitaField(instructionsDraft, { instructionsDraft = it }, t("Instrucciones para todos los agentes"), singleLine = false, minLines = 3, maxLines = 10, imeAction = ImeAction.Default, autoFocus = true)
                        Spacer(Modifier.height(10.dp))
                        var busy by remember { mutableStateOf(false) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OrbitaButton(t("Cancelar"), onClick = { editingInstructions = false }, style = ButtonStyle.Ghost, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.weight(1f))
                            OrbitaButton(t("Guardar"), onClick = {
                                busy = true
                                model.run({ model.controller.setInstructions(instructionsDraft) }) { busy = false; if (it.ok) editingInstructions = false }
                            }, busy = busy, height = 46.dp, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            if (!canEdit) item {
                Note(Icons.Outlined.Info, t("Solo lectura"), t("Para confirmar, descartar o añadir recuerdos desde el móvil, actualiza AI Cowork en el ordenador."))
            }
            item {
                SectionLabel(t("Por revisar")) { if (pending.isNotEmpty()) CountBadge(pending.size) }
                if (pending.isEmpty()) Text(t("Nada pendiente: lo que propongan los agentes aparecerá aquí para que lo confirmes."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 4.dp))
            }
            items(pending, key = { "p-${it.id}" }) { m -> MemoryCard(m, snapshot!!, model, canEdit, review = true) }
            if (confirmed.isNotEmpty()) item { SectionLabel(t("Confirmada")) }
            items(confirmed, key = { "c-${it.id}" }) { m -> MemoryCard(m, snapshot!!, model, canEdit, review = false) }
            if (superseded.isNotEmpty()) item {
                Text(
                    if (showArchived) t("Ocultar las archivadas ({size})", "size" to superseded.size) else t("Ver las archivadas ({size})", "size" to superseded.size),
                    color = Orbita.Accent,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clip(Orbita.PillShape).tappable { showArchived = !showArchived }.padding(10.dp),
                )
            }
            if (showArchived) items(superseded, key = { "s-${it.id}" }) { m -> MemoryCard(m, snapshot!!, model, canEdit, review = false) }
            if (adding) item(key = "adding") { AddMemory(model, onDone = { adding = false }) }
        }
        if (canEdit && !adding) {
            OrbitaButton(t("Añadir recuerdo"), onClick = { adding = true }, icon = Icons.Outlined.Add, haptic = Haptic.Tap, modifier = Modifier.fillMaxWidth().padding(16.dp).testTag("add-memory"))
        }
    }
}

@Composable
private fun MemoryCard(m: MemoryEntry, snapshot: Snapshot, model: OrbitaModel, canEdit: Boolean, review: Boolean) {
    var menu by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf(m.text) }
    var busy by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxWidth().card(selected = review).padding(14.dp).animateContentSize().testTag("memory-${m.id}")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (m.status) {
                "provisional" -> Badge(t("{v1} · Provisional", "v1" to (Labels.memoryKind(m.kind))), Orbita.Warn)
                "confirmed" -> Badge(t("{v1} · Confirmada", "v1" to (Labels.memoryKind(m.kind))), Orbita.Success)
                else -> Badge(t("{v1} · Archivada", "v1" to (Labels.memoryKind(m.kind))), Orbita.TextFaint)
            }
            Spacer(Modifier.weight(1f))
            if (canEdit) Box {
                IconAction(Icons.Outlined.MoreHoriz, t("Opciones del recuerdo"), onClick = { menu = true }, size = 40.dp)
                DropdownMenu(menu, onDismissRequest = { menu = false }, containerColor = Color(0xF00E1730)) {
                    DropdownMenuItem(text = { Text(t("Editar")) }, onClick = { menu = false; draft = m.text; editing = true }, leadingIcon = { Icon(Icons.Outlined.Edit, null) })
                    if (m.status == "confirmed") DropdownMenuItem(text = { Text(t("Archivar")) }, onClick = { menu = false; model.run({ model.controller.setMemoryStatus(m.id, "superseded") }) }, leadingIcon = { Icon(Icons.Outlined.Archive, null) })
                    if (m.status == "superseded") DropdownMenuItem(text = { Text(t("Recuperar")) }, onClick = { menu = false; model.run({ model.controller.setMemoryStatus(m.id, "confirmed") }) }, leadingIcon = { Icon(Icons.Outlined.Undo, null) })
                    DropdownMenuItem(text = { Text(t("Borrar")) }, onClick = { menu = false; model.run({ model.controller.deleteMemory(m.id) }) }, leadingIcon = { Icon(Icons.Outlined.Delete, null) })
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        if (!editing) {
            Text(m.text, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge)
        } else {
            OrbitaField(draft, { draft = it }, t("Texto del recuerdo"), singleLine = false, minLines = 2, maxLines = 8, imeAction = ImeAction.Default, autoFocus = true)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OrbitaButton(t("Cancelar"), onClick = { editing = false }, style = ButtonStyle.Ghost, haptic = Haptic.Tap, height = 44.dp, modifier = Modifier.weight(1f))
                OrbitaButton(t("Guardar"), onClick = {
                    busy = "edit"
                    model.run({ model.controller.editMemory(m.id, draft) }) { busy = null; if (it.ok) editing = false }
                }, busy = busy == "edit", enabled = draft.isNotBlank(), height = 44.dp, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val author = snapshot.agents.firstOrNull { it.id == m.by }
            if (author != null) RobotFace(author, 22.dp) else UserIcon()
            Spacer(Modifier.width(8.dp))
            Text(
                listOfNotNull(author?.name ?: m.byName ?: if (m.by == null || m.by == "user") t("Tú") else m.by, m.taskTitle?.let { "«$it»" }).joinToString(" · "),
                color = Orbita.TextSoft,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (review && canEdit) {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OrbitaButton(t("Confirmar"), onClick = {
                    busy = "confirm"
                    model.run({ model.controller.setMemoryStatus(m.id, "confirmed") }) { busy = null }
                }, icon = Icons.Outlined.Check, busy = busy == "confirm", height = 46.dp, modifier = Modifier.weight(1f).testTag("memory-confirm-${m.id}"))
                OrbitaButton(t("Descartar"), onClick = {
                    busy = "discard"
                    model.run({ model.controller.setMemoryStatus(m.id, "superseded") }) { busy = null }
                }, style = ButtonStyle.Secondary, busy = busy == "discard", height = 46.dp, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun AddMemory(model: OrbitaModel, onDone: () -> Unit) {
    var kind by remember { mutableStateOf("preference") }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().card(selected = true).padding(14.dp)) {
        Text(t("Nuevo recuerdo"), color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(10.dp))
        Segmented(listOf("decision" to t("Decisión"), "fact" to t("Hecho"), "preference" to t("Preferencia"), "pending" to t("Pendiente")), kind, { kind = it })
        Spacer(Modifier.height(10.dp))
        OrbitaField(text, { text = it }, t("Qué debe recordar el equipo"), singleLine = false, minLines = 2, maxLines = 6, imeAction = ImeAction.Default, autoFocus = true)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OrbitaButton(t("Cancelar"), onClick = onDone, style = ButtonStyle.Ghost, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.weight(1f))
            OrbitaButton(t("Guardar"), onClick = {
                busy = true
                model.run({ model.controller.addMemory(kind, text) }) { busy = false; if (it.ok) onDone() }
            }, busy = busy, enabled = text.isNotBlank(), height = 46.dp, modifier = Modifier.weight(1f))
        }
    }
}

// ---------------------------------------------------------------------------------------------- Herramientas

private data class Connector(val name: String, val initial: String, val color: Color)

private val Connectors = listOf(
    Connector("GitHub", "G", Color(0xFFE6EDF3)),
    Connector("Notion", "N", Color(0xFFFFFFFF)),
    Connector("Figma", "F", Color(0xFFF24E1E)),
    Connector("Slack", "S", Color(0xFFE01E5A)),
)

@Composable
fun ToolsPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    PanelColumn {
        PanelHeader(model, t("Herramientas"), t("Conexiones del proyecto"), icon = Icons.Outlined.Build)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = model.toolsList, contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(Connectors, key = { it.name }) { c ->
                Row(Modifier.fillMaxWidth().heightIn(min = 70.dp).card().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF0A0F1C)).border(1.dp, Orbita.CardEdge, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        Text(c.initial, color = c.color, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(14.dp))
                    Text(c.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    Badge(t("No disponible"), Orbita.TextFaint)
                }
            }
            item {
                Note(
                    Icons.Outlined.Info,
                    t("Por qué no se pueden conectar"),
                    t("AI Cowork todavía no se conecta con servicios externos. Los agentes trabajan con sus propias herramientas (Claude Code, Codex, Gemini…), la carpeta del proyecto y los archivos que les des."),
                )
            }
            if (snapshot != null) {
                item { SectionLabel(t("Herramientas del equipo")) }
                items(teamOrder(snapshot).filter { !it.isSubagent }, key = { "t-${it.id}" }) { a ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).card().padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        RobotFace(a, 38.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(a.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
                            Text(listOf(Labels.provider(a.provider), a.modelLabel).filter { it.isNotBlank() }.joinToString(" · "), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Dot(activityColor(a.activity))
                        Spacer(Modifier.width(6.dp))
                        Text(if (!a.enabled) t("Desactivado") else Labels.activity(a.activity), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    }
                }
                item {
                    SectionLabel(t("Acceso del equipo"))
                    Text(t("Elige dónde pueden trabajar los agentes."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 4.dp))
                    Spacer(Modifier.height(10.dp))
                    if (snapshot.capabilities.agentAccess) {
                        var asking by remember { mutableStateOf<String?>(null) }
                        Segmented(
                            listOf("full" to t("Acceso completo"), "project" to t("Solo el proyecto")),
                            snapshot.settings.agentAccess,
                            onSelect = { if (it != snapshot.settings.agentAccess) asking = it },
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (snapshot.settings.agentAccess == "project") t("Los agentes solo leen y escriben en la carpeta del proyecto y no instalan nada.")
                            else t("Los agentes pueden instalar herramientas y usar internet cuando una tarea lo necesita."),
                            color = Orbita.TextSoft,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 4.dp),
                        )
                        asking?.let { target ->
                            ConfirmDialog(
                                title = if (target == "project") t("¿Limitar a la carpeta del proyecto?") else t("¿Dar acceso completo?"),
                                text = t("Afecta a las tareas que empiecen a partir de ahora."),
                                confirm = t("Cambiar"),
                                onConfirm = { asking = null; model.run({ model.controller.setAgentAccess(target) }) },
                                onDismiss = { asking = null },
                            )
                        }
                    } else {
                        Note(Icons.Outlined.Info, t("Solo desde el ordenador"), t("Para cambiar el acceso desde el móvil, actualiza AI Cowork en el ordenador."))
                    }
                }
                if (snapshot.capabilities.planApproval) item {
                    SectionLabel(t("Planes de Hermes"))
                    Column(Modifier.fillMaxWidth().card().padding(vertical = 4.dp)) {
                        val on = snapshot.settings.planApproval
                        ToggleRow(
                            t("Pedir mi visto bueno a cada plan"),
                            if (on) t("Hermes te enseña qué hará cada agente y espera a que lo apruebes") else t("Las tareas empiezan en cuanto Hermes reparte el trabajo"),
                            on,
                            "toggle-plan-approval",
                        ) { v -> model.run({ model.controller.setPlanApproval(v) }) }
                    }
                }
            }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit, danger: Boolean = false) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xF20E1730),
        title = { Text(title, color = Orbita.Text) },
        text = { Text(text, color = Orbita.TextSoft) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirm, color = if (danger) Orbita.Danger else Orbita.Accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
    )
}

// ---------------------------------------------------------------------------------------------- Consumo

@Composable
fun UsagePanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val usage = snapshot?.usage
    var refreshing by remember { mutableStateOf(false) }
    PanelColumn {
        PanelHeader(model, t("Consumo"), t("Cuotas y tokens"), icon = Icons.Outlined.DataUsage, trailing = {
            if (snapshot?.capabilities?.usageRefresh == true) {
                if (refreshing) Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(Modifier.size(20.dp), color = Orbita.Accent, strokeWidth = 2.dp) }
                else IconAction(Icons.Outlined.Refresh, t("Actualizar las cuotas"), onClick = { refreshing = true; model.run({ model.controller.refreshUsage() }) { refreshing = false } })
            }
        })
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = model.usageList, contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (usage == null) return@LazyColumn
            item { SectionLabel(t("Cuota restante")) }
            items(usage.quotas, key = { "q-${it.id}" }) { q ->
                Column(Modifier.fillMaxWidth().card().padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(q.label, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        Text(
                            when { q.unlimited -> t("Sin límite"); q.remainingPct != null -> "${q.remainingPct.toInt()} %"; else -> "N/D" },
                            color = Orbita.Text,
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    val pct = q.remainingPct?.toFloat()?.div(100f)
                    val color = when { q.unlimited -> Orbita.Live; pct == null -> Orbita.TextFaint; pct < 0.15f -> Orbita.Danger; pct < 0.35f -> Orbita.Warn; else -> Orbita.Accent }
                    ProgressLine(if (q.unlimited) 1f else pct ?: 0f, color, animate = false)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        listOfNotNull(q.period, q.resetsAt?.let { t("se renueva {v1}", "v1" to Format.relative(it)) }, Labels.quotaSource(q.source), q.note).joinToString(" · "),
                        color = Orbita.TextSoft,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            item {
                SectionLabel(t("Tokens"))
                Row(Modifier.fillMaxWidth().card().padding(14.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Metric(t("Entrada"), Format.tokens(usage.totals.input))
                    Metric(t("Salida"), Format.tokens(usage.totals.output))
                    usage.totals.cached?.let { Metric(t("En caché"), Format.tokens(it)) }
                }
            }
            if (usage.byAgent.isNotEmpty()) item { SectionLabel(t("Por agente")) }
            items(usage.byAgent.sortedByDescending { it.input + it.output }, key = { "a-${it.agentId}" }) { a ->
                val agent = snapshot.agents.firstOrNull { it.id == a.agentId }
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).card().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    RobotFace(agent, 32.dp)
                    Spacer(Modifier.width(12.dp))
                    Text(agent?.name ?: a.agentId, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    Text(Format.tokens(a.input + a.output), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Orbita.Text, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
    }
}

// ---------------------------------------------------------------------------------------------- Ajustes

@Composable
fun SettingsPanel(model: OrbitaModel, state: CoworkUiState) {
    val p = model.preferences
    val session = state.session
    var confirmForget by remember { mutableStateOf(false) }
    PanelColumn {
        PanelHeader(model, t("Ajustes"), icon = Icons.Outlined.Settings)
        LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("settings-list"), state = model.settingsList, contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                SectionLabel("Idioma · Language")
                val context = LocalContext.current
                Segmented(
                    listOf(AppLanguage.System to t("Del sistema"), AppLanguage.Es to "Español", AppLanguage.En to "English"),
                    p.language,
                    { v ->
                        if (v != p.language) {
                            val restart = I18n.resolve(v) != I18n.lang
                            model.updatePreferences { it.copy(language = v) }
                            if (restart) restartApp(context)
                        }
                    },
                )
                Text(
                    t("Cambia los textos de Órbita en este móvil. Lo que escriben los agentes sigue el idioma elegido en el ordenador."),
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 4.dp, top = 8.dp),
                )
            }
            item {
                SectionLabel(t("Respuesta al tacto"))
                Column(Modifier.fillMaxWidth().card().padding(vertical = 4.dp)) {
                    ToggleRow(t("Sonidos"), t("Tonos cortos al terminar tareas, llegar mensajes o fallar algo"), p.sound, "toggle-sound") { v -> model.updatePreferences { it.copy(sound = v) }; if (v) model.feedback.play(Sfx.Message) }
                    ToggleRow(t("Vibración"), t("Una vibración breve al elegir y confirmar"), p.haptics, "toggle-haptics") { v -> model.updatePreferences { it.copy(haptics = v) } }
                    ToggleRow(
                        t("Voces de los agentes"),
                        if (p.sound) t("Cada agente balbucea con su propia voz cuando escribe en el chat") else t("Activa los sonidos para oírlas"),
                        p.voices,
                        "toggle-voices",
                    ) { v -> model.updatePreferences { it.copy(voices = v) }; if (v) model.previewVoice() }
                    if (p.voices && p.sound) {
                        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Volumen"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.width(12.dp))
                            Slider(
                                value = p.voiceVolume,
                                onValueChange = { v -> model.updatePreferences { it.copy(voiceVolume = v) } },
                                onValueChangeFinished = { model.previewVoice() },
                                valueRange = 0.05f..1f,
                                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Orbita.AccentButtonTop, inactiveTrackColor = Color(0x33B4CCF5)),
                                modifier = Modifier.weight(1f).testTag("voice-volume"),
                            )
                        }
                    }
                }
            }
            item {
                SectionLabel(t("Mundo"))
                Column(Modifier.fillMaxWidth().card().padding(vertical = 4.dp)) {
                    ToggleRow(t("Animación ambiental"), t("Luces, globo y cúpula en movimiento. La actividad real de los agentes se ve siempre."), p.ambient, "toggle-ambient") { v -> model.updatePreferences { it.copy(ambient = v) } }
                }
                Spacer(Modifier.height(10.dp))
                Text(t("Intensidad de efectos"), color = Orbita.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
                Segmented(
                    listOf(EffectsPreference.Soft to t("Suave"), EffectsPreference.Normal to t("Normal"), EffectsPreference.Full to t("Completa")),
                    p.effects,
                    { v -> model.updatePreferences { it.copy(effects = v) } },
                )
                Text(
                    when (p.effects) {
                        EffectsPreference.Soft -> t("Menos partículas, 30 imágenes por segundo y paneles sin difuminado: gasta menos batería.")
                        EffectsPreference.Normal -> t("Cristal difuminado y 60 imágenes por segundo.")
                        EffectsPreference.Full -> t("Todo el detalle y la frecuencia de la pantalla (gasta más batería).")
                    },
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 4.dp, top = 8.dp),
                )
                Spacer(Modifier.height(14.dp))
                Text(t("Movimiento"), color = Orbita.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
                Segmented(
                    listOf(MotionPreference.System to t("Del sistema"), MotionPreference.Reduced to t("Reducido"), MotionPreference.Full to t("Completo")),
                    p.motion,
                    { v -> model.updatePreferences { it.copy(motion = v) } },
                )
                Text(
                    if (model.reducedMotion()) t("Movimiento reducido: sin saltos ni giros, transiciones más cortas.") else t("Movimiento completo."),
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 4.dp, top = 8.dp),
                )
            }
            item {
                SectionLabel(t("Ordenador"))
                Column(Modifier.fillMaxWidth().card().padding(14.dp)) {
                    Text(session?.serverName ?: "AI Cowork", color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
                    Text(session?.serverUrl.orEmpty(), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(6.dp))
                    val status = when (val c = state.connection) {
                        Connection.Online -> t("Conectado")
                        Connection.Connecting -> t("Conectando…")
                        is Connection.Offline -> t("Sin conexión: {reason}", "reason" to c.reason)
                        Connection.Idle -> t("En pausa")
                    }
                    Text(status, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    Text(t("Última sincronización: {v1}", "v1" to (Format.relative(state.syncedAt).ifEmpty { t("nunca") })), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    session?.pinnedSha256?.let { Text(t("Certificado: {v1}…", "v1" to (it.take(23))), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall) }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OrbitaButton(t("Reconectar"), onClick = { model.controller.retryNow() }, icon = Icons.Outlined.Sync, style = ButtonStyle.Secondary, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.weight(1f))
                        OrbitaButton(t("Actualizar"), onClick = { model.controller.refresh() }, icon = Icons.Outlined.Refresh, style = ButtonStyle.Secondary, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.weight(1f))
                    }
                }
            }
            // También en Herramientas; aquí porque en el escritorio está en ⋮ → Ajustes y es donde se busca.
            state.snapshot?.takeIf { it.capabilities.planApproval }?.let { snapshot ->
                item {
                    SectionLabel(t("Planes de Hermes"))
                    Column(Modifier.fillMaxWidth().card().padding(vertical = 4.dp)) {
                        val on = snapshot.settings.planApproval
                        ToggleRow(
                            t("Pedir mi visto bueno a cada plan"),
                            if (on) t("Hermes te enseña qué hará cada agente y espera a que lo apruebes") else t("Las tareas empiezan en cuanto Hermes reparte el trabajo"),
                            on,
                            "settings-plan-approval",
                        ) { v -> model.run({ model.controller.setPlanApproval(v) }) }
                    }
                }
            }
            item { ServerUpdateSection(model, state.snapshot?.capabilities?.serverUpdate == true) }
            model.updater?.let { updater -> item { UpdateSection(updater) } }
            item {
                SectionLabel(t("Este móvil"))
                Column(Modifier.fillMaxWidth().card().padding(14.dp)) {
                    Text(session?.deviceName.orEmpty(), color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
                    Text(t("Emparejado: {v1}", "v1" to (Format.dateTime(session?.pairedAt))), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    Text(t("Queda emparejado: solo se desempareja si generas un código de acceso nuevo en AI Cowork o lo desvinculas aquí."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    OrbitaButton(t("Desvincular este móvil"), onClick = { confirmForget = true }, icon = Icons.Outlined.LinkOff, style = ButtonStyle.Danger, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
    if (confirmForget) {
        ConfirmDialog(
            title = t("¿Desvincular este móvil?"),
            text = t("Tendrás que volver a emparejarlo con un código del ordenador."),
            confirm = t("Desvincular"),
            danger = true,
            onConfirm = { confirmForget = false; model.feedback.confirm(); model.controller.forget() },
            onDismiss = { confirmForget = false },
        )
    }
}

/**
 * Ajustes → Servidor: lo mismo que ⋮ → «Buscar actualizaciones…» en el ordenador. El servidor mira GitHub y, si hay
 * versión nueva, la descarga, se compila, se instala y se reinicia; Órbita se reconecta sola.
 */
@Composable
private fun ServerUpdateSection(model: OrbitaModel, available: Boolean) {
    val scope = rememberCoroutineScope()
    var info by remember { mutableStateOf<ServerUpdate?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var checking by remember { mutableStateOf(false) }
    var starting by remember { mutableStateOf(false) }
    var started by remember { mutableStateOf(false) }
    // null: sin preguntar; true/false: confirmar actualizar (apartando o no lo hecho en el servidor).
    var confirm by remember { mutableStateOf<Boolean?>(null) }
    val check: () -> Unit = {
        checking = true
        error = null
        scope.launch {
            model.controller.serverUpdate()
                .onSuccess { info = it; if (!it.updating) started = false }
                .onFailure { error = it.message ?: t("No se pudo preguntar al servidor") }
            checking = false
        }
    }
    // Al abrir Ajustes ya se ve si hay versión nueva (el servidor consulta GitHub: tarda unos segundos).
    LaunchedEffect(available) { if (available && info == null && !checking) check() }
    SectionLabel(t("Servidor"))
    Column(Modifier.fillMaxWidth().card().padding(14.dp).testTag("server-update")) {
        val i = info
        Text(i?.current?.let { t("Versión {hash} · {date}", "hash" to it.hash, "date" to it.date) } ?: t("AI Cowork en el servidor"), color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
        Text(
            serverUpdateText(i, error, checking, started, available),
            color = if (error != null) Orbita.Warn else Orbita.TextSoft,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.testTag("server-update-status"),
        )
        i?.lastError?.takeIf { !started && i?.updating != true }?.let {
            Spacer(Modifier.height(4.dp))
            Text(t("La última actualización falló y el servidor siguió con su versión: {it}", "it" to it), color = Orbita.Warn, style = MaterialTheme.typography.bodySmall)
        }
        if (i != null && !started && !i.updating && i.commits.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            i.commits.take(5).forEach { c ->
                Text("• ${c.subject}", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (i.commitCount > 5) Text(t("y {v1} más", "v1" to (i.commitCount - 5)), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
        }
        if (available) {
            Spacer(Modifier.height(10.dp))
            when {
                started || i?.updating == true -> OrbitaButton(
                    t("Ver cómo va"), onClick = check, icon = Icons.Outlined.Refresh, style = ButtonStyle.Secondary,
                    busy = checking, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.fillMaxWidth(),
                )
                i != null && i.canUpdate && i.commitCount > 0 -> OrbitaButton(
                    t("Actualizar el servidor"), onClick = { confirm = false }, icon = Icons.Outlined.SystemUpdate,
                    busy = starting, height = 46.dp, modifier = Modifier.fillMaxWidth().testTag("server-update-start"),
                )
                i != null && i.blockedByLocal -> OrbitaButton(
                    t("Apartar sus cambios y actualizar"), onClick = { confirm = true }, icon = Icons.Outlined.SystemUpdate,
                    busy = starting, height = 46.dp, modifier = Modifier.fillMaxWidth().testTag("server-update-start"),
                )
                else -> OrbitaButton(
                    t("Buscar actualizaciones del servidor"), onClick = check, icon = Icons.Outlined.Refresh, style = ButtonStyle.Secondary,
                    busy = checking, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.fillMaxWidth().testTag("server-update-check"),
                )
            }
        }
    }
    confirm?.let { setAside ->
        ConfirmDialog(
            title = t("¿Actualizar el servidor?"),
            text = (if (setAside) t("Lo hecho en el servidor que no está en GitHub se aparta antes (se guarda en git, no se borra). ") else "") +
                t("El servidor descarga los cambios de GitHub, se compila y se reinicia: tarda unos minutos y mientras tanto Órbita ") +
                t("se queda sin conexión (se reconecta sola). Lo que esté trabajando quedará en pausa para reanudarlo."),
            confirm = t("Actualizar"),
            onConfirm = {
                confirm = null
                starting = true
                error = null
                scope.launch {
                    val r = model.controller.startServerUpdate(setAside)
                    starting = false
                    if (r.ok) started = true else error = r.message
                }
            },
            onDismiss = { confirm = null },
        )
    }
}

private fun serverUpdateText(i: ServerUpdate?, error: String?, checking: Boolean, started: Boolean, available: Boolean): String = when {
    !available -> t("Para actualizar el servidor desde aquí, actualízalo una vez desde el ordenador (⋮ → «Buscar actualizaciones…»).")
    error != null -> error
    started || i?.updating == true -> t("Actualizando: descarga los cambios, se compila y se reinicia. Tarda unos minutos; Órbita se reconecta sola.")
    i == null -> if (checking) t("Preguntando a GitHub…") else t("Busca en GitHub la versión nueva del servidor y la instala allí.")
    i.blockedByLocal -> t("Hay {changes} en GitHub, pero el servidor tiene cambios hechos allí que no están en GitHub. Puedes apartarlos (se guardan en git, no se borran) y actualizar.", "changes" to changes(i.commitCount))
    !i.canUpdate -> i.reason ?: t("No se puede actualizar el servidor desde aquí.")
    i.commitCount == 0 -> t("El servidor tiene la última versión.")
    i.pendingInstall -> t("El código nuevo ya está descargado; falta instalarlo ({changes}):", "changes" to changes(i.commitCount))
    else -> t("Hay {v1}:", "v1" to (changes(i.commitCount)))
}

private fun changes(n: Int): String = if (n == 1) t("1 cambio nuevo") else t("{n} cambios nuevos", "n" to n)

/** Ajustes → Órbita: busca la versión que tiene el ordenador y la instala aquí, sin pasar la APK a mano. */
@Composable
private fun UpdateSection(updater: AppUpdater) {
    val state by updater.state.collectAsState()
    // Al abrir Ajustes ya se ve si hay una versión nueva (una consulta pequeña, una vez cada vez que se abre Órbita).
    LaunchedEffect(updater) { if (updater.state.value == UpdateState.Idle) updater.check() }
    SectionLabel(t("Órbita"))
    Column(Modifier.fillMaxWidth().card().padding(14.dp).testTag("app-update")) {
        Text(t("Versión {versionName}", "versionName" to updater.versionName), color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
        Text(
            updateText(state),
            color = if (state is UpdateState.Failed) Orbita.Warn else Orbita.TextSoft,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.testTag("app-update-status"),
        )
        (state as? UpdateState.Downloading)?.let { d ->
            Spacer(Modifier.height(10.dp))
            LinearProgressIndicator(
                progress = { d.progress },
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)),
                color = Orbita.Accent,
                trackColor = Color(0x33B4CCF5),
            )
        }
        Spacer(Modifier.height(10.dp))
        val release = when (val s = state) {
            is UpdateState.Available -> s.release
            is UpdateState.Downloading -> s.release
            is UpdateState.Installing -> s.release
            is UpdateState.Failed -> s.release
            else -> null
        }
        when {
            state is UpdateState.NeedsPermission -> OrbitaButton(
                t("Permitir instalar desde Órbita"), onClick = updater::allowInstalls, icon = Icons.Outlined.Security,
                height = 46.dp, modifier = Modifier.fillMaxWidth(),
            )
            release != null -> OrbitaButton(
                t("Instalar la versión {versionName}", "versionName" to release.versionName), onClick = updater::install, icon = Icons.Outlined.SystemUpdate,
                busy = state is UpdateState.Downloading || state is UpdateState.Installing, height = 46.dp, modifier = Modifier.fillMaxWidth(),
            )
            else -> OrbitaButton(
                t("Buscar actualizaciones"), onClick = updater::check, icon = Icons.Outlined.Refresh, style = ButtonStyle.Secondary,
                busy = state is UpdateState.Checking, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun updateText(s: UpdateState): String = when (s) {
    UpdateState.Idle -> t("Busca la versión que tiene el ordenador y la instala aquí, sin pasar la APK a mano.")
    UpdateState.Checking -> t("Preguntando al ordenador…")
    UpdateState.UpToDate -> t("Tienes la última versión.")
    is UpdateState.Available -> t("Hay una versión nueva ({versionName}, {megabytes}). Al instalarla, Órbita se cierra: vuelve a abrirla y sigue emparejada.", "versionName" to s.release.versionName, "megabytes" to megabytes(s.release.size))
    is UpdateState.Downloading -> t("Descargando la versión {versionName}… {v2} %", "versionName" to s.release.versionName, "v2" to (s.progress * 100).toInt())
    is UpdateState.NeedsPermission -> t("Android pide permiso (solo la primera vez) para que Órbita instale su versión nueva: activa «Permitir de esta fuente» y vuelve.")
    is UpdateState.Installing -> t("Instalando la versión {versionName}… Si Android pregunta, toca «Actualizar». Órbita se cerrará: vuelve a abrirla.", "versionName" to s.release.versionName)
    is UpdateState.Failed -> s.message
}

private fun megabytes(bytes: Long): String = String.format(com.aicowork.remote.i18n.I18n.locale, "%.1f MB", bytes / 1_048_576.0)

@Composable
private fun ToggleRow(title: String, subtitle: String?, checked: Boolean, tag: String, onChange: (Boolean) -> Unit) {
    val feedback = LocalFeedback.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .tappable(role = Role.Switch, haptic = Haptic.None) { feedback.select(); onChange(!checked) }
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
            if (subtitle != null) Text(subtitle, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedTrackColor = Orbita.AccentButtonTop, checkedThumbColor = Color.White, uncheckedTrackColor = Color(0x33B4CCF5), uncheckedThumbColor = Orbita.TextSoft, uncheckedBorderColor = Color.Transparent),
        )
    }
}

// ---------------------------------------------------------------------------------------------- Equipo

@Composable
fun TeamPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val config = androidx.compose.ui.platform.LocalConfiguration.current
    val aspect = config.screenWidthDp.toFloat() / config.screenHeightDp.coerceAtLeast(1)
    val attention = snapshot?.let { OrbitaModel.attentionOf(it) }
    val scope = rememberCoroutineScope()
    PanelColumn {
        PanelHeader(model, t("Equipo"), snapshot?.let { s -> workingCount(s).let { if (it > 0) t("{it} trabajando", "it" to it) else t("Todos libres") } }, icon = Icons.Outlined.Groups)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = model.teamList, contentPadding = listPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (snapshot == null) return@LazyColumn
            items(teamOrder(snapshot), key = { it.id }) { a ->
                val task = snapshot.tasks.firstOrNull { it.id == a.taskId }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 72.dp)
                        .card(selected = model.selectedAgentId == a.id)
                        .tappable(haptic = Haptic.Select) {
                            // Lleva al agente en el mundo: se cierra el panel y la cámara se acerca a él.
                            scope.launch {
                                model.close()
                                model.selectAgent(a.id)
                                focusAgent(model, snapshot, a.id, aspect)
                            }
                        }
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                        .testTag("team-row-${a.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RobotFace(a, 48.dp, ring = if (attention?.agentId == a.id) Orbita.Warn else null)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(a.name, color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
                        Text(
                            attention?.takeIf { it.agentId == a.id }?.reason ?: task?.title ?: a.lastActivity ?: a.role,
                            color = Orbita.TextSoft,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Dot(activityColor(a.activity), pulse = a.activity == "working" || a.activity == "thinking")
                    Spacer(Modifier.width(6.dp))
                    Text(Labels.activity(a.activity), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.End)
                }
            }
        }
    }
}
