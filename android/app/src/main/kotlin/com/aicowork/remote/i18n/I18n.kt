package com.aicowork.remote.i18n

import java.util.Locale

/**
 * Idiomas de Órbita. Como en el escritorio, el texto en español del código es la clave: t("Ajustes") devuelve
 * «Ajustes» en español y lo que diga [EN] (I18nEn.kt) en inglés; si falta, se queda en español (I18nTest avisa de cada
 * texto sin traducir). Los huecos van entre llaves: t("Hace {n} min", "n" to 5).
 *
 * El idioma es de este móvil (Ajustes → «Idioma · Language»); «Del sistema» sigue al del teléfono. Se fija al abrir
 * la app ([I18n.apply] en MainActivity) y, al cambiarlo, la app se reinicia para que todo salga ya traducido.
 */
enum class AppLanguage(val code: String?) { System(null), Es("es"), En("en") }

object I18n {
    /** «es» o «en». En las pruebas es siempre «es» salvo que se cambie con [setForTests]. */
    @Volatile
    var lang: String = "es"
        private set

    /** Idioma efectivo para una elección: «Del sistema» es español si el teléfono está en español; si no, inglés. */
    fun resolve(choice: AppLanguage, system: Locale = Locale.getDefault()): String =
        choice.code ?: if (system.language == "es") "es" else "en"

    fun apply(choice: AppLanguage, system: Locale = Locale.getDefault()) {
        lang = resolve(choice, system)
    }

    fun setForTests(code: String) {
        lang = code
    }

    /** Para fechas y números. */
    val locale: Locale get() = if (lang == "en") Locale.US else Locale.forLanguageTag("es-ES")
}

private val HOLE = Regex("\\{(\\w+)\\}")

/** Traduce un texto escrito en español. Los {huecos} se rellenan con [vars]. */
fun t(text: String, vararg vars: Pair<String, Any?>): String {
    val out = if (I18n.lang == "en") EN[text] ?: text else text
    if (vars.isEmpty()) return out
    return HOLE.replace(out) { m ->
        val hit = vars.firstOrNull { it.first == m.groupValues[1] }
        if (hit == null) m.value else hit.second?.toString().orEmpty()
    }
}
