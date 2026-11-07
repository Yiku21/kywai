package com.aicowork.remote.ui.orbita

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import java.text.Normalizer

/** Quita tildes y pasa a minúsculas sin cambiar la longitud (cada letra sigue en su sitio). */
fun fold(s: String): String = buildString(s.length) {
    for (c in s) {
        val n = Normalizer.normalize(c.toString(), Normalizer.Form.NFD).firstOrNull() ?: c
        append(n.lowercaseChar())
    }
}

private val QUOTED = Regex("[\"“”«»]([^\"“”«»]+)[\"“”«»]?")
private val EDGE = Regex("^[.,;:¿?¡!()]+|[.,;:¿?¡!()]+$")

/** Palabras sueltas y «frases entre comillas», normalizadas (la misma regla que el buscador del ordenador). */
fun searchTerms(raw: String): List<String> {
    val text = fold(raw.take(200))
    val terms = mutableListOf<String>()
    val rest = QUOTED.replace(text) { m ->
        val p = m.groupValues[1].replace(Regex("\\s+"), " ").trim()
        if (p.isNotEmpty()) terms += p
        " "
    }
    for (w in rest.split(Regex("\\s+"))) {
        val word = EDGE.replace(w, "")
        if (word.length >= 2 || (word.length == 1 && word[0].isDigit())) terms += word
    }
    return terms.distinct()
}

/** Tramos [inicio, fin) donde aparece cada término, ordenados y sin solaparse. */
fun findRanges(text: String, terms: List<String>): List<IntRange> {
    val folded = fold(text)
    val raw = mutableListOf<Pair<Int, Int>>()
    for (t in terms) {
        if (t.isEmpty()) continue
        var i = folded.indexOf(t)
        while (i >= 0) {
            raw += i to i + t.length
            i = folded.indexOf(t, i + t.length)
        }
    }
    val out = mutableListOf<Pair<Int, Int>>()
    for (r in raw.sortedWith(compareBy({ it.first }, { -it.second }))) {
        val last = out.lastOrNull()
        if (last != null && r.first <= last.second) out[out.size - 1] = last.first to maxOf(last.second, r.second) else out += r
    }
    return out.map { it.first until it.second }
}

/** El texto con lo buscado resaltado. */
fun marked(text: String, terms: List<String>): AnnotatedString = buildAnnotatedString {
    var from = 0
    for (r in findRanges(text, terms)) {
        if (r.first > from) append(text.substring(from, r.first))
        withStyle(SpanStyle(color = Orbita.Accent, background = Orbita.AccentSoft)) { append(text.substring(r.first, r.last + 1)) }
        from = r.last + 1
    }
    if (from < text.length) append(text.substring(from))
}
