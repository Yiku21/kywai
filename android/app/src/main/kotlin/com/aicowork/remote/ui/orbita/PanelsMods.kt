package com.aicowork.remote.ui.orbita

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.ModPanelInfo
import com.aicowork.remote.data.model.ModPanelPage
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.i18n.t
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Pestaña «Mods»: los paneles de los mods encendidos en el ordenador, como en el escritorio. Cada uno es una página
 * aislada (sin archivos, sin navegar a otras páginas). Por el puente `KywaiBridge` puede pedir el contexto del proyecto
 * y, si su mod tiene el permiso «chat», proponer un mensaje que confirmas tú.
 */
@Composable
fun ModsPanel(model: OrbitaModel, state: CoworkUiState) {
    val snapshot = state.snapshot
    var panels by remember { mutableStateOf<List<ModPanelInfo>?>(null) }
    var pick by remember { mutableStateOf(0) }
    var page by remember { mutableStateOf<ModPanelPage?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        model.controller.modPanels().fold({ panels = it }, { error = it.message })
    }
    val current = panels?.getOrNull(pick.coerceAtMost((panels?.size ?: 1) - 1))
    LaunchedEffect(current?.mod, current?.id) {
        val c = current ?: return@LaunchedEffect
        page = null
        model.controller.modPanel(c.mod, c.id).fold({ page = it; error = null }, { error = it.message })
    }
    PanelColumn {
        PanelHeader(model, t("Mods"), current?.let { t("Panel del mod «{mod}»", "mod" to it.modTitle) }, icon = Icons.Outlined.Extension)
        val list = panels
        if (list != null && list.size > 1) {
            Segmented(
                list.indices.map { it to list[it].title },
                pick.coerceAtMost(list.size - 1),
                onSelect = { pick = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }
        Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
            when {
                error != null -> Note(Icons.Outlined.Info, t("No se pudo abrir el panel"), error)
                list == null -> CircularProgressIndicator(color = Orbita.Accent)
                list.isEmpty() -> Note(Icons.Outlined.Info, t("Sin paneles"), t("Ningún mod encendido tiene paneles. Se instalan en kywai del ordenador: Ajustes → Extensiones → Mods."))
                page == null -> CircularProgressIndicator(color = Orbita.Accent)
                else -> ModPage(model, current!!, page!!, snapshot)
            }
        }
    }
}

/** Lo que puede leer un panel, igual que en el escritorio: el proyecto, sus tareas y los últimos mensajes (solo texto). */
internal fun modContext(snapshot: Snapshot?): String {
    val tasks = snapshot?.tasks.orEmpty().sortedByDescending { it.createdAt ?: 0L }.take(30)
    val messages = snapshot?.conversation?.messages.orEmpty().takeLast(15)
    val projectName = snapshot?.let { s -> s.projects.firstOrNull { it.id == s.conversation.id }?.name ?: s.conversation.title }
    return buildJsonObject {
        put("kywai", "context")
        put("project", if (projectName == null) JsonNull else buildJsonObject { put("name", projectName) })
        put(
            "tasks",
            JsonArray(
                tasks.map {
                    buildJsonObject {
                        put("title", it.title)
                        put("status", it.status)
                        put("agent", it.agentId)
                        put("result", it.result.orEmpty().take(500))
                    }
                },
            ),
        )
        put("messages", JsonArray(messages.map { buildJsonObject { put("author", it.author.type); put("text", it.text.take(1000)) } }))
    }.toString()
}

/** Dirección de la página del panel (cargada sin dirección base). */
private const val PANEL_URL = "about:blank"

@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
@Composable
private fun ModPage(model: OrbitaModel, panel: ModPanelInfo, page: ModPanelPage, snapshot: Snapshot?) {
    val context = remember(snapshot) { modContext(snapshot) }
    val latest by rememberUpdatedState(context)
    var view by remember { mutableStateOf<WebView?>(null) }
    var proposal by remember(panel.mod, panel.id) { mutableStateOf<String?>(null) }
    val main = remember { Handler(Looper.getMainLooper()) }
    // El contexto solo va a la página del panel: si por lo que sea se cambia por otra, se le quita el puente.
    var left by remember(panel.mod, panel.id) { mutableStateOf(false) }
    fun push(w: WebView?) {
        if (w != null && !left && w.url == PANEL_URL) w.evaluateJavascript("window.postMessage($latest,'*')", null)
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                setBackgroundColor(android.graphics.Color.WHITE)
                settings.javaScriptEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.domStorageEnabled = false
                // La página no sale de sí misma: ningún enlace abre otra dentro (tendría el puente).
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true

                    // Un formulario con POST no pasa por shouldOverrideUrlLoading: se corta aquí.
                    override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                        if (url != PANEL_URL) {
                            left = true
                            view.stopLoading()
                            view.removeJavascriptInterface("KywaiBridge")
                        }
                    }
                    override fun onPageFinished(view: WebView, url: String?) {
                        push(view)
                    }
                }
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun context() {
                            main.post { push(this@apply) }
                        }

                        @JavascriptInterface
                        fun send(text: String) {
                            main.post {
                                val clean = text.trim().take(8000)
                                if (!left && page.chat && clean.isNotEmpty() && proposal == null) proposal = clean
                            }
                        }
                    },
                    "KywaiBridge",
                )
                loadDataWithBaseURL(PANEL_URL, page.html, "text/html", "utf-8", PANEL_URL)
                view = this
            }
        },
        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(18.dp)).background(Color.White).testTag("mod-panel"),
    )
    LaunchedEffect(context) { push(view) }
    DisposableEffect(Unit) {
        onDispose {
            view?.removeJavascriptInterface("KywaiBridge")
            view?.destroy()
        }
    }
    proposal?.let { text ->
        ConfirmDialog(
            title = t("El panel «{panel}» quiere enviar al chat", "panel" to panel.title),
            text = text,
            confirm = t("Enviar"),
            onConfirm = {
                proposal = null
                model.controller.sendMessage(text)
            },
            onDismiss = { proposal = null },
        )
    }
}
