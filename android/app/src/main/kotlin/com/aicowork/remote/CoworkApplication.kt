package com.aicowork.remote

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.aicowork.remote.data.CoworkRepository
import com.aicowork.remote.data.store.FileSnapshotCache
import com.aicowork.remote.data.store.KeystoreTokenStore
import com.aicowork.remote.data.store.PrefsPreferencesStore
import com.aicowork.remote.data.store.PrefsSessionStore
import com.aicowork.remote.demo.createDemoServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

/** Dependencias de la app (sin framework de inyección: son pocas y así se ven de un vistazo). */
class AppContainer(context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val tokens = KeystoreTokenStore(context)
    val preferences = PrefsPreferencesStore(context)
    val demoServer = createDemoServer(context)
    val repository = CoworkRepository(
        sessions = PrefsSessionStore(context),
        tokens = tokens,
        cache = FileSnapshotCache(File(context.noBackupFilesDir, "snapshot.json")),
        scope = scope,
    )
    /** Notificaciones de «Te necesita» (solo mientras la app sigue conectada). */
    val inboxNotifier = InboxNotifier(context, repository, scope)
}

class CoworkApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        val repository = container.repository

        // Tras reiniciar la app en modo demostración, vuelve a levantar el servidor simulado con el mismo token.
        val session = repository.state.value.session
        val demo = container.demoServer
        if (session?.demo == true && demo != null) {
            container.scope.launch {
                runCatching { demo.start(container.tokens.read()) }
                repository.retryNow()
            }
        }

        // Tiempo real solo mientras la app está a la vista: ahorra batería y datos. Con la bandeja «Te necesita» la
        // conexión sigue unos minutos más en segundo plano para poder avisar con una notificación (sin servicio en
        // primer plano: Android puede cortarla antes).
        val lifecycle = ProcessLifecycleOwner.get().lifecycle
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            private var pendingDisconnect: Job? = null

            override fun onStart(owner: LifecycleOwner) {
                pendingDisconnect?.cancel()
                pendingDisconnect = null
                repository.connect()
            }

            override fun onStop(owner: LifecycleOwner) {
                pendingDisconnect?.cancel()
                if (repository.state.value.snapshot?.capabilities?.inbox != true) {
                    repository.disconnect()
                    return
                }
                pendingDisconnect = container.scope.launch(Dispatchers.Main) {
                    delay(BACKGROUND_GRACE_MS)
                    if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) repository.disconnect()
                }
            }
        })

        // Al recuperar la red, reconecta sin esperar al siguiente reintento.
        val connectivity = getSystemService(ConnectivityManager::class.java)
        connectivity?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) repository.retryNow()
            }
        })
    }

    private companion object {
        /** Cuánto sigue conectada en segundo plano (para las notificaciones de «Te necesita»). */
        const val BACKGROUND_GRACE_MS = 10 * 60_000L
    }
}
