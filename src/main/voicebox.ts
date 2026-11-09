/**
 * Voicebox (voicebox.sh, MIT) como voz local del estudio de vídeo.
 *
 * Si la app de Voicebox está abierta en el equipo (su servidor escucha en http://127.0.0.1:17493), kywai le pide la
 * voz de cada escena por su API compatible con OpenAI (`POST /v1/audio/speech`), con un perfil de voz del idioma del
 * vídeo (una voz clonada tuya o una de sus voces predefinidas). Gratis y sin salir del equipo.
 * Si no está abierta o no tiene perfil en ese idioma, se usa Gemini (con clave) y si no, Kokoro.
 */
import { writeFileSync } from "node:fs";

export const VOICEBOX_DEFAULT_URL = "http://127.0.0.1:17493";

export interface VoiceboxProfile {
  id: string;
  name: string;
  language: string;
  voice_type?: string;
  generation_count?: number;
}

export interface VoiceboxVoice {
  url: string;
  profileId: string;
  profileName: string;
}

/** Dirección de Voicebox: KYWAI_VOICEBOX_URL, o la de la app de escritorio. */
export function voiceboxUrl(): string {
  return (
    (process.env.KYWAI_VOICEBOX_URL || "").trim() || VOICEBOX_DEFAULT_URL
  ).replace(/\/+$/, "");
}

function signalFor(ms: number, signal?: AbortSignal): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);
}

/** Perfiles de voz de Voicebox, o null si no está abierto (no responde en 2,5 s). */
export async function voiceboxProfiles(
  url = voiceboxUrl(),
): Promise<VoiceboxProfile[] | null> {
  try {
    const res = await fetch(`${url}/profiles`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as unknown;
    if (!Array.isArray(list)) return null;
    return list.filter(
      (p): p is VoiceboxProfile =>
        !!p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.language === "string",
    );
  } catch {
    return null;
  }
}

/**
 * Elige el perfil: KYWAI_VOICEBOX_VOICE (nombre o id) si existe; si no, uno del idioma del vídeo, primero las voces
 * clonadas (son las tuyas) y luego la más usada. null si no hay ninguno en ese idioma (sonaría con acento).
 */
export function pickVoiceboxProfile(
  profiles: VoiceboxProfile[],
  lang: string,
  wanted = process.env.KYWAI_VOICEBOX_VOICE?.trim(),
): VoiceboxProfile | null {
  if (wanted) {
    const w = wanted.toLowerCase();
    const hit = profiles.find(
      (p) => p.id === wanted || p.name.toLowerCase() === w,
    );
    if (hit) return hit;
  }
  const base = (l: string): string => l.toLowerCase().split(/[-_]/)[0];
  const same = profiles.filter((p) => base(p.language) === base(lang));
  if (!same.length) return null;
  const score = (p: VoiceboxProfile): number =>
    (p.voice_type === "cloned" ? 1_000_000 : 0) + (p.generation_count ?? 0);
  return [...same].sort((a, b) => score(b) - score(a))[0];
}

/** ¿Hay Voicebox con una voz para este idioma? */
export async function voiceboxVoice(
  lang: string,
  url = voiceboxUrl(),
): Promise<VoiceboxVoice | null> {
  const profiles = await voiceboxProfiles(url);
  const p = profiles && pickVoiceboxProfile(profiles, lang);
  return p ? { url, profileId: p.id, profileName: p.name } : null;
}

/**
 * Voz de un texto en un WAV. false si falla (el vídeo entero pasa a Gemini o Kokoro, para no mezclar voces).
 * `instructions` (el tono) solo lo usan los motores que lo entienden (Qwen); los demás lo ignoran.
 */
export async function voiceboxSpeak(
  voice: VoiceboxVoice,
  text: string,
  out: string,
  opts: {
    instructions?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  try {
    const res = await fetch(`${voice.url}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-voicebox-client-id": "kywai",
      },
      // «tts-1» = el motor que tenga configurado el perfil.
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice.profileId,
        response_format: "wav",
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      }),
      signal: signalFor(opts.timeoutMs ?? 240_000, opts.signal),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    // Una cabecera WAV y algo de sonido.
    if (buf.length < 1000 || buf.subarray(0, 4).toString("ascii") !== "RIFF")
      return false;
    writeFileSync(out, buf);
    return true;
  } catch {
    return false;
  }
}
