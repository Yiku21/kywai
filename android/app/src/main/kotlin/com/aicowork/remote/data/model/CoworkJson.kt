package com.aicowork.remote.data.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.doubleOrNull
import java.time.Instant
import java.time.OffsetDateTime

val CoworkJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = true
    encodeDefaults = true
    isLenient = true
}

/** Acepta marcas de tiempo como milisegundos (número) o ISO-8601 (texto) y las guarda en milisegundos. */
object FlexibleTimeSerializer : KSerializer<Long> {
    override val descriptor = PrimitiveSerialDescriptor("FlexibleTime", PrimitiveKind.LONG)

    override fun serialize(encoder: Encoder, value: Long) = encoder.encodeLong(value)

    override fun deserialize(decoder: Decoder): Long {
        if (decoder !is JsonDecoder) return decoder.decodeLong()
        val element = decoder.decodeJsonElement() as? JsonPrimitive ?: return 0
        if (element.isString) return parseTimestamp(element.content) ?: 0
        return element.longOrNull ?: element.doubleOrNull?.toLong() ?: 0
    }
}

fun parseTimestamp(text: String): Long? = text.toLongOrNull()
    ?: runCatching { Instant.parse(text).toEpochMilli() }.getOrNull()
    ?: runCatching { OffsetDateTime.parse(text).toInstant().toEpochMilli() }.getOrNull()
