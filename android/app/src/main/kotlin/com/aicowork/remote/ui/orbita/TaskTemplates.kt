package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskTemplate
import com.aicowork.remote.data.model.TaskTemplateInput
import com.aicowork.remote.ui.components.parseColor
import java.text.Normalizer

/**
 * Reglas de las plantillas de tareas: huecos entre llaves ({pr}, {carpeta}), rellenarlos y las órdenes «/…».
 * Copia de src/shared/templates.ts: si cambian las reglas, cambiarlas en los dos.
 */
object TemplateRules {
    private val SLOT = Regex("\\{(\\p{L}[\\p{L}\\p{N}_-]{0,30})\\}")
    private const val MAX_SLOTS = 6

    /** Los huecos del texto, en orden y sin repetir. */
    fun slots(prompt: String): List<String> = SLOT.findAll(prompt).map { it.groupValues[1] }.distinct().take(MAX_SLOTS).toList()

    /** «nombre-del_archivo» → «Nombre del archivo». */
    fun label(slot: String): String = slot.replace(Regex("[_-]+"), " ").trim().replaceFirstChar { it.uppercase() }

    /** El texto con los huecos rellenos (los que no tienen valor quedan vacíos). */
    fun fill(prompt: String, values: Map<String, String>): String =
        SLOT.replace(prompt) { m -> values[m.groupValues[1]]?.trim().orEmpty() }.replace(Regex("[ \\t]+\\n"), "\n").trim()

    /** Las de este proyecto y las generales; las fijadas primero. */
    fun forProject(list: List<TaskTemplate>, projectId: String?): List<TaskTemplate> =
        list.filter { it.projectId == null || it.projectId == projectId }
            .sortedWith(compareByDescending<TaskTemplate> { it.pinned }.thenBy { it.createdAt ?: 0L })

    /** Lo que se escribe tras «/» al principio del cuadro (null si no se está escribiendo una orden). */
    fun commandQuery(text: String): String? = Regex("^/([a-z0-9-]*)$", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.lowercase()

    private fun fold(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

    /** La orden que sale del nombre: «Revisar PR» → «revisar-pr». */
    fun commandFromName(name: String): String {
        val slug = fold(name).replace(Regex("[^a-z0-9]+"), "-").trim('-').take(30).trimEnd('-')
        return when {
            slug.isEmpty() -> ""
            slug.first().isLetter() -> slug
            else -> "p-$slug".take(30)
        }
    }
}

/**
 * Fila de plantillas encima del cuadro del chat: un toque la envía (con huecos, antes se rellenan); manteniéndola
 * pulsada, editarla, fijarla o borrarla; «+» crea una nueva. Con un ordenador anterior no sale.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TemplateRow(model: OrbitaModel, snapshot: Snapshot?, attachmentIds: List<String>) {
    if (snapshot?.capabilities?.templates != true) return
    val list = TemplateRules.forProject(snapshot.templates, snapshot.conversation.id)
    var filling by remember { mutableStateOf<TaskTemplate?>(null) }
    var editing by remember { mutableStateOf<TaskTemplate?>(null) }
    var creating by remember { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<TaskTemplate?>(null) }

    fun launch(tpl: TaskTemplate, text: String) {
        model.feedback.confirm()
        model.controller.sendTemplate(text, tpl.id, attachmentIds)
        model.pendingAttachments = emptySet()
        // Directa a un agente no pasa por Hermes: no hay plan que esperar.
        if (tpl.agentId == null) model.awaitingPlanSince = System.currentTimeMillis()
        model.chatSends++
    }

    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp).testTag("templates"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        list.forEach { tpl ->
            Box {
                Row(
                    Modifier
                        .clip(Orbita.PillShape)
                        .background(if (menuFor == tpl.id) Orbita.AccentSoft else Orbita.Card)
                        .border(1.dp, if (tpl.pinned) Orbita.Accent else Orbita.GlassEdgeTop, Orbita.PillShape)
                        .combinedClickable(
                            onClick = {
                                if (TemplateRules.slots(tpl.prompt).isEmpty()) launch(tpl, TemplateRules.fill(tpl.prompt, emptyMap()))
                                else { model.feedback.tap(); filling = tpl }
                            },
                            onLongClick = { model.feedback.select(); menuFor = tpl.id },
                            onLongClickLabel = t("Más opciones"),
                        )
                        .heightIn(min = 36.dp)
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                        .testTag("template-${tpl.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!tpl.icon.isNullOrBlank()) {
                        Text(tpl.icon, style = MaterialTheme.typography.labelLarge)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(tpl.name, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp))
                }
                DropdownMenu(expanded = menuFor == tpl.id, onDismissRequest = { menuFor = null }, containerColor = Orbita.GlassPopover) {
                    DropdownMenuItem(
                        text = { Text(t("Editar…"), color = Orbita.Text) },
                        leadingIcon = { Icon(Icons.Outlined.Edit, null, tint = Orbita.TextSoft) },
                        onClick = { menuFor = null; editing = tpl },
                        modifier = Modifier.testTag("template-menu-edit"),
                    )
                    DropdownMenuItem(
                        text = { Text(if (tpl.pinned) t("Quitar de fijadas") else t("Fijar al principio"), color = Orbita.Text) },
                        leadingIcon = { Icon(Icons.Outlined.PushPin, null, tint = Orbita.TextSoft) },
                        onClick = {
                            menuFor = null
                            model.run({ model.controller.updateTemplate(tpl.id, TaskTemplateInput(pinned = !tpl.pinned), if (tpl.pinned) t("Plantilla quitada de fijadas") else t("Plantilla fijada")) })
                        },
                        modifier = Modifier.testTag("template-menu-pin"),
                    )
                    DropdownMenuItem(
                        text = { Text(t("Borrar"), color = Orbita.Danger) },
                        leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null, tint = Orbita.Danger) },
                        onClick = { menuFor = null; deleting = tpl },
                        modifier = Modifier.testTag("template-menu-delete"),
                    )
                }
            }
        }
        Row(
            Modifier
                .clip(Orbita.PillShape)
                .border(1.dp, Orbita.Divider, Orbita.PillShape)
                .tappable(haptic = Haptic.Tap) { creating = true }
                .heightIn(min = 36.dp)
                .padding(horizontal = 10.dp, vertical = 6.dp)
                .testTag("template-new"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Add, contentDescription = t("Nueva plantilla"), tint = Orbita.TextSoft, modifier = Modifier.size(18.dp))
            if (list.isEmpty()) {
                Spacer(Modifier.width(4.dp))
                Text(t("Plantilla"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
    Spacer(Modifier.height(6.dp))

    filling?.let { tpl -> FillDialog(tpl, onDismiss = { filling = null }) { text -> filling = null; launch(tpl, text) } }
    if (creating || editing != null) {
        TemplateEditorDialog(model, snapshot, editing, onDismiss = { creating = false; editing = null })
    }
    deleting?.let { tpl ->
        ConfirmDialog(
            title = t("¿Borrar la plantilla «{name}»?", "name" to tpl.name),
            text = if (tpl.builtin != null) t("Es de serie: puedes volver a ponerla al crear o editar una plantilla.") else t("No se puede deshacer."),
            confirm = t("Borrar"),
            onConfirm = { deleting = null; model.run({ model.controller.deleteTemplate(tpl.id) }) },
            onDismiss = { deleting = null },
            danger = true,
        )
    }
}

/** «/» al principio del cuadro: las órdenes de las plantillas que encajan; al tocar una queda «/orden ». */
@Composable
fun TemplateCommandList(model: OrbitaModel, snapshot: Snapshot?) {
    if (snapshot?.capabilities?.templates != true) return
    val q = TemplateRules.commandQuery(model.chatDraft.text) ?: return
    val list = TemplateRules.forProject(snapshot.templates, snapshot.conversation.id).filter { it.command.startsWith(q) }.take(8)
    if (list.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("template-commands")) {
        Text(t("Plantillas: elige una y escribe detrás lo que cambia"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            list.forEach { tpl ->
                Row(
                    Modifier.clip(Orbita.PillShape).background(Orbita.AccentSoft).tappable {
                        val next = "/${tpl.command} "
                        model.chatDraft = TextFieldValue(next, selection = androidx.compose.ui.text.TextRange(next.length))
                    }.padding(horizontal = 12.dp, vertical = 8.dp).testTag("template-command-${tpl.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("/${tpl.command}", color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(6.dp))
                    Text(tpl.name, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                }
            }
        }
        Spacer(Modifier.height(4.dp))
    }
}

/** Rellenar los huecos de una plantilla antes de enviarla, con la vista previa del texto. */
@Composable
internal fun FillDialog(tpl: TaskTemplate, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    val slots = remember(tpl.prompt) { TemplateRules.slots(tpl.prompt) }
    val values = remember(tpl.id) { mutableStateMapOf<String, String>() }
    val ready = slots.all { !values[it].isNullOrBlank() }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xF20E1730),
        title = { Text(listOfNotNull(tpl.icon?.takeIf { it.isNotBlank() }, tpl.name).joinToString(" "), color = Orbita.Text) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                slots.forEachIndexed { i, k ->
                    Text(TemplateRules.label(k), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    OrbitaField(
                        value = values[k].orEmpty(),
                        onValueChange = { values[k] = it },
                        placeholder = TemplateRules.label(k),
                        imeAction = if (i == slots.lastIndex) ImeAction.Send else ImeAction.Next,
                        onIme = { if (i == slots.lastIndex && ready) onSend(TemplateRules.fill(tpl.prompt, values)) },
                        autoFocus = i == 0,
                        modifier = Modifier.testTag("template-slot-$i"),
                    )
                }
                Text(
                    TemplateRules.fill(tpl.prompt, slots.associateWith { values[it]?.trim()?.ifEmpty { null } ?: "{$it}" }),
                    color = Orbita.TextFaint,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSend(TemplateRules.fill(tpl.prompt, values)) }, enabled = ready, modifier = Modifier.testTag("template-send")) {
                Text(t("Enviar"), color = if (ready) Orbita.Accent else Orbita.TextFaint)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
    )
}

/** Crear o editar una plantilla: emoji, nombre, texto con huecos, orden, dónde sale, quién la hace y el visto bueno. */
@Composable
private fun TemplateEditorDialog(model: OrbitaModel, snapshot: Snapshot, template: TaskTemplate?, onDismiss: () -> Unit) {
    val agents = remember(snapshot.agents) { DirectMention.targets(snapshot.agents) }
    var icon by remember { mutableStateOf(template?.icon.orEmpty()) }
    var name by remember { mutableStateOf(template?.name.orEmpty()) }
    var prompt by remember { mutableStateOf(template?.prompt.orEmpty()) }
    var command by remember { mutableStateOf(template?.let { tp -> tp.command.takeIf { it != TemplateRules.commandFromName(tp.name) } }.orEmpty()) }
    var onlyHere by remember { mutableStateOf(template?.projectId != null) }
    var agentId by remember { mutableStateOf(template?.agentId) }
    var askPlan by remember { mutableStateOf(template?.askPlan == true) }
    var agentMenu by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    val projectId = template?.projectId ?: snapshot.conversation.id
    val slots = TemplateRules.slots(prompt)
    val ready = name.isNotBlank() && prompt.isNotBlank() && !saving

    fun save() {
        if (!ready) return
        saving = true
        val input = TaskTemplateInput(
            name = name.trim(),
            prompt = prompt.trim(),
            icon = icon.trim(),
            command = command.trim().removePrefix("/"),
            projectId = if (onlyHere && projectId != null) projectId else "",
            agentId = agentId.orEmpty(),
            askPlan = agentId == null && askPlan,
        )
        model.run({ if (template == null) model.controller.createTemplate(input) else model.controller.updateTemplate(template.id, input) }) {
            saving = false
            if (it.ok) onDismiss()
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xF20E1730),
        title = { Text(if (template == null) t("Nueva plantilla de tarea") else t("Editar plantilla"), color = Orbita.Text) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(t("Una petición que repites a menudo, para lanzarla con un toque desde encima del chat."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OrbitaField(value = icon, onValueChange = { icon = it.take(8) }, placeholder = "✨", modifier = Modifier.width(72.dp).testTag("template-icon"))
                    OrbitaField(value = name, onValueChange = { name = it.take(60) }, placeholder = t("Nombre del botón"), autoFocus = template == null, modifier = Modifier.weight(1f).testTag("template-name"))
                }
                OrbitaField(
                    value = prompt,
                    onValueChange = { prompt = it.take(8000) },
                    placeholder = t("Lo que se envía"),
                    singleLine = false,
                    minLines = 3,
                    imeAction = ImeAction.Default,
                    modifier = Modifier.testTag("template-prompt"),
                )
                Text(
                    if (slots.isNotEmpty()) t("Al lanzarla te pedirá: {slots}.", "slots" to slots.joinToString(", ") { TemplateRules.label(it) })
                    else t("Pon entre llaves lo que cambia cada vez, como {pr} o {carpeta}: al lanzarla te lo pedirá.", "pr" to "{pr}", "carpeta" to "{${t("carpeta")}}"),
                    color = Orbita.TextFaint,
                    style = MaterialTheme.typography.labelSmall,
                )
                OrbitaField(
                    value = command,
                    onValueChange = { command = it.lowercase().take(31) },
                    placeholder = "/" + (TemplateRules.commandFromName(name).ifEmpty { "plantilla" }),
                    modifier = Modifier.testTag("template-command"),
                )
                Text(t("Orden para escribirla en el chat"), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall)
                if (projectId != null) {
                    SwitchLine(t("Solo en este proyecto"), onlyHere, "template-only-here") { onlyHere = it }
                }
                Box {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(Orbita.Card)
                            .tappable(haptic = Haptic.Tap) { agentMenu = true }
                            .padding(horizontal = 14.dp, vertical = 12.dp)
                            .testTag("template-agent"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(t("Quién la hace"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                            Text(
                                agentId?.let { id -> agents.firstOrNull { it.id == id }?.let { t("Directo a {name}, sin Hermes", "name" to it.name) } ?: t("{name} (ya no está en el equipo)", "name" to id) }
                                    ?: t("Hermes reparte el trabajo"),
                                color = Orbita.Text,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    DropdownMenu(expanded = agentMenu, onDismissRequest = { agentMenu = false }, containerColor = Orbita.GlassPopover) {
                        DropdownMenuItem(text = { Text(t("Hermes reparte el trabajo"), color = Orbita.Text) }, onClick = { agentId = null; agentMenu = false })
                        agents.forEach { a ->
                            DropdownMenuItem(
                                text = { Text(t("Directo a {name}, sin Hermes", "name" to a.name), color = Orbita.Text) },
                                leadingIcon = { Dot(parseColor(a.color), 8.dp) },
                                onClick = { agentId = a.id; agentMenu = false },
                            )
                        }
                    }
                }
                if (agentId == null) SwitchLine(t("Pedir mi visto bueno al plan antes de empezar (aunque en Ajustes esté apagado)"), askPlan, "template-ask-plan") { askPlan = it }
                TextButton(onClick = { model.run({ model.controller.restoreTemplates() }) { if (it.ok) onDismiss() } }, modifier = Modifier.testTag("template-restore")) {
                    Icon(Icons.Outlined.Refresh, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(t("Volver a poner las de serie"), color = Orbita.TextSoft)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { save() }, enabled = ready, modifier = Modifier.testTag("template-save")) {
                Text(if (template == null) t("Crear plantilla") else t("Guardar"), color = if (ready) Orbita.Accent else Orbita.TextFaint)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancelar"), color = Orbita.TextSoft) } },
    )
}

@Composable
private fun SwitchLine(label: String, checked: Boolean, tag: String, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(10.dp))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Orbita.Accent),
            modifier = Modifier.testTag(tag),
        )
    }
}
