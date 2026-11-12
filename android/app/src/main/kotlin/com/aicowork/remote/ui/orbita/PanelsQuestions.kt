package com.aicowork.remote.ui.orbita

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.AgentQuestion
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.ChatQuestions
import com.aicowork.remote.data.model.QuestionAnswer
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.i18n.t

/** La respuesta a una pregunta en una línea (lo escrito, la opción elegida o vacío si se omitió). */
fun answerLine(q: AgentQuestion, a: QuestionAnswer?): String {
    a?.text?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val op = a?.choice?.let { q.options.getOrNull(it) } ?: return ""
    return if (op.detail.isNullOrBlank()) op.label else "${op.label} (${op.detail})"
}

/**
 * Preguntas del agente con opciones, como la tarjeta de preguntas de Claude: una cada vez («1 de 3», con ‹ ›), las
 * opciones numeradas con su explicación, la que el agente cree mejor marcada «Recomendada» y, siempre al final, un
 * campo para escribir tu propia respuesta u «Omitir». Al contestar la última se envía todo al agente que preguntó (o
 * a Hermes). Con la ✕ se pliega sin contestar; contestadas, queda el resumen.
 */
@Composable
fun QuestionsCard(message: ChatMessage, questions: ChatQuestions, snapshot: Snapshot, model: OrbitaModel) {
    val items = questions.items
    if (items.isEmpty()) return
    val shape = RoundedCornerShape(18.dp)
    val answered = questions.answered
    if (answered != null) {
        Column(
            Modifier.padding(top = 8.dp).fillMaxWidth().clip(shape).background(Orbita.Card).border(1.dp, Orbita.CardEdge, shape).padding(12.dp)
                .testTag("questions-done-${message.id}"),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Orbita.Success, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(t("Contestado"), color = Orbita.Success, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            }
            items.forEachIndexed { i, q ->
                Text(q.question, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                Text(answerLine(q, answered.answers.getOrNull(i)).ifEmpty { t("Omitida") }, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium)
            }
        }
        return
    }

    var index by remember(message.id) { mutableIntStateOf(0) }
    var answers by remember(message.id) { mutableStateOf(List<QuestionAnswer?>(items.size) { null }) }
    var draft by remember(message.id) { mutableStateOf("") }
    var closed by remember(message.id) { mutableStateOf(false) }
    var busy by remember(message.id) { mutableStateOf(false) }
    val canAct = snapshot.capabilities.questions && !busy

    if (closed) {
        OrbitaButton(
            if (items.size == 1) t("Contestar la pregunta") else t("Contestar las {n} preguntas", "n" to items.size),
            onClick = { closed = false },
            icon = Icons.Outlined.HelpOutline,
            style = ButtonStyle.Secondary,
            height = 40.dp,
            modifier = Modifier.padding(top = 8.dp),
        )
        return
    }

    fun answer(value: QuestionAnswer) {
        if (!canAct) return
        val next = answers.toMutableList().also { it[index] = value }
        answers = next
        val after = next.indices.firstOrNull { it > index && next[it] == null }
        val go = after ?: next.indices.firstOrNull { next[it] == null }
        if (go != null) {
            index = go
            draft = next[go]?.text.orEmpty()
        } else {
            busy = true
            model.run({ model.controller.answerQuestions(message.id, next.map { it ?: QuestionAnswer(skipped = true) }) }) { busy = false }
        }
    }

    fun move(to: Int) {
        index = to.coerceIn(0, items.size - 1)
        draft = answers[index]?.text.orEmpty()
    }

    val q = items[index.coerceIn(0, items.size - 1)]
    val current = answers[index]
    Column(
        Modifier.padding(top = 8.dp).fillMaxWidth().clip(shape).background(Orbita.Card).border(1.dp, Orbita.AccentEdge, shape).animateContentSize()
            .padding(start = 12.dp, end = 6.dp, top = 10.dp, bottom = 10.dp).testTag("questions-${message.id}"),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(q.question, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(top = 6.dp))
            if (items.size > 1) {
                IconAction(Icons.Outlined.ChevronLeft, t("Pregunta anterior"), onClick = { if (index > 0) move(index - 1) }, size = 34.dp)
                Text(t("{i} de {n}", "i" to index + 1, "n" to items.size), color = Orbita.TextFaint, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 9.dp))
                IconAction(Icons.Outlined.ChevronRight, t("Pregunta siguiente"), onClick = { if (index < items.size - 1) move(index + 1) }, size = 34.dp)
            }
            IconAction(Icons.Outlined.Close, t("Cerrar sin contestar"), onClick = { closed = true }, size = 34.dp)
        }
        Spacer(Modifier.height(4.dp))
        q.options.forEachIndexed { i, op ->
            if (i > 0) Box(Modifier.fillMaxWidth().padding(end = 6.dp).height(1.dp).background(Orbita.Divider))
            Row(
                Modifier.fillMaxWidth().padding(end = 6.dp).clip(RoundedCornerShape(10.dp))
                    .background(if (current?.choice == i) Orbita.AccentSoft else androidx.compose.ui.graphics.Color.Transparent)
                    .tappable(enabled = canAct, haptic = Haptic.Select) { answer(QuestionAnswer(choice = i)) }
                    .padding(horizontal = 4.dp, vertical = 9.dp)
                    .testTag("question-option-$i"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NumberTile { Text("${i + 1}", color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(op.label, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f, fill = false))
                        if (op.recommended) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                t("Recomendada"),
                                color = Orbita.Success,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clip(Orbita.PillShape).background(Orbita.Success.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                    op.detail?.takeIf { it.isNotBlank() }?.let { Text(it, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        Box(Modifier.fillMaxWidth().padding(end = 6.dp).height(1.dp).background(Orbita.Divider))
        Row(Modifier.fillMaxWidth().padding(top = 8.dp, start = 4.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            NumberTile { Icon(Icons.Outlined.Edit, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(16.dp)) }
            Spacer(Modifier.width(12.dp))
            val send = { draft.trim().takeIf { it.isNotEmpty() }?.let { answer(QuestionAnswer(text = it.take(2000))) } }
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                enabled = canAct,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = Orbita.Text),
                cursorBrush = SolidColor(Orbita.Accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send, capitalization = KeyboardCapitalization.Sentences),
                keyboardActions = KeyboardActions(onSend = { send() }),
                modifier = Modifier.weight(1f).testTag("question-other"),
                decorationBox = { inner ->
                    Box {
                        if (draft.isEmpty()) Text(t("Otra cosa: escribe tu respuesta"), color = Orbita.TextFaint, style = MaterialTheme.typography.bodyLarge)
                        inner()
                    }
                },
            )
            Spacer(Modifier.width(8.dp))
            if (draft.isNotBlank()) {
                OrbitaButton(t("Enviar"), onClick = { send() }, icon = Icons.AutoMirrored.Outlined.Send, enabled = canAct, busy = busy, height = 40.dp)
            } else {
                OrbitaButton(t("Omitir"), onClick = { answer(QuestionAnswer(skipped = true)) }, style = ButtonStyle.Secondary, enabled = canAct, busy = busy, haptic = Haptic.Tap, height = 40.dp)
            }
        }
    }
}

@Composable
private fun NumberTile(content: @Composable () -> Unit) {
    Box(
        Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(Orbita.Glass).border(1.dp, Orbita.CardEdge, RoundedCornerShape(9.dp)),
        contentAlignment = Alignment.Center,
    ) { content() }
}
