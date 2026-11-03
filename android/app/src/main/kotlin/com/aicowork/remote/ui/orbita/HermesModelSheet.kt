package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.HermesChoice
import com.aicowork.remote.data.model.HermesModelsInfo
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.launch

/** Modelos que se listan a la vez (un proveedor puede tener más de mil: el buscador encuentra el resto). */
private const val SHOWN = 250

/**
 * «/model» en el chat: el modelo con el que trabaja Hermes y los de cada proveedor con el que tiene sesión, como
 * `hermes model` en la terminal del ordenador. Elegir uno lo usa desde el próximo encargo.
 */
@Composable
fun HermesModelSheet(model: OrbitaModel) {
    var info by remember { mutableStateOf<HermesModelsInfo?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var provider by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var picked by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        model.controller.hermesModels().fold(
            { i ->
                info = i
                provider = i.providers.firstOrNull { it.id == i.current.provider }?.id ?: i.providers.firstOrNull()?.id
            },
            { error = it.message ?: "No se pudo consultar el ordenador" },
        )
    }
    fun choose(choice: HermesChoice?) {
        saving = true
        scope.launch {
            model.controller.setHermesModel(choice).fold(
                { i ->
                    info = i
                    picked = null
                    model.feedback.confirm()
                    model.toast(
                        if (choice == null) "Hermes vuelve a usar el modelo de su configuración" else "Hermes usará ${choice.model} desde el próximo encargo",
                        Toast.Tone.Success,
                    )
                },
                { e ->
                    model.feedback.reject()
                    error = e.message ?: "No se pudo cambiar"
                },
            )
            saving = false
        }
    }

    val current = info?.current
    val models = info?.providers?.firstOrNull { it.id == provider }?.models.orEmpty()
    val needle = query.trim().lowercase()
    val matches = remember(models, needle) { if (needle.isEmpty()) models else models.filter { needle in it.lowercase() } }

    Column(Modifier.fillMaxWidth().widthIn(max = 760.dp).fillMaxHeight().glass(radius = 30.dp, tint = Orbita.GlassSolid).testTag("hermes-model")) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 8.dp, top = 12.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Memory, null, tint = Orbita.Accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Modelo de Hermes", color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
                Text("Con el que Hermes planifica y reparte el trabajo, como «hermes model» en el ordenador", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            IconAction(Icons.Outlined.Close, "Cerrar", onClick = { model.hermesModelOpen = false })
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (current != null) {
                Column(Modifier.fillMaxWidth().card(selected = true).padding(14.dp).testTag("hermes-current")) {
                    Text("Ahora", color = Orbita.TextSoft, style = MaterialTheme.typography.labelMedium)
                    Text(current.model.ifBlank { "El de su configuración" }, color = Orbita.Text, style = Mono, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOf(current.provider.ifBlank { "su proveedor" }, if (current.fromApp) "elegido en AI Cowork" else "el de la configuración de Hermes").joinToString(" · "),
                        color = Orbita.TextSoft,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (current.fromApp) {
                        Spacer(Modifier.padding(top = 8.dp))
                        OrbitaButton("Volver al de Hermes", onClick = { choose(null) }, icon = Icons.Outlined.Undo, style = ButtonStyle.Secondary, enabled = !saving, haptic = Haptic.Tap, height = 42.dp)
                    }
                }
            }
            when {
                error != null -> Text(error!!, color = Orbita.Warn, style = MaterialTheme.typography.bodySmall)
                info == null -> Text("Preguntando al ordenador…", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
                info?.installed == false || info?.providers.isNullOrEmpty() ->
                    Text("Hermes no tiene listas de modelos en el ordenador: ejecuta «hermes model» allí una vez.", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            val providers = info?.providers.orEmpty()
            if (providers.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("hermes-providers")) {
                    items(providers, key = { it.id }) { p ->
                        val on = p.id == provider
                        Column(
                            Modifier
                                .card(radius = 16.dp, selected = on)
                                .tappable(haptic = Haptic.Select) { provider = p.id; picked = null; query = "" }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            Text(p.label, color = if (on) Orbita.Text else Orbita.TextSoft, style = MaterialTheme.typography.titleSmall)
                            Text("${p.models.size}${if (p.id == current?.provider) " · actual" else ""}", color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                OrbitaField(query, { query = it }, "Buscar entre ${models.size} modelos", leading = Icons.Outlined.Search, modifier = Modifier.testTag("hermes-search"))
                LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("hermes-models"), contentPadding = PaddingValues(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(matches.take(SHOWN), key = { it }) { m ->
                        val on = m == picked
                        val isCurrent = m == current?.model && provider == current.provider
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .card(radius = 14.dp, selected = on)
                                .tappable(haptic = Haptic.Select) { picked = m }
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(m, color = if (on) Orbita.Text else Orbita.TextSoft, style = Mono, modifier = Modifier.weight(1f))
                            if (isCurrent) Icon(Icons.Outlined.Check, "Actual", tint = Orbita.Accent)
                        }
                    }
                    if (matches.size > SHOWN) item {
                        Text("Y ${matches.size - SHOWN} más: busca para encontrarlos.", color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(8.dp))
                    }
                    if (matches.isEmpty() && models.isNotEmpty()) item {
                        Text("Ningún modelo contiene «${query.trim()}».", color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(8.dp))
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            info?.updatedAt?.let {
                Text("Listas de Hermes del ${Format.dateTime(it)}. Para actualizarlas: «hermes model --refresh» en el ordenador.", color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
            }
            OrbitaButton(
                picked?.let { "Usar $it" } ?: "Elige un modelo",
                onClick = { val p = provider; val m = picked; if (p != null && m != null) choose(HermesChoice(p, m)) },
                icon = Icons.Outlined.Check,
                enabled = picked != null && provider != null && !saving,
                busy = saving,
                modifier = Modifier.fillMaxWidth().testTag("hermes-use"),
            )
        }
    }
}
