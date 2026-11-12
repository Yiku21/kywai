package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.material.icons.outlined.TextFields
import androidx.compose.material.icons.automirrored.outlined.CallSplit
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloseFullscreen
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.OpenInFull
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.OutgoingMessage
import com.aicowork.remote.data.OutgoingStatus
import com.aicowork.remote.data.QueuedFile
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.ReplyRef
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.numberedTitle
import com.aicowork.remote.data.model.TaskItem
import com.aicowork.remote.ui.components.Format
import com.aicowork.remote.ui.components.Labels
import com.aicowork.remote.ui.components.parseColor

// ---------------------------------------------------------------------------------------------- Cabecera común

/** El panel se ve con el móvil plegado (pantalla exterior): ampliar es pantalla completa. */
val LocalCompactPanel = androidx.compose.runtime.staticCompositionLocalOf { false }

@Composable
fun PanelHeader(
    model: OrbitaModel,
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val compact = LocalCompactPanel.current
    // Chat, Archivos, Tareas y Resultados comparten pestañas (desplegado, aquí arriba; plegado, bajo la barra superior).
    val tabbed = model.section in panelTabs(compact)
    if (tabbed) {
        Row(Modifier.fillMaxWidth().padding(start = if (compact) 16.dp else 8.dp, end = 8.dp, top = if (compact) 6.dp else 10.dp), verticalAlignment = Alignment.CenterVertically) {
            // Plegado a pantalla completa no hay barra de arriba: las pestañas pasan aquí.
            if (compact && !model.isExpanded(true)) {
                Text(listOfNotNull(subtitle?.takeIf { it.isNotBlank() }, title).first(), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).semantics { heading() })
            } else {
                PanelTabs(model, compact = compact, modifier = Modifier.weight(1f))
            }
            trailing()
            PanelWindowActions(model, compact)
        }
        if (!compact && !subtitle.isNullOrBlank()) {
            Text(subtitle, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 2.dp, bottom = 4.dp).semantics { heading() })
        }
        return
    }
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 14.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = Orbita.Text, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = Orbita.Text, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            if (!subtitle.isNullOrBlank()) Text(subtitle, color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing()
        PanelWindowActions(model, compact)
    }
}

/** Ampliar/reducir y cerrar el panel. */
@Composable
private fun PanelWindowActions(model: OrbitaModel, compact: Boolean) {
    val expanded = model.isExpanded(compact)
    IconAction(
        if (expanded) Icons.Outlined.CloseFullscreen else Icons.Outlined.OpenInFull,
        when {
            compact && expanded -> t("Salir de pantalla completa")
            compact -> t("Pantalla completa")
            expanded -> t("Reducir el panel")
            else -> t("Ampliar el panel")
        },
        onClick = { model.toggleExpanded(compact) },
        modifier = Modifier.testTag("panel-expand"),
    )
    IconAction(Icons.Outlined.Close, t("Cerrar el panel"), onClick = { model.close() }, modifier = Modifier.testTag("panel-close"))
}

/** Columna de un panel: cabecera, contenido desplazable y acción principal abajo. */
@Composable
fun PanelColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize(), content = content)
}

// ---------------------------------------------------------------------------------------------- Chat

private sealed interface ChatRow {
    val key: String
    data class Server(val message: ChatMessage) : ChatRow { override val key get() = "m-${message.id}" }
    data class Local(val message: OutgoingMessage) : ChatRow { override val key get() = "o-${message.clientMessageId}" }
    data object Planning : ChatRow { override val key get() = "planning" }
}

@Composable
fun ChatPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val messages = snapshot?.conversation?.messages.orEmpty()
    val hermes = snapshot?.let { OrbitaModel.coordinator(it) }
    val planning = hermes != null && (hermes.activity == "thinking" || hermes.activity == "working") && snapshot.conversation.activeRequestIds.isNotEmpty()
    val rows = remember(messages, state.outgoing, planning || model.awaitingPlanSince != null) {
        messages.map { ChatRow.Server(it) } + state.outgoing.map { ChatRow.Local(it) } + listOfNotNull(if (planning || model.awaitingPlanSince != null) ChatRow.Planning else null)
    }
    val list = model.chatList
    // Al llegar algo nuevo, baja si ya estabas abajo (no interrumpe la lectura de mensajes anteriores).
    val atBottom by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= list.layoutInfo.totalItemsCount - 2 } ?: true } }
    // La primera vez se abre en lo último; después se respeta dónde estabas leyendo.
    LaunchedEffect(Unit) {
        if (!model.chatPositioned && rows.isNotEmpty()) {
            list.scrollToItem(rows.size - 1)
            model.chatPositioned = true
        }
    }
    LaunchedEffect(rows.size) {
        if (rows.isNotEmpty() && model.chatPositioned && (atBottom || rows.lastOrNull() is ChatRow.Local)) list.animateScrollToItem(rows.size - 1)
    }
    // El mensaje de una tarea crece mientras el agente cuenta lo que hace: si estabas abajo, se sigue viendo lo último.
    val growing = messages.lastOrNull()?.let { (it.work?.steps?.size ?: 0) to it.text.length }
    LaunchedEffect(growing) {
        if (rows.isNotEmpty() && model.chatPositioned && atBottom) list.animateScrollToItem(rows.size - 1, Int.MAX_VALUE / 2)
    }
    // Lo pide el buscador: bajar hasta el mensaje encontrado y resaltarlo un momento.
    val focus = model.focusMessageId
    LaunchedEffect(focus, rows) {
        if (focus == null) return@LaunchedEffect
        val i = rows.indexOfFirst { it is ChatRow.Server && it.message.id == focus }
        if (i < 0) return@LaunchedEffect
        model.chatPositioned = true
        list.scrollToItem(i)
        model.flashMessageId = focus
        model.focusMessageId = null
    }
    LaunchedEffect(model.flashMessageId) {
        if (model.flashMessageId != null) {
            kotlinx.coroutines.delay(2600)
            model.flashMessageId = null
        }
    }
    // Lo que acabas de enviar siempre se ve.
    LaunchedEffect(model.chatSends) {
        if (model.chatSends > 0 && rows.isNotEmpty()) list.animateScrollToItem(rows.size - 1)
    }
    // Lo que va con el próximo mensaje: adjuntos ya en el proyecto y copias guardadas sin conexión (id y nombre).
    val pending = snapshot?.conversation?.attachments.orEmpty().filter { it.id in model.pendingAttachments }.map { it.id to it.name } +
        state.queuedFiles.filter { it.localId in model.pendingAttachments }.map { it.localId to it.name } +
        snapshot?.conversation?.artifacts.orEmpty().filter { QueuedFile.ARTIFACT_ATTACHMENT + it.id in model.pendingAttachments }.map { QueuedFile.ARTIFACT_ATTACHMENT + it.id to it.name }
    PanelColumn {
        PanelHeader(model, t("Chat"), snapshot?.conversation?.let { c -> listOfNotNull(c.title, c.chat?.title).joinToString(" › ") } ?: t("Hermes y el equipo"))
        ActiveRequestStrip(model, snapshot)
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().testTag("chat-list"),
            state = list,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (rows.isEmpty()) item {
                Note(Icons.Outlined.TaskAlt, t("Pide algo al equipo"), t("Hermes lo reparte entre los agentes y verás a cada uno trabajar en el mundo."))
            }
            items(rows, key = { it.key }) { row ->
                when (row) {
                    // Mantener pulsado un mensaje abre su menú (Copiar, Seleccionar texto, Responder, Bifurcar, Editar);
                    // tras «Seleccionar texto», en ese mensaje el dedo selecciona palabras con sus tiradores.
                    is ChatRow.Server -> Box(
                        Modifier
                            .clip(RoundedCornerShape(18.dp))
                            .background(if (model.flashMessageId == row.message.id) Orbita.AccentSoft else androidx.compose.ui.graphics.Color.Transparent)
                            .testTag("msg-${row.message.id}"),
                    ) {
                        if (model.selectingMessageId == row.message.id) SelectionContainer { ServerMessage(row.message, snapshot!!, state, model) }
                        else MessageMenu(row.message, snapshot!!, model) { ServerMessage(row.message, snapshot, state, model) }
                    }
                    is ChatRow.Local -> SelectionContainer { LocalMessage(row.message, model) }
                    ChatRow.Planning -> PlanningBubble(hermes)
                }
            }
        }
        // Fotos que se están subiendo (o que fallaron) desde el botón de cámara.
        val uploading = state.uploads.filter { !it.done || it.error != null }
        if (uploading.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp).testTag("chat-uploads"), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                uploading.forEach { u ->
                    val failed = u.error != null
                    Row(Modifier.clip(Orbita.PillShape).background(if (failed) Orbita.Danger.copy(alpha = 0.18f) else Orbita.AccentSoft).padding(start = 10.dp, end = if (failed) 4.dp else 12.dp, top = 2.dp, bottom = 2.dp).heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (failed) Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = Orbita.Danger, modifier = Modifier.size(16.dp))
                        else CircularProgressIndicator(progress = { u.progress }, color = Orbita.Accent, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (failed) t("No se pudo subir {name}", "name" to u.name) else t("Subiendo {name}…", "name" to u.name),
                            color = Orbita.Text, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 200.dp),
                        )
                        if (failed) IconAction(Icons.Outlined.Close, t("Quitar {name}", "name" to u.name), onClick = { model.controller.dismissUpload(u.id) }, size = 32.dp)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        if (pending.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pending.take(3).forEach { (id, name) ->
                    Row(Modifier.clip(Orbita.PillShape).background(Orbita.AccentSoft).padding(start = 10.dp, end = 4.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (id.startsWith(QueuedFile.LOCAL_ATTACHMENT)) Icons.Outlined.Schedule else Icons.Outlined.AttachFile, contentDescription = null, tint = Orbita.Text, modifier = Modifier.size(16.dp))
                        Text(name, color = Orbita.Text, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 140.dp))
                        IconAction(Icons.Outlined.Close, t("Quitar {name}", "name" to name), onClick = { model.pendingAttachments = model.pendingAttachments - id }, size = 32.dp)
                    }
                }
                if (pending.size > 3) Text("+${pending.size - 3}", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, modifier = Modifier.align(Alignment.CenterVertically))
            }
            Spacer(Modifier.height(6.dp))
        }
        // «Editar» un mensaje tuyo: al enviar, sigue en este chat y lo de antes queda como otra versión (‹ ›).
        val editing = model.editTarget?.takeIf { e -> messages.any { it.id == e.id } }
        if (editing != null) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(12.dp)).background(Orbita.AccentSoft)
                    .padding(start = 12.dp, end = 4.dp, top = 2.dp, bottom = 2.dp).testTag("edit-bar"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Edit, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(t("Editando tu mensaje: lo de antes se guarda como otra versión"), color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconAction(Icons.Outlined.Close, t("Cancelar la edición"), onClick = { model.cancelEdit() }, size = 32.dp)
            }
            Spacer(Modifier.height(6.dp))
        }
        // «Responder»: la respuesta a la que contestas, encima del cuadro (solo si es de esta conversación).
        val reply = model.replyTarget?.takeIf { r -> snapshot?.capabilities?.replyTo == true && messages.any { it.id == r.messageId } }
        if (reply != null) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(12.dp)).background(Orbita.AccentSoft)
                    .padding(start = 12.dp, end = 4.dp, top = 2.dp, bottom = 2.dp).testTag("reply-bar"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Outlined.Reply, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(t("Respondes a {name}", "name" to reply.name), color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Spacer(Modifier.width(6.dp))
                Text("«${reply.excerpt}»", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconAction(Icons.Outlined.Close, t("No responder a esta respuesta"), onClick = { model.replyTarget = null }, size = 32.dp)
            }
            Spacer(Modifier.height(6.dp))
        }
        val voice = model.voice
        val voiceHere = when (voice) {
            is VoiceState.Recording -> voice.target == VoiceTarget.Chat
            is VoiceState.Transcribing -> voice.target == VoiceTarget.Chat
            is VoiceState.Failed -> voice.target == VoiceTarget.Chat
            VoiceState.Idle -> false
        }
        // «@» en cualquier parte del mensaje (donde esté el cursor): los agentes, para escribirle a uno directamente sin
        // pasar por Hermes.
        val directTargets = snapshot?.takeIf { it.capabilities.directMessages }?.let { DirectMention.targets(it.agents) }.orEmpty()
        val mention = if (!voiceHere && directTargets.isNotEmpty()) DirectMention.query(model.chatDraft.text, model.chatDraft.selection.end) else null
        val mentionList = mention?.let { DirectMention.matches(it.query, directTargets) }.orEmpty()
        if (mention != null && mentionList.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("mentions")) {
                Text(t("Directo, sin pasar por Hermes: recibe tu texto tal cual"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.height(6.dp))
                // Como la lista del «/»: el agente a la izquierda y su modelo a la derecha.
                Column(
                    Modifier.fillMaxWidth().heightIn(max = 232.dp).clip(RoundedCornerShape(16.dp)).background(Orbita.GlassPopover).verticalScroll(rememberScrollState()).padding(4.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    mentionList.forEach { a ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).tappable {
                                val (next, caret) = DirectMention.insert(model.chatDraft.text, mention, a)
                                model.chatDraft = TextFieldValue(next, selection = androidx.compose.ui.text.TextRange(caret))
                            }.padding(horizontal = 12.dp, vertical = 9.dp).testTag("mention-${a.id}"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Dot(parseColor(a.color), 8.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("@${a.name}", color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                            Spacer(Modifier.width(12.dp))
                            Text(a.modelLabel.ifBlank { a.role }, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.End, modifier = Modifier.weight(1f))
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
            }
        }
        // Órdenes que hace Órbita misma (no van a los agentes): «/model», «/uso» y «/nuevo». true si era una de ellas.
        fun runLocal(text: String): Boolean {
            when {
                OrbitaModel.isModelCommand(text) -> {
                    if (snapshot?.capabilities?.hermesModel == true) {
                        model.feedback.confirm()
                        model.hermesModelOpen = true
                    } else {
                        model.feedback.reject()
                        model.toast(t("Actualiza kywai en el ordenador para cambiar el modelo de Hermes desde aquí"), Toast.Tone.Error)
                        return true
                    }
                }
                ChatCommands.isUsageCommand(text) -> { model.feedback.confirm(); model.open(Section.Usage) }
                ChatCommands.isClearCommand(text) -> { model.feedback.confirm(); model.newChat() }
                else -> return false
            }
            model.chatDraft = TextFieldValue("")
            return true
        }
        // La lista de órdenes al escribir «/» (cada una con lo que hace) y la fila de plantillas encima del cuadro.
        if (!voiceHere) {
            ChatCommandList(model, snapshot) { cmd -> if (!runLocal(cmd)) model.chatDraft = TextFieldValue("$cmd ", selection = androidx.compose.ui.text.TextRange(cmd.length + 1)) }
            TemplateRow(model, snapshot, pending.map { it.first })
            // «/video …»: lo elegido (tipo, personaje, estilo y voz) y, al tocarlo, el selector.
            VideoPickerBar(model, snapshot)
        }
        if (voiceHere) {
            VoiceBar(model, voice, allowSend = true, modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 12.dp))
        } else Composer(
            value = model.chatDraft,
            onValue = { model.editDraft(VoiceTarget.Chat, it) },
            // Con un plan esperando tu visto bueno, lo que escribas son cambios a ese plan (o «sí» para aprobarlo).
            placeholder = if (model.dictation?.target == VoiceTarget.Chat) t("Habla, te escucho…") else if (reply != null) t("Qué revise o continúe {name} (vacío: que la revise)", "name" to reply.name) else if (messages.any { it.proposal?.isPending == true }) t("Qué cambiar del plan, o «sí»…") else t("Escribe una tarea o una pregunta…"),
            canSend = model.chatDraft.text.isNotBlank() || pending.isNotEmpty() || reply != null,
            onAttach = if (snapshot?.capabilities?.upload == true) ({ model.open(Section.Files); model.filesTab = FilesTab.Attachments }) else null,
            photo = if (snapshot?.capabilities?.upload == true) ({ PhotoButton(model, Modifier.padding(bottom = 4.dp)) }) else null,
            mic = model.canRecordNote(snapshot?.capabilities?.voice == true).let { note ->
                if (note || model.canDictate) ({ MicButton(model, VoiceTarget.Chat, note, Modifier.padding(bottom = 4.dp)) }) else null
            },
        ) {
            val text = model.chatDraft.text
            if (pending.isEmpty() && runLocal(text)) return@Composer
            model.cancelDictation()
            model.feedback.confirm()
            // «Responder»: va a ese mismo agente con su respuesta citada (las órdenes «/…» van como siempre).
            val replyId = reply?.messageId?.takeIf { !text.trimStart().startsWith("/") }
            if (editing != null) model.controller.sendEdit(text, editing.id, pending.map { it.first }, replyId)
            else if (replyId != null) model.controller.sendReply(text, replyId, pending.map { it.first })
            else model.controller.sendMessage(text, pending.map { it.first })
            model.editTarget = null
            if (replyId != null) model.replyTarget = null
            model.pendingAttachments = emptySet()
            model.chatDraft = TextFieldValue("")
            // Un mensaje directo no pasa por Hermes: no hay plan que esperar.
            if (replyId == null && DirectMention.target(text, directTargets) == null) model.awaitingPlanSince = System.currentTimeMillis()
            model.chatSends++
        }
    }
}

@Composable
private fun ActiveRequestStrip(model: OrbitaModel, snapshot: Snapshot?) {
    val active = snapshot?.conversation?.activeRequestIds.orEmpty()
    AnimatedVisibility(active.isNotEmpty() && snapshot != null, enter = fadeIn(), exit = fadeOut()) {
        val working = snapshot!!.tasks.count { it.requestId in active && it.status == "running" }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).card(radius = 18.dp).padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Dot(Orbita.Accent, pulse = true)
            Spacer(Modifier.width(10.dp))
            Text(if (working > 0) t("Trabajando · {working} {v1}", "working" to working, "v1" to (if (working == 1) t("tarea") else t("tareas"))) else t("Hermes está repartiendo el trabajo…"), color = Orbita.Text, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
            if (snapshot.capabilities.stopRequests) {
                var busy by remember { mutableStateOf(false) }
                OrbitaButton(t("Detener"), onClick = {
                    busy = true
                    model.run({ model.controller.stopRequest(active.last()) }) { busy = false }
                }, icon = Icons.Outlined.Pause, style = ButtonStyle.Danger, busy = busy, height = 40.dp)
            }
        }
    }
}

@Composable
private fun ServerMessage(message: ChatMessage, snapshot: Snapshot, state: CoworkUiState, model: OrbitaModel) {
    val author = message.author
    when {
        author.isUser -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
            message.replyTo?.let { r ->
                Row(Modifier.widthIn(max = 520.dp).padding(bottom = 4.dp, end = 6.dp).testTag("reply-quote"), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.AutoMirrored.Outlined.Reply, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(t("Sobre la respuesta de {name}: «{text}»", "name" to r.name, "text" to r.excerpt), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Column(Modifier.widthIn(max = 520.dp).clip(RoundedCornerShape(22.dp, 22.dp, 6.dp, 22.dp)).background(Orbita.UserBubble).border(1.dp, Orbita.AccentEdge.copy(alpha = 0.25f), RoundedCornerShape(22.dp, 22.dp, 6.dp, 22.dp)).padding(horizontal = 14.dp, vertical = 10.dp)) {
                if (message.text.isNotBlank()) Text(message.text, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge)
                // Las imágenes en miniatura; al tocar un adjunto se abre en el lector.
                ChatAttachments(message.attachments, model, canOpen = snapshot.capabilities.files)
            }
            // ‹ 2/3 ›: tu mensaje editado; las flechas enseñan otra versión de este punto del chat.
            val versions = message.versions?.takeIf { snapshot.capabilities.editInPlace }
            if (versions != null) {
                Row(Modifier.padding(top = 2.dp).testTag("versions-${message.id}"), verticalAlignment = Alignment.CenterVertically) {
                    IconAction(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, t("Versión anterior"), onClick = { model.switchVersion(message, versions.current - 1) }, size = 36.dp, enabled = versions.current > 0)
                    Text("${versions.current + 1}/${versions.total}", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    IconAction(Icons.AutoMirrored.Outlined.KeyboardArrowRight, t("Versión siguiente"), onClick = { model.switchVersion(message, versions.current + 1) }, size = 36.dp, enabled = versions.current < versions.total - 1)
                }
            }
            Row(Modifier.padding(top = 3.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                message.direct?.let { d ->
                    Text(t("Tú → {name} (directo, sin Hermes)", "name" to d.name), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.width(6.dp))
                }
                message.template?.let { tp ->
                    Text(t("Plantilla «{name}»", "name" to tp.name), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 200.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Text(Format.time(message.createdAt), color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium)
                if (message.clientMessageId != null && message.clientMessageId in state.delivered) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Outlined.DoneAll, contentDescription = t("Entregado"), tint = Orbita.Accent, modifier = Modifier.size(16.dp))
                    Text(t(" Entregado"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        author.isAgent -> {
            val agent = snapshot.agents.firstOrNull { it.id == author.agentId }
            Row(Modifier.fillMaxWidth()) {
                RobotFace(agent, 34.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text((agent?.name ?: author.name ?: t("Agente")) + (message.work?.by?.let { " · $it" } ?: ""), color = agent?.let { parseColor(it.color) } ?: Orbita.Accent, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(8.dp))
                        Text(Format.time(message.createdAt), color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium)
                    }
                    Spacer(Modifier.height(4.dp))
                    val error = message.tone == "error"
                    Box(Modifier.clip(RoundedCornerShape(6.dp, 22.dp, 22.dp, 22.dp)).background(if (error) Color(0x33FF6D7C) else Orbita.Card).border(1.dp, if (error) Color(0x55FF6D7C) else Orbita.CardEdge, RoundedCornerShape(6.dp, 22.dp, 22.dp, 22.dp)).padding(horizontal = 16.dp, vertical = 13.dp)) {
                        val work = message.work
                        // Lo que acaba de llegar se escribe al ritmo de la voz del agente.
                        val text = rememberRevealed(model, model.revealKey(message.id), message.text)
                        if (work == null) MarkdownText(text)
                        else Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            // Lo que va contando mientras trabaja y, al acabar, su resultado.
                            WorkBlock(message.id, work, agent?.let { parseColor(it.color) } ?: Orbita.Accent, snapshot, model)
                            if (message.text.isNotBlank()) MarkdownText(text)
                        }
                    }
                    // Plan de Hermes: a la espera de tu visto bueno (o ya en marcha, con sus tareas en vivo).
                    val proposal = message.proposal
                    if (proposal != null && proposal.status != "approved") ProposalCard(message, proposal, snapshot, model)
                    // Rutina que propone Hermes («Crear rutina»).
                    message.routineProposal?.let { RoutineProposalCard(message, it, snapshot, model) }
                    if (message.taskIds.isNotEmpty()) PlanTasksCard(message.taskIds, snapshot, model)
                    // Lo que entrega una tarea, junto en una carpeta que se despliega.
                    if (message.artifactIds.isNotEmpty()) DeliverablesCard(message.id, message.artifactIds, snapshot, model)
                    // «Responder»: lo siguiente que escribas va a este mismo agente para que revise o continúe esta respuesta.
                    if (snapshot.capabilities.replyTo && !message.streaming && !error && message.proposal?.isPending != true && message.text.isNotBlank()) {
                        val name = agent?.name ?: author.name ?: t("Agente")
                        val on = model.replyTarget?.messageId == message.id
                        Row(
                            Modifier.padding(top = 4.dp).clip(Orbita.PillShape).background(if (on) Orbita.AccentSoft else Color.Transparent)
                                .tappable {
                                    model.feedback.select()
                                    model.replyTarget = if (on) null else ReplyRef(message.id, author.agentId ?: "", name, replyExcerpt(message.text))
                                }
                                .padding(horizontal = 10.dp, vertical = 6.dp).testTag("reply-${message.id}"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.AutoMirrored.Outlined.Reply, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(t("Responder"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
        }
        else -> Text(
            message.text,
            color = if (message.tone == "error") Orbita.Danger else Orbita.TextSoft,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/**
 * Mantener pulsado un mensaje del chat (como el clic derecho del escritorio): Copiar, Seleccionar texto, Responder
 * (en una respuesta), Bifurcar desde aquí y, en uno tuyo, Editar (vuelve al cuadro; al enviarlo sigue en el mismo
 * chat y lo de antes queda como otra versión ‹ ›). Bifurcar pide `messageActions` y Editar `editInPlace`.
 */
@Composable
private fun MessageMenu(message: ChatMessage, snapshot: Snapshot, model: OrbitaModel, content: @Composable () -> Unit) {
    val author = message.author
    if (!author.isUser && !author.isAgent) return content()
    var open by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val agentName = snapshot.agents.firstOrNull { it.id == author.agentId }?.name ?: author.name ?: t("Agente")
    val error = message.tone == "error"
    val replyable = author.isAgent && snapshot.capabilities.replyTo && !message.streaming && !error && message.proposal?.isPending != true && message.text.isNotBlank()
    val forkable = snapshot.capabilities.messageActions && !message.streaming && snapshot.conversation.chat != null
    val hold = { model.feedback.select(); open = true }
    val label = t("Más opciones")
    // Sin clickable (que juntaría todo el mensaje en un solo nodo): los botones y enlaces de dentro siguen a lo suyo.
    Box(
        Modifier
            .pointerInput(message.id) { detectTapGestures(onLongPress = { hold() }) }
            .semantics { onLongClick(label) { hold(); true } }
            .testTag("msg-hold-${message.id}"),
    ) {
        content()
        DropdownMenu(open, onDismissRequest = { open = false }, containerColor = Orbita.GlassPopover) {
            if (message.text.isNotBlank()) {
                DropdownMenuItem(text = { Text(t("Copiar")) }, onClick = {
                    open = false
                    clipboard.setText(AnnotatedString(message.text))
                    model.toast(t("Copiado"))
                }, leadingIcon = { Icon(Icons.Outlined.ContentCopy, null) })
                DropdownMenuItem(text = { Text(t("Seleccionar texto")) }, onClick = { open = false; model.selectingMessageId = message.id }, leadingIcon = { Icon(Icons.Outlined.TextFields, null) })
            }
            if (replyable) {
                val on = model.replyTarget?.messageId == message.id
                DropdownMenuItem(
                    text = { Text(if (on) t("Dejar de responder a {name}", "name" to agentName) else t("Responder a {name}", "name" to agentName)) },
                    onClick = {
                        open = false
                        model.replyTarget = if (on) null else ReplyRef(message.id, author.agentId ?: "", agentName, replyExcerpt(message.text))
                    },
                    leadingIcon = { Icon(Icons.AutoMirrored.Outlined.Reply, null) },
                )
            }
            if (author.isUser && snapshot.capabilities.editInPlace) {
                DropdownMenuItem(text = { Text(t("Editar")) }, onClick = { open = false; model.startEdit(message) }, leadingIcon = { Icon(Icons.Outlined.Edit, null) })
            }
            if (forkable) {
                DropdownMenuItem(text = { Text(t("Bifurcar desde aquí")) }, onClick = { open = false; model.forkFromMessage(message) }, leadingIcon = { Icon(Icons.AutoMirrored.Outlined.CallSplit, null) })
            }
        }
    }
}

/** Devuelve un mensaje en cola al cuadro de texto, con sus adjuntos, para cambiarlo antes de que salga. */
private fun editQueued(message: OutgoingMessage, model: OrbitaModel) {
    val taken = model.controller.takeBackMessage(message.clientMessageId)
    if (taken == null) {
        model.toast(t("Ya se está enviando"))
        return
    }
    val text = listOf(taken.text, model.chatDraft.text).filter { it.isNotBlank() }.joinToString("\n")
    model.chatDraft = TextFieldValue(text, selection = androidx.compose.ui.text.TextRange(text.length))
    model.pendingAttachments = model.pendingAttachments + taken.attachmentIds +
        taken.files.map { it.attachmentId ?: it.localId }
    model.feedback.select()
}

@Composable
private fun LocalMessage(message: OutgoingMessage, model: OrbitaModel) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        val failed = message.status == OutgoingStatus.Failed
        Box(Modifier.widthIn(max = 520.dp).clip(RoundedCornerShape(22.dp, 22.dp, 6.dp, 22.dp)).background(if (failed) Color(0x40FF6D7C) else Orbita.UserBubble.copy(alpha = 0.5f)).padding(horizontal = 14.dp, vertical = 10.dp)) {
            Column {
                Text(message.text.ifBlank { t("(adjuntos)") }, color = Orbita.Text.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyLarge)
                message.files.forEach { f ->
                    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.AttachFile, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(14.dp))
                        Text(" " + f.name, color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Row(Modifier.padding(top = 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            when (message.status) {
                OutgoingStatus.Sending -> {
                    CircularProgressIndicator(Modifier.size(14.dp), color = Orbita.TextSoft, strokeWidth = 2.dp)
                    Text(t("  Enviando…"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                }
                OutgoingStatus.Queued -> {
                    Icon(Icons.Outlined.Schedule, contentDescription = null, tint = Orbita.Warn, modifier = Modifier.size(16.dp))
                    Text(t("  En cola: se enviará al reconectar"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                }
                OutgoingStatus.Failed -> {
                    Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = Orbita.Danger, modifier = Modifier.size(16.dp))
                    Text(t("  No se envió"), color = Orbita.Danger, style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.width(8.dp))
                    Text(t("Reintentar"), color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable { model.controller.retryMessage(message.clientMessageId) }.padding(8.dp))
                    Text(t("Descartar"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable { model.controller.discardMessage(message.clientMessageId) }.padding(8.dp))
                }
            }
        }
        if (message.status == OutgoingStatus.Queued) {
            // Mientras no sale, se puede volver a editar (vuelve al cuadro de texto) o quitar de la cola.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(t("Editar"), color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable { editQueued(message, model) }.padding(8.dp).testTag("queued-edit"))
                Text(t("Descartar"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable { model.controller.discardMessage(message.clientMessageId) }.padding(8.dp).testTag("queued-discard"))
            }
        }
        if (message.error != null && message.status == OutgoingStatus.Failed) {
            Text(message.error, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(end = 6.dp))
        }
    }
}

@Composable
private fun PlanningBubble(hermes: Agent?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RobotFace(hermes, 34.dp)
        Spacer(Modifier.width(10.dp))
        Row(Modifier.card(radius = 18.dp).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Dot(Orbita.Accent, 7.dp, pulse = true)
            Spacer(Modifier.width(5.dp))
            Dot(Orbita.Accent, 7.dp, pulse = true)
            Spacer(Modifier.width(5.dp))
            Dot(Orbita.Accent, 7.dp, pulse = true)
            Spacer(Modifier.width(10.dp))
            Text(t("{v1} está preparando el plan…", "v1" to (hermes?.name ?: "Hermes")), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** Campo de escritura con enviar (el teclado no tapa nada: el panel sube con él). */
@Composable
fun Composer(
    value: TextFieldValue,
    onValue: (TextFieldValue) -> Unit,
    placeholder: String,
    canSend: Boolean,
    onAttach: (() -> Unit)? = null,
    photo: (@Composable () -> Unit)? = null,
    mic: (@Composable () -> Unit)? = null,
    onSend: () -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 12.dp), verticalAlignment = Alignment.Bottom) {
        if (onAttach != null) {
            IconAction(Icons.Outlined.AttachFile, t("Añadir archivos"), onClick = onAttach, modifier = Modifier.padding(bottom = 4.dp))
        }
        if (photo != null) photo()
        val shape = RoundedCornerShape(24.dp)
        androidx.compose.foundation.text.BasicTextField(
            value = value,
            onValueChange = onValue,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Orbita.Text),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(Orbita.Accent),
            maxLines = 6,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences, imeAction = ImeAction.Default),
            modifier = Modifier.weight(1f).testTag("composer"),
            decorationBox = { inner ->
                Box(Modifier.clip(shape).background(Orbita.Card).border(1.dp, Orbita.GlassEdgeTop, shape).heightIn(min = 52.dp).padding(horizontal = 16.dp, vertical = 14.dp)) {
                    if (value.text.isEmpty()) Text(placeholder, color = Orbita.TextFaint, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                    inner()
                }
            },
        )
        if (mic != null) mic() else Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(if (canSend) Orbita.AccentButtonTop else Orbita.Divider)
                .tappable(enabled = canSend, haptic = Haptic.None, onClick = onSend)
                .semantics { contentDescription = t("Enviar") }
                .testTag("send"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = null, tint = if (canSend) Color.White else Orbita.TextFaint, modifier = Modifier.size(22.dp))
        }
    }
}

// ---------------------------------------------------------------------------------------------- Tareas

fun taskFilterOf(task: TaskItem, active: Set<String>): TaskFilter = when {
    task.isActive -> TaskFilter.Active
    task.status == "failed" -> TaskFilter.Review
    task.isPaused && task.requestId !in active -> TaskFilter.Review
    task.outOfScope.isNotEmpty() -> TaskFilter.Review
    else -> TaskFilter.Done
}

@Composable
fun TasksPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    val active = snapshot?.conversation?.activeRequestIds.orEmpty().toSet()
    val tasks = snapshot?.tasks.orEmpty().sortedByDescending { it.startedAt ?: it.createdAt ?: 0 }
    val groups = tasks.groupBy { taskFilterOf(it, active) }
    val shown = groups[model.taskFilter].orEmpty()
    val selected = tasks.firstOrNull { it.id == model.selectedTaskId }
    // Abierta desde fuera (el aviso de Hermes, su tarjeta): la lista baja hasta el detalle, que va al final.
    val planning = model.awaitingPlanSince != null && model.taskFilter == TaskFilter.Active
    val detailIndex = (if (planning) 1 else 0) + (if (shown.isEmpty()) 1 else 0) + shown.size
    LaunchedEffect(model.revealTask, selected?.id, detailIndex) {
        if (model.revealTask && selected != null) {
            model.tasksList.scrollToItem(detailIndex)
            model.revealTask = false
        }
    }
    PanelColumn {
        PanelHeader(model, t("Tareas"), when (tasks.size) { 0 -> t("Sin tareas"); 1 -> t("1 tarea"); else -> t("{size} tareas", "size" to tasks.size) })
        Segmented(
            TaskFilter.entries.map { it to it.label },
            model.taskFilter,
            onSelect = { model.taskFilter = it },
            counts = TaskFilter.entries.associateWith { groups[it]?.size ?: 0 },
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
        )
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().testTag("tasks-list"),
            state = model.tasksList,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (planning) item(key = "planning") {
                PlanningBubble(snapshot?.let { OrbitaModel.coordinator(it) })
            }
            if (shown.isEmpty()) item(key = "empty") {
                Note(
                    Icons.Outlined.TaskAlt,
                    when (model.taskFilter) { TaskFilter.Active -> t("Nada en curso"); TaskFilter.Review -> t("Nada por revisar"); TaskFilter.Done -> t("Aún no hay tareas hechas") },
                    when (model.taskFilter) {
                        TaskFilter.Active -> t("Crea una tarea y Hermes la repartirá.")
                        TaskFilter.Review -> t("Aquí aparecen las tareas que fallaron, las que están en pausa y las que tocaron archivos de otras.")
                        TaskFilter.Done -> null
                    },
                )
            }
            items(shown, key = { it.id }) { task ->
                TaskCard(task, snapshot!!, selected = task.id == model.selectedTaskId, model)
            }
            if (selected != null) item(key = "selected") { SelectedTask(selected, snapshot!!, model) }
        }
        OrbitaButton(
            t("Nueva tarea"),
            onClick = { model.newTaskOpen = true },
            icon = Icons.Outlined.Add,
            haptic = Haptic.Tap,
            modifier = Modifier.fillMaxWidth().padding(16.dp).testTag("new-task"),
        )
    }
}

@Composable
private fun TaskCard(task: TaskItem, snapshot: Snapshot, selected: Boolean, model: OrbitaModel) {
    val agent = snapshot.agents.firstOrNull { it.id == task.agentId }
    val active = snapshot.conversation.activeRequestIds
    var menu by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .card(selected = selected)
            .tappable(haptic = Haptic.Select) { model.selectedTaskId = if (selected) null else task.id }
            .padding(14.dp)
            .animateContentSize()
            .testTag("task-${task.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RobotFace(agent, 46.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(numberedTitle(task.seq, task.title), color = Orbita.Text, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(agent?.name ?: task.agentId, color = agent?.let { parseColor(it.color).copy(alpha = 0.9f) } ?: Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    Text("  ·  ", color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
                    val (label, color) = statusOf(task, active)
                    Text(label, color = color, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (task.status == "done") Icon(Icons.Outlined.CheckCircle, contentDescription = t("Hecha"), tint = Orbita.Success, modifier = Modifier.size(24.dp))
            Box {
                IconAction(Icons.Outlined.MoreHoriz, t("Opciones de la tarea"), onClick = { menu = true }, size = 40.dp)
                TaskMenu(menu, onDismiss = { menu = false }, task, snapshot, model)
            }
        }
        if (task.status == "running" || task.status == "done") {
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ProgressLine(if (task.status == "done") 1f else task.progress?.toFloat(), if (task.status == "done") Orbita.Success else Orbita.Accent, Modifier.weight(1f), animate = !model.reducedMotion())
                val pct = if (task.status == "done") 100 else task.progress?.let { (it * 100).toInt() }
                if (pct != null) Text("  $pct %", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

fun statusOf(task: TaskItem, active: List<String>): Pair<String, Color> = when {
    task.isPaused && task.requestId !in active -> t("En pausa") to Orbita.Warn
    task.status == "running" -> t("En curso") to Orbita.Accent
    task.status == "done" && task.outOfScope.isNotEmpty() -> t("Hecha · tocó otros archivos") to Orbita.Warn
    task.status == "done" -> t("Completada") to Orbita.Success
    task.status == "failed" -> t("Falló") to Orbita.Danger
    task.status == "blocked" -> t("Esperando a otra tarea") to Orbita.TextSoft
    task.status == "pending" -> t("Pendiente") to Orbita.TextSoft
    else -> Labels.taskStatus(task.status) to Orbita.TextSoft
}

@Composable
private fun TaskMenu(open: Boolean, onDismiss: () -> Unit, task: TaskItem, snapshot: Snapshot, model: OrbitaModel) {
    val active = snapshot.conversation.activeRequestIds
    DropdownMenu(open, onDismissRequest = onDismiss, containerColor = Orbita.GlassPopover) {
        DropdownMenuItem(text = { Text(t("Ver actividad")) }, onClick = { onDismiss(); model.traceTaskId = task.id }, leadingIcon = { Icon(Icons.Outlined.Description, null) })
        val requestId = task.requestId
        if (requestId != null && requestId in active && snapshot.capabilities.stopRequests) {
            DropdownMenuItem(text = { Text(t("Detener la petición")) }, onClick = { onDismiss(); model.run({ model.controller.stopRequest(requestId) }) }, leadingIcon = { Icon(Icons.Outlined.Pause, null) })
        }
        if (requestId != null && task.isPaused && requestId !in active && snapshot.capabilities.resumeRequests) {
            DropdownMenuItem(text = { Text(t("Reanudar")) }, onClick = { onDismiss(); model.run({ model.controller.resumeRequest(requestId) }) }, leadingIcon = { Icon(Icons.Outlined.PlayArrow, null) })
        }
        snapshot.conversation.artifacts.filter { it.taskId == task.id }.take(3).forEach { a ->
            DropdownMenuItem(text = { Text(t("Abrir {name}", "name" to a.name), maxLines = 1, overflow = TextOverflow.Ellipsis) }, onClick = { onDismiss(); model.viewer = ViewerTarget.Result(a.id, a.name, a.kind) }, leadingIcon = { Icon(Icons.Outlined.Description, null) })
        }
    }
}

@Composable
private fun SelectedTask(task: TaskItem, snapshot: Snapshot, model: OrbitaModel) {
    val agent = snapshot.agents.firstOrNull { it.id == task.agentId }
    val active = snapshot.conversation.activeRequestIds
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(t("Seleccionada"), color = Orbita.TextSoft, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
        Column(Modifier.fillMaxWidth().card().padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RobotFace(agent, 52.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(numberedTitle(task.seq, task.title), color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
                    Text(t("Responsable: {v1}", "v1" to (agent?.name ?: task.agentId)), color = Orbita.Accent.copy(alpha = 0.9f), style = MaterialTheme.typography.bodyMedium)
                }
            }
            val now = when {
                task.status == "failed" -> task.error ?: t("Falló sin más detalle")
                task.isPaused && snapshot.capabilities.discardRequests -> t("En pausa: puedes reanudarla o quitarla")
                task.isPaused -> t("En pausa: puedes reanudarla")
                task.status == "done" -> task.result?.lineSequence()?.firstOrNull { it.isNotBlank() } ?: t("Terminada")
                else -> task.lastActivity ?: Labels.taskStatus(task.status)
            }
            Spacer(Modifier.height(10.dp))
            Text(now, color = if (task.status == "failed") Orbita.Danger else Orbita.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.fillMaxWidth().card(radius = 16.dp).padding(12.dp))
            if (task.description.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(task.description, color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, maxLines = 6, overflow = TextOverflow.Ellipsis)
            }
            task.acceptance?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(t("Hecha cuando: {it}", "it" to it), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            if (task.outOfScope.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = Orbita.Warn, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(t("Modificó archivos de otras tareas: {v1}", "v1" to (task.outOfScope.take(4).joinToString())), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).card(radius = 16.dp).tappable { model.traceTaskId = task.id }.padding(horizontal = 14.dp).testTag("open-trace"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Description, contentDescription = null, tint = Orbita.Text, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text(t("Ver actividad"), color = Orbita.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
            }
            val requestId = task.requestId
            if (requestId != null && requestId in active && snapshot.capabilities.stopRequests) {
                Spacer(Modifier.height(10.dp))
                var busy by remember { mutableStateOf(false) }
                OrbitaButton(t("Detener la petición"), onClick = { busy = true; model.run({ model.controller.stopRequest(requestId) }) { busy = false } }, icon = Icons.Outlined.Pause, style = ButtonStyle.Danger, busy = busy, modifier = Modifier.fillMaxWidth())
            } else if (requestId != null && task.isPaused && snapshot.capabilities.resumeRequests) {
                Spacer(Modifier.height(10.dp))
                var busy by remember { mutableStateOf(false) }
                var confirmDiscard by remember { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OrbitaButton(t("Reanudar"), onClick = { busy = true; model.run({ model.controller.resumeRequest(requestId) }) { busy = false } }, icon = Icons.Outlined.PlayArrow, busy = busy, modifier = Modifier.weight(1f).testTag("task-resume"))
                    // Quitar: deja de estar en pausa (y de avisar) sin reanudarse; lo ya hecho se queda.
                    if (snapshot.capabilities.discardRequests) {
                        OrbitaButton(t("Quitar"), onClick = { confirmDiscard = true }, icon = Icons.Outlined.Close, style = ButtonStyle.Secondary, enabled = !busy, modifier = Modifier.weight(1f).testTag("task-discard"))
                    }
                }
                if (confirmDiscard) {
                    val halfDone = snapshot.tasks.count { it.requestId == requestId && it.isPaused }
                    ConfirmDialog(
                        title = t("¿Quitar lo que quedó en pausa?"),
                        text = (if (halfDone == 1) t("La tarea no se reanudará.") else t("Las {halfDone} tareas en pausa de esta petición no se reanudarán.", "halfDone" to halfDone)) + t(" Lo que ya se hizo y los archivos se quedan como están."),
                        confirm = t("Quitar"),
                        danger = true,
                        onConfirm = {
                            confirmDiscard = false
                            busy = true
                            model.run({ model.controller.discardRequest(requestId) }) { busy = false }
                        },
                        onDismiss = { confirmDiscard = false },
                    )
                }
            }
        }
    }
}

/** El principio de una respuesta en una línea, para la cita de «Responder» (como replyExcerpt del escritorio). */
internal fun replyExcerpt(text: String, max: Int = 90): String {
    val flat = text
        .replace(Regex("```[\\s\\S]*?(```|$)"), " ")
        .replace(Regex("[#>*_`|]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
    return if (flat.length > max) flat.take(max - 1).trimEnd() + "…" else flat
}
