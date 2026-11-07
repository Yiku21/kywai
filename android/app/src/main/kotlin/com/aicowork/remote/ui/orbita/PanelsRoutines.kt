package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.I18n
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
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.Routine
import com.aicowork.remote.data.model.RoutineInput
import com.aicowork.remote.data.model.RoutineProposal
import com.aicowork.remote.data.model.RoutineTrigger
import com.aicowork.remote.data.model.Snapshot
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit

/**
 * Textos de las rutinas, iguales que los del escritorio (src/shared/routines.ts). Las horas son las del ordenador;
 * aquí se leen con la zona del móvil, que normalmente es la misma.
 */
object RoutineText {
    /** 0 = domingo … 6 = sábado (como en el servidor); la semana se enseña empezando el lunes. */
    val weekOrder = listOf(1, 2, 3, 4, 5, 6, 0)

    private fun dow(d: Int): DayOfWeek = if (d == 0) DayOfWeek.SUNDAY else DayOfWeek.of(d)

    fun dayName(d: Int): String = dow(d).getDisplayName(TextStyle.FULL, I18n.locale)
    fun dayShort(d: Int): String = dow(d).getDisplayName(TextStyle.SHORT, I18n.locale).replaceFirstChar { it.titlecase(I18n.locale) }

    fun describeDays(days: List<Int>): String {
        val set = days.toSet()
        if (set.size == 7) return t("todos los días")
        if (set == setOf(1, 2, 3, 4, 5)) return t("de lunes a viernes")
        if (set == setOf(0, 6)) return t("los fines de semana")
        val names = weekOrder.filter { it in set }.map { dayName(it) }
        return if (names.size <= 1) names.joinToString() else names.dropLast(1).joinToString(", ") + t(" y ") + names.last()
    }

    fun describe(trigger: RoutineTrigger, now: Long = System.currentTimeMillis()): String = when (trigger.type) {
        "daily" -> t("Cada día a las {time}", "time" to trigger.time.orEmpty())
        "weekly" -> t("{days} a las {time}", "days" to describeDays(trigger.days.orEmpty()).replaceFirstChar { it.titlecase(I18n.locale) }, "time" to trigger.time.orEmpty())
        "interval" -> if ((trigger.hours ?: 1) == 1) t("Cada hora") else t("Cada {hours} horas", "hours" to trigger.hours)
        "once" -> onceAt(trigger)?.let { t("Una vez: {when}", "when" to describeWhen(it, now)) } ?: t("Una vez")
        "webhook" -> t("Al llegar un webhook")
        "folder" -> if (trigger.path.isNullOrBlank()) t("Al cambiar archivos del proyecto") else t("Al cambiar archivos de {path}", "path" to trigger.path)
        else -> trigger.type
    }

    /** «hoy a las 09:00», «mañana a las 09:00», «el lunes 9/11 a las 09:00». */
    fun describeWhen(ts: Long, now: Long = System.currentTimeMillis()): String {
        val zone = ZoneId.systemDefault()
        val at = Instant.ofEpochMilli(ts).atZone(zone)
        val time = "%02d:%02d".format(at.hour, at.minute)
        return when (ChronoUnit.DAYS.between(Instant.ofEpochMilli(now).atZone(zone).toLocalDate(), at.toLocalDate())) {
            0L -> t("hoy a las {time}", "time" to time)
            1L -> t("mañana a las {time}", "time" to time)
            -1L -> t("ayer a las {time}", "time" to time)
            else -> t("el {day} {date} a las {time}", "day" to dayName(at.dayOfWeek.value % 7), "date" to "${at.dayOfMonth}/${at.monthValue}", "time" to time)
        }
    }

    fun onceAt(trigger: RoutineTrigger): Long? {
        val date = runCatching { LocalDate.parse(trigger.date.orEmpty()) }.getOrNull() ?: return null
        val time = normalizeTime(trigger.time.orEmpty())?.let { LocalTime.parse(it) } ?: return null
        return LocalDateTime.of(date, time).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    }

    /** «9», «9:5», «09.30», «21h» → «HH:MM»; null si no es una hora válida. */
    fun normalizeTime(raw: String): String? {
        val m = Regex("""^\s*(\d{1,2})(?:\s*[:.h]\s*(\d{1,2}))?\s*h?\s*$""", RegexOption.IGNORE_CASE).find(raw) ?: return null
        val h = m.groupValues[1].toInt()
        val min = m.groupValues[2].ifEmpty { "0" }.toInt()
        if (h > 23 || min > 59) return null
        return "%02d:%02d".format(h, min)
    }

    fun status(status: String): String = when (status) {
        "running" -> t("En marcha")
        "waiting" -> t("Esperando tu visto bueno")
        "ok" -> t("Hecha")
        "failed" -> t("Falló")
        "skipped" -> t("Saltada")
        else -> t("Interrumpida")
    }
}

// ---------------------------------------------------------------------------------------------- Rutinas

/** Rutinas del proyecto: peticiones que se lanzan solas (a una hora, una sola vez, por webhook o carpeta). */
@Composable
fun RoutinesPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val conversation = snapshot?.conversation?.id
    val supported = snapshot?.capabilities?.routines == true
    val canEdit = snapshot?.capabilities?.routinesEdit == true
    val routines = if (state.routinesFor == conversation) state.routines else null
    var editing by remember { mutableStateOf<String?>(null) }
    // Se piden al abrir la sección y al cambiar de proyecto; los cambios llegan después por el WebSocket.
    LaunchedEffect(conversation, supported) { if (supported && conversation != null) model.controller.loadRoutines() }
    PanelColumn {
        PanelHeader(model, t("Rutinas"), icon = Icons.Outlined.Schedule)
        LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("routines-list"), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text(
                    t("Peticiones que se envían solas al chat de este proyecto, como si las escribieras tú. También puedes escribir «/rutina mañana a las 7: …» en el chat, o pedírselo a Hermes."),
                    color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
            if (!supported) item {
                Note(Icons.Outlined.Info, t("No disponible"), t("Para ver las rutinas desde el móvil, actualiza kywai en el ordenador."))
            } else if (!canEdit) item {
                Note(Icons.Outlined.Info, t("Solo lectura"), t("Para crear y cambiar rutinas desde el móvil, actualiza kywai en el ordenador."))
            }
            if (editing == "") item(key = "new") { RoutineForm(null, model, onDone = { editing = null }) }
            if (supported && routines == null) item { Text(t("Cargando…"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium) }
            if (routines != null && routines.isEmpty() && editing != "") item {
                Text(t("Sin rutinas. Por ejemplo: cada mañana a las 8:30, «revisa las dependencias y avísame de las que tengan fallos de seguridad»."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 4.dp))
            }
            items(routines.orEmpty(), key = { it.id }) { r ->
                if (editing == r.id) RoutineForm(r, model, onDone = { editing = null })
                else RoutineCard(r, model, canEdit, onEdit = { editing = r.id })
            }
        }
        if (canEdit && editing == null) {
            OrbitaButton(t("Nueva rutina"), onClick = { editing = "" }, icon = Icons.Outlined.Add, haptic = Haptic.Tap, modifier = Modifier.fillMaxWidth().padding(16.dp).testTag("routine-new"))
        }
    }
}

@Composable
private fun RoutineCard(r: Routine, model: OrbitaModel, canEdit: Boolean, onEdit: () -> Unit) {
    var busy by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val last = r.runs.lastOrNull()
    Column(Modifier.fillMaxWidth().card().padding(14.dp).animateContentSize().testTag("routine-${r.id}")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(r.name, color = if (r.enabled) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val next = r.nextAt
                Text(
                    listOfNotNull(
                        RoutineText.describe(r.trigger),
                        if (r.askApproval) t("con tu visto bueno") else null,
                        when {
                            r.enabled && next != null -> t("próxima {when}", "when" to RoutineText.describeWhen(next))
                            !r.enabled && r.trigger.type == "once" && last != null -> t("ya se lanzó")
                            !r.enabled -> t("desactivada")
                            else -> null
                        },
                    ).joinToString(" · "),
                    color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall,
                )
            }
            if (canEdit) Switch(
                checked = r.enabled,
                onCheckedChange = { on -> busy = "switch"; model.run({ model.controller.setRoutineEnabled(r.id, on) }) { busy = null } },
                enabled = busy == null,
                colors = SwitchDefaults.colors(checkedTrackColor = Orbita.Accent),
                modifier = Modifier.semantics { contentDescription = if (r.enabled) t("Desactivar la rutina") else t("Activar la rutina") }.testTag("routine-switch-${r.id}"),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(r.request, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 4, overflow = TextOverflow.Ellipsis)
        if (last != null) {
            Spacer(Modifier.height(6.dp))
            Text(t("Última: {status} · {when}", "status" to RoutineText.status(last.status), "when" to RoutineText.describeWhen(last.at)), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OrbitaButton(t("Ejecutar ahora"), onClick = {
                busy = "run"
                model.run({ model.controller.runRoutine(r.id) }) { busy = null }
            }, icon = Icons.Outlined.PlayArrow, style = ButtonStyle.Secondary, busy = busy == "run", enabled = busy == null, height = 42.dp, modifier = Modifier.weight(1f).testTag("routine-run-${r.id}"))
            if (canEdit) {
                IconAction(Icons.Outlined.Edit, t("Editar"), onClick = onEdit, size = 42.dp)
                IconAction(Icons.Outlined.Delete, t("Borrar"), onClick = { confirmDelete = true }, size = 42.dp)
            }
        }
    }
    if (confirmDelete) ConfirmDialog(
        t("¿Borrar «{name}»?", "name" to r.name),
        t("Se borra la rutina y su historial. Lo que ya hizo sigue en el chat."),
        t("Borrar"),
        onConfirm = { confirmDelete = false; model.run({ model.controller.deleteRoutine(r.id) }) },
        onDismiss = { confirmDelete = false },
        danger = true,
    )
}

/** Crear (sin [initial]) o editar una rutina. Las de webhook o carpeta se editan sin tocar su disparador. */
@Composable
private fun RoutineForm(initial: Routine?, model: OrbitaModel, onDone: () -> Unit) {
    val scheduled = initial == null || initial.trigger.type in listOf("daily", "weekly", "interval", "once")
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var request by remember { mutableStateOf(initial?.request.orEmpty()) }
    var type by remember { mutableStateOf(initial?.trigger?.type?.takeIf { scheduled } ?: "daily") }
    var time by remember { mutableStateOf(initial?.trigger?.time ?: "09:00") }
    var days by remember { mutableStateOf(initial?.trigger?.days ?: listOf(1, 2, 3, 4, 5)) }
    var hours by remember { mutableStateOf((initial?.trigger?.hours ?: 6).toString()) }
    var date by remember { mutableStateOf(initial?.trigger?.date ?: LocalDate.now().plusDays(1).toString()) }
    var askApproval by remember { mutableStateOf(initial?.askApproval == true) }
    var busy by remember { mutableStateOf(false) }

    val normalizedTime = RoutineText.normalizeTime(time)
    val trigger: RoutineTrigger? = when {
        !scheduled -> initial!!.trigger
        type == "daily" -> normalizedTime?.let { RoutineTrigger("daily", time = it) }
        type == "weekly" -> normalizedTime?.takeIf { days.isNotEmpty() }?.let { RoutineTrigger("weekly", time = it, days = days.sorted()) }
        type == "interval" -> hours.toIntOrNull()?.takeIf { it in 1..168 }?.let { RoutineTrigger("interval", hours = it) }
        else -> normalizedTime?.takeIf { runCatching { LocalDate.parse(date) }.isSuccess }?.let { RoutineTrigger("once", time = it, date = date) }
    }
    val valid = name.isNotBlank() && request.trim().length >= 3 && trigger != null

    Column(Modifier.fillMaxWidth().card(selected = true).padding(14.dp).testTag("routine-form")) {
        Text(if (initial == null) t("Nueva rutina") else t("Editar la rutina"), color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(10.dp))
        OrbitaField(name, { name = it }, t("Nombre"), autoFocus = initial == null)
        Spacer(Modifier.height(8.dp))
        OrbitaField(request, { request = it }, t("Petición (lo que se enviará al chat)"), singleLine = false, minLines = 2, maxLines = 6, imeAction = ImeAction.Default)
        Spacer(Modifier.height(10.dp))
        if (scheduled) {
            Segmented(listOf("daily" to t("Cada día"), "weekly" to t("Días"), "interval" to t("Cada N h"), "once" to t("Una vez")), type, { type = it })
            Spacer(Modifier.height(10.dp))
            if (type == "weekly") {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    RoutineText.weekOrder.forEach { d ->
                        val on = d in days
                        Box(
                            Modifier
                                .weight(1f)
                                .heightIn(min = 40.dp)
                                .clip(Orbita.PillShape)
                                .background(if (on) Orbita.AccentSoft else Orbita.Card)
                                .border(1.dp, if (on) Orbita.AccentEdge else Orbita.Divider, Orbita.PillShape)
                                .tappable(role = Role.Checkbox, haptic = Haptic.Select) { days = if (on) days - d else days + d }
                                .semantics { contentDescription = RoutineText.dayName(d) }
                                .testTag("routine-day-$d"),
                            contentAlignment = Alignment.Center,
                        ) { Text(RoutineText.dayShort(d).take(2), color = if (on) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.labelMedium) }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            if (type == "once") {
                OrbitaField(date, { date = it }, t("Día (AAAA-MM-DD)"))
                Spacer(Modifier.height(8.dp))
            }
            if (type == "interval") OrbitaField(hours, { hours = it.filter { c -> c.isDigit() }.take(3) }, t("Cada cuántas horas (1 a 168)"))
            else OrbitaField(time, { time = it }, t("Hora del ordenador (09:00)"))
        }
        Spacer(Modifier.height(6.dp))
        Text(trigger?.let { RoutineText.describe(it) + "." } ?: t("Revisa la hora, los días o el número de horas."), color = if (trigger == null) Orbita.Warn else Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).tappable(role = Role.Checkbox, haptic = Haptic.Select) { askApproval = !askApproval }.testTag("routine-ask")) {
            Checkbox(askApproval, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = Orbita.Accent))
            Spacer(Modifier.width(4.dp))
            Text(t("Pedir mi visto bueno a su plan antes de empezar (si no, la rutina sigue sola aunque no estés)"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OrbitaButton(t("Cancelar"), onClick = onDone, style = ButtonStyle.Ghost, haptic = Haptic.Tap, height = 46.dp, modifier = Modifier.weight(1f))
            OrbitaButton(if (initial == null) t("Crear rutina") else t("Guardar"), onClick = {
                val tr = trigger ?: return@OrbitaButton
                busy = true
                model.run({ model.controller.saveRoutine(initial?.id, RoutineInput(name.trim(), request.trim(), tr, askApproval)) }) { busy = false; if (it.ok) onDone() }
            }, busy = busy, enabled = valid && !busy, height = 46.dp, modifier = Modifier.weight(1f).testTag("routine-save"))
        }
    }
}

// ---------------------------------------------------------------------------------------------- En el chat

/** Rutina que propone Hermes: «Crear rutina», «Cambiar» (la orden al cuadro de texto) o «Descartar». */
@Composable
fun RoutineProposalCard(message: ChatMessage, proposal: RoutineProposal, snapshot: Snapshot, model: OrbitaModel) {
    val pending = proposal.isPending
    var busy by remember { mutableStateOf<Boolean?>(null) }
    val shape = RoundedCornerShape(18.dp)
    val green = Orbita.Success
    val canAct = snapshot.capabilities.routineProposals
    Column(
        Modifier
            .padding(top = 8.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(if (pending) green.copy(alpha = 0.10f) else Orbita.Card)
            .border(1.dp, if (pending) green.copy(alpha = 0.40f) else Orbita.CardEdge, shape)
            .animateContentSize()
            .padding(12.dp)
            .testTag("routine-proposal-${message.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(green.copy(alpha = if (pending) 0.18f else 0.10f)), contentAlignment = Alignment.Center) {
                Icon(
                    when (proposal.status) {
                        "created" -> Icons.Outlined.CheckCircle
                        "dismissed" -> Icons.Outlined.Close
                        else -> Icons.Outlined.Schedule
                    },
                    contentDescription = null, tint = if (pending) green else Orbita.TextSoft, modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    when (proposal.status) {
                        "created" -> t("Rutina creada: {name}", "name" to proposal.name)
                        "dismissed" -> t("Rutina descartada: {name}", "name" to proposal.name)
                        else -> t("Rutina propuesta: {name}", "name" to proposal.name)
                    },
                    color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                )
                Text(RoutineText.describe(proposal.trigger), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (pending) {
            Spacer(Modifier.height(8.dp))
            Text(proposal.request, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OrbitaButton(
                    t("Crear rutina"),
                    onClick = { busy = true; model.run({ model.controller.decideRoutineProposal(message.id, create = true) }) { busy = null } },
                    icon = Icons.Outlined.Schedule,
                    busy = busy == true,
                    enabled = busy == null && canAct,
                    height = 44.dp,
                    modifier = Modifier.weight(1f).testTag("routine-proposal-create"),
                )
                IconAction(Icons.Outlined.EditNote, t("Cambiar"), onClick = { model.editInChat(proposal.command) }, size = 44.dp)
                OrbitaButton(
                    t("Descartar"),
                    onClick = { busy = false; model.run({ model.controller.decideRoutineProposal(message.id, create = false) }) { busy = null } },
                    style = ButtonStyle.Secondary,
                    busy = busy == false,
                    enabled = busy == null && canAct,
                    haptic = Haptic.Tap,
                    height = 44.dp,
                    modifier = Modifier.testTag("routine-proposal-dismiss"),
                )
            }
        } else if (proposal.status == "created") {
            Spacer(Modifier.height(8.dp))
            Text(
                t("Ver en Rutinas"),
                color = Orbita.Accent,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.clip(Orbita.PillShape).tappable(haptic = Haptic.Tap) { model.open(Section.Routines) }.padding(horizontal = 6.dp, vertical = 6.dp).testTag("routine-proposal-open"),
            )
        }
    }
}
