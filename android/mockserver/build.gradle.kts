plugins {
    alias(libs.plugins.kotlin.jvm)
    application
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

application {
    mainClass.set("com.aicowork.mock.MainKt")
}

dependencies {
    api(libs.okhttp.mockwebserver)
    api(libs.okhttp.tls)
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
