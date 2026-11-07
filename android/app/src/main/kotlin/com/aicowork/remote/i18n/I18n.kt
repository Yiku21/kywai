package com.aicowork.remote.i18n

import java.util.Locale

/**
 * Idiomas de Órbita. Como en el escritorio, el texto en español del código es la clave: t("Ajustes") devuelve
 * «Ajustes» en español y lo que diga el diccionario del idioma (I18nEn.kt, I18nPt.kt…) en los demás; si falta, el
 * inglés y, si tampoco está, el español (I18nTest avisa de cada texto sin traducir). Los huecos van entre llaves:
 * t("Hace {n} min", "n" to 5).
 *
 * El idioma es de este móvil (Ajustes → «Idioma · Language»); «Del sistema» sigue al del teléfono. Se fija al abrir
 * la app ([I18n.apply] en MainActivity) y, al cambiarlo, la app se reinicia para que todo salga ya traducido.
 */
enum class AppLanguage(val code: String?, val nativeName: String?) {
    System(null, null),
    Es("es", "Español"),
    En("en", "English"),
    Pt("pt", "Português"),
    Fr("fr", "Français"),
    Zh("zh", "中文"),
}

object I18n {
    /** «es», «en», «pt», «fr» o «zh». En las pruebas es siempre «es» salvo que se cambie con [setForTests]. */
    @Volatile
    var lang: String = "es"
        private set

    private val codes = AppLanguage.entries.mapNotNull { it.code }.toSet()

    /** Idioma efectivo para una elección: «Del sistema» es el del teléfono si Órbita lo tiene; si no, inglés. */
    fun resolve(choice: AppLanguage, system: Locale = Locale.getDefault()): String =
        choice.code ?: system.language.takeIf { it in codes } ?: "en"

    fun apply(choice: AppLanguage, system: Locale = Locale.getDefault()) {
        lang = resolve(choice, system)
    }

    fun setForTests(code: String) {
        lang = code
    }

    /** Para fechas y números. */
    val locale: Locale get() = when (lang) {
        "en" -> Locale.US
        "pt" -> Locale.forLanguageTag("pt-BR")
        "fr" -> Locale.FRANCE
        "zh" -> Locale.SIMPLIFIED_CHINESE
        else -> Locale.forLanguageTag("es-ES")
    }

    internal fun dict(code: String): Map<String, String>? = when (code) {
        "en" -> EN
        "pt" -> PT
        "fr" -> FR
        "zh" -> ZH
        else -> null
    }
}

private val HOLE = Regex("\\{(\\w+)\\}")

/** Traduce un texto escrito en español. Los {huecos} se rellenan con [vars]. */
fun t(text: String, vararg vars: Pair<String, Any?>): String {
    val code = I18n.lang
    val out = if (code == "es") text else I18n.dict(code)?.get(text) ?: EN[text] ?: text
    if (vars.isEmpty()) return out
    return HOLE.replace(out) { m ->
        val hit = vars.firstOrNull { it.first == m.groupValues[1] }
        if (hit == null) m.value else hit.second?.toString().orEmpty()
    }
}
