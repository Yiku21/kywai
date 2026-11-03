import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Número de versión: los commits del repositorio. Así cada versión publicada es mayor que la anterior (Órbita solo
// ofrece una mayor que la suya y Android no instala encima una más antigua) sin tener que acordarse de subirlo. -PorbitaVersionCode=N lo fija (pruebas).
val orbitaVersionCode: Int = providers.gradleProperty("orbitaVersionCode").orNull?.toIntOrNull() ?: runCatching {
    val git = ProcessBuilder("git", "rev-list", "--count", "HEAD").directory(rootDir).redirectErrorStream(true).start()
    git.inputStream.bufferedReader().readText().trim().toInt().also { git.waitFor() }
}.getOrDefault(1)
val orbitaVersionName = "1.$orbitaVersionCode"

android {
    namespace = "com.aicowork.remote"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aicowork.remote"
        minSdk = 26
        targetSdk = 35
        versionCode = orbitaVersionCode
        versionName = orbitaVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Firma estable de la versión que se instala en el móvil, guardada fuera del repositorio: así cada versión nueva
    // se instala encima de la anterior y el móvil sigue emparejado. Se indica en ~/.gradle/gradle.properties con
    // aicoworkSigning=<ruta a un .properties con storeFile, storePassword, keyAlias y keyPassword>.
    val stableSigning = providers.gradleProperty("aicoworkSigning").orNull
        ?.let { File(it) }
        ?.takeIf { it.isFile }
        ?.let { file -> Properties().apply { file.inputStream().use { load(it) } } }
    signingConfigs {
        if (stableSigning != null) {
            create("stable") {
                storeFile = File(stableSigning.getProperty("storeFile"))
                storePassword = stableSigning.getProperty("storePassword")
                keyAlias = stableSigning.getProperty("keyAlias")
                keyPassword = stableSigning.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("stable")
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all { it.systemProperty("robolectric.logging.enabled", "false") }
        }
    }

    lint {
        abortOnError = true
        checkDependencies = false
        warningsAsErrors = false
    }

    packaging {
        resources {
            excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/LICENSE*", "/META-INF/versions/9/previous-compilation-data.bin")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    // Postura del plegable (medio doblado sobre la mesa, bisagra).
    implementation(libs.androidx.window)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)

    // El servidor simulado se incluye exclusivamente en las pruebas.
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)

    testImplementation(project(":mockserver"))
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.junit)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
}

// ./gradlew :app:publishOrbita compila la versión firmada y la deja en android/release/ (orbita.apk y orbita.json).
// Se sube con el resto del código; el ordenador la recibe con «Buscar actualizaciones» y Órbita se actualiza desde
// Ajustes → «Buscar actualizaciones», sin pasar la APK a mano.
val releaseApk = layout.buildDirectory.file("outputs/apk/release/app-release.apk")
val releaseDir = rootProject.layout.projectDirectory.dir("release")
tasks.register("publishOrbita") {
    group = "distribution"
    description = "Publica la versión firmada de Órbita en android/release/ para que el móvil se actualice desde el ordenador."
    dependsOn("assembleRelease")
    doLast {
        val apk = releaseApk.get().asFile
        check(apk.isFile) { "No hay APK firmada: falta aicoworkSigning (la clave estable) en ~/.gradle/gradle.properties." }
        val bytes = apk.readBytes()
        val out = releaseDir.asFile.apply { mkdirs() }
        File(out, "orbita.apk").writeBytes(bytes)
        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val builtAt = Instant.now().truncatedTo(ChronoUnit.SECONDS)
        File(out, "orbita.json").writeText(
            """{"versionCode":$orbitaVersionCode,"versionName":"$orbitaVersionName","sha256":"$sha256","builtAt":"$builtAt"}""" + "\n",
        )
        println("Órbita $orbitaVersionName publicada en ${out.path} (${bytes.size / 1024} KB)")
    }
}

// Las pruebas (incluidas las de Compose, que necesitan el manifiesto de ui-test-manifest) se ejecutan sobre la
// variante de depuración; el servidor simulado es una dependencia exclusiva de tests.
androidComponents {
    beforeVariants(selector().withBuildType("release")) { variant ->
        (variant as com.android.build.api.variant.HasUnitTestBuilder).enableUnitTest = false
    }
}
