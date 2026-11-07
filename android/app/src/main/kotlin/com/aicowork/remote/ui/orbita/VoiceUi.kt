package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay

/**
 * Botón del micrófono: graba una nota de voz que el ordenador convierte en texto con su dictado (como el escritorio).
 * La primera vez pide el permiso del micrófono.
 */
@Composable
fun MicButton(model: OrbitaModel, target: VoiceTarget, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) model.startVoice(target)
        else {
            model.feedback.reject()
            model.toast(t("Sin permiso para el micrófono: actívalo en Ajustes › Aplicaciones › AI Cowork › Permisos."), Toast.Tone.Error)
        }
    }
    IconAction(
        Icons.Outlined.Mic,
        t("Grabar una nota de voz"),
        onClick = {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) model.startVoice(target)
            else ask.launch(Manifest.permission.RECORD_AUDIO)
        },
        modifier = modifier.testTag("mic"),
    )
}

/** Barra de la nota de voz: grabando (tiempo y onda), pasando a texto o fallida (reintentar sin volver a grabar). */
@Composable
fun VoiceBar(model: OrbitaModel, state: VoiceState, allowSend: Boolean, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(26.dp)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .clip(shape)
            .background(Color(0x40101A30))
            .border(1.dp, if (state is VoiceState.Failed) Color(0x66FF6D7C) else Orbita.AccentEdge, shape)
            .padding(horizontal = 6.dp)
            .testTag("voice-bar"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (state) {
            is VoiceState.Recording -> Recording(model, allowSend)
            is VoiceState.Transcribing -> {
                var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
                LaunchedEffect(state) {
                    while (true) {
                        now = System.currentTimeMillis()
                        delay(1_000)
                    }
                }
                Spacer(Modifier.width(10.dp))
                CircularProgressIndicator(Modifier.size(20.dp), color = Orbita.Accent, strokeWidth = 2.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f).padding(vertical = 8.dp).semantics { liveRegion = LiveRegionMode.Polite }) {
                    Text(if (state.send) t("Pasando a texto para enviarla…") else t("Pasando tu nota a texto en el ordenador…"), color = Orbita.Text, style = MaterialTheme.typography.bodyMedium)
                    if (now - state.since > 12_000) {
                        Text(t("La primera vez el ordenador prepara el dictado y puede tardar unos minutos."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            is VoiceState.Failed -> {
                Spacer(Modifier.width(10.dp))
                Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = Orbita.Danger, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(state.message, color = Orbita.Text, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(t("Reintentar"), color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(Orbita.PillShape).tappable(haptic = Haptic.Tap) { model.retryVoice() }.padding(10.dp))
                IconAction(Icons.Outlined.Close, t("Descartar la nota"), onClick = { model.discardVoice() }, size = 40.dp)
            }
            VoiceState.Idle -> Unit
        }
    }
}

@Composable
private fun RowScope.Recording(model: OrbitaModel, allowSend: Boolean) {
    val rec = model.recorder
    val levels = remember { mutableStateListOf<Float>() }
    var elapsed by remember { mutableLongStateOf(0L) }
    var on by remember { mutableStateOf(true) }
    LaunchedEffect(rec) {
        while (rec != null) {
            levels.add(rec.level)
            while (levels.size > 40) levels.removeAt(0)
            elapsed = rec.elapsedMillis
            on = (elapsed / 600) % 2 == 0L
            delay(80)
        }
    }
    IconAction(Icons.Outlined.Close, t("Cancelar la nota"), onClick = { model.cancelVoice() }, size = 44.dp)
    Box(Modifier.size(10.dp).clip(CircleShape).background(if (on) Orbita.Danger else Orbita.Danger.copy(alpha = 0.4f)))
    Spacer(Modifier.width(8.dp))
    val seconds = elapsed / 1000
    Text("%d:%02d".format(seconds / 60, seconds % 60), color = Orbita.Text, style = MaterialTheme.typography.labelLarge, modifier = Modifier.semantics { contentDescription = t("Grabando, {seconds} segundos", "seconds" to seconds) })
    Spacer(Modifier.width(10.dp))
    Canvas(Modifier.weight(1f).height(32.dp)) {
        val bars = 40
        val w = size.width / bars
        val offset = bars - levels.size
        levels.forEachIndexed { i, l ->
            val h = (4.dp.toPx() + l * (size.height - 4.dp.toPx())).coerceAtMost(size.height)
            drawRoundRect(
                Orbita.Accent.copy(alpha = 0.85f),
                topLeft = Offset((offset + i) * w + w * 0.2f, (size.height - h) / 2),
                size = Size(w * 0.6f, h),
                cornerRadius = CornerRadius(w * 0.3f),
            )
        }
    }
    Spacer(Modifier.width(6.dp))
    IconAction(Icons.Outlined.Check, t("Terminar y revisar el texto"), onClick = { model.finishVoice(send = false) }, tint = Orbita.Text, size = 44.dp, modifier = Modifier.testTag("voice-review"))
    if (allowSend) {
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Orbita.AccentButtonTop)
                .tappable(haptic = Haptic.None) { model.finishVoice(send = true) }
                .semantics { contentDescription = t("Terminar y enviar") }
                .testTag("voice-send"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(2.dp))
    }
}

