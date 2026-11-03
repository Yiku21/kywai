package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.CoworkController
import com.aicowork.remote.data.store.InMemoryPreferencesStore
import com.aicowork.remote.data.store.PreferencesStore
import com.aicowork.remote.data.update.AppInstaller
import com.aicowork.remote.ui.space.WorldController

/** Estado de Órbita para las pruebas: sin sonidos ni movimiento reducido del sistema. */
fun orbitaModelForTests(
    controller: CoworkController,
    prefs: PreferencesStore = InMemoryPreferencesStore(),
    world: WorldController = WorldController(),
    installer: AppInstaller? = null,
) = OrbitaModel(controller, prefs, world, Feedback(null), null, systemReducedMotion = { false }, installer = installer)
