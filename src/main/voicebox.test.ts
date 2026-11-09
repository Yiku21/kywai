import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  pickVoiceboxProfile,
  voiceboxProfiles,
  voiceboxSpeak,
  voiceboxVoice,
} from "./voicebox";

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

const PROFILES = [
  {
    id: "p-en",
    name: "Morgan",
    language: "en",
    voice_type: "preset",
    generation_count: 50,
  },
  {
    id: "p-es1",
    name: "Dora",
    language: "es",
    voice_type: "preset",
    generation_count: 9,
  },
  {
    id: "p-es2",
    name: "Mi voz",
    language: "es",
    voice_type: "cloned",
    generation_count: 1,
  },
];

/** Un Voicebox de mentira: /profiles y /v1/audio/speech (devuelve un WAV si la voz existe). */
function fakeVoicebox(): Promise<{
  url: string;
  got: Record<string, unknown>[];
}> {
  const got: Record<string, unknown>[] = [];
  server = createServer((req, res) => {
    if (req.url === "/profiles") return res.end(JSON.stringify(PROFILES));
    if (req.url === "/v1/audio/speech" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const b = JSON.parse(body);
        got.push(b);
        if (!PROFILES.some((p) => p.id === b.voice)) {
          res.statusCode = 400;
          return res.end(
            JSON.stringify({ error: { message: "voice_not_found" } }),
          );
        }
        res.setHeader("content-type", "audio/wav");
        res.end(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(2000, 1)]));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((ok) =>
    server!.listen(0, "127.0.0.1", () =>
      ok({
        url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`,
        got,
      }),
    ),
  );
}

describe("Voicebox", () => {
  it("elige la voz del idioma, primero la clonada; sin ese idioma, ninguna", () => {
    expect(pickVoiceboxProfile(PROFILES, "es", "")?.id).toBe("p-es2");
    expect(pickVoiceboxProfile(PROFILES, "es-ES", "")?.id).toBe("p-es2");
    expect(pickVoiceboxProfile(PROFILES, "en", "")?.id).toBe("p-en");
    expect(pickVoiceboxProfile(PROFILES, "fr", "")).toBeNull();
    expect(pickVoiceboxProfile(PROFILES, "es", "dora")?.id).toBe("p-es1");
  });

  it("cerrado: no hay perfiles ni voz", async () => {
    expect(await voiceboxProfiles("http://127.0.0.1:1")).toBeNull();
    expect(await voiceboxVoice("es", "http://127.0.0.1:1")).toBeNull();
  });

  it("abierto: pide la voz por la API compatible con OpenAI y guarda el WAV", async () => {
    const { url, got } = await fakeVoicebox();
    const voice = await voiceboxVoice("es", url);
    expect(voice).toEqual({ url, profileId: "p-es2", profileName: "Mi voz" });
    const dir = mkdtempSync(join(tmpdir(), "vbox-"));
    try {
      const out = join(dir, "voz-1.wav");
      expect(
        await voiceboxSpeak(voice!, "Hola, esto es una prueba.", out, {
          instructions: "warm",
        }),
      ).toBe(true);
      expect(readFileSync(out).subarray(0, 4).toString()).toBe("RIFF");
      expect(got[0]).toMatchObject({
        model: "tts-1",
        input: "Hola, esto es una prueba.",
        voice: "p-es2",
        response_format: "wav",
        instructions: "warm",
      });
      expect(
        await voiceboxSpeak(
          { ...voice!, profileId: "no" },
          "x",
          join(dir, "b.wav"),
        ),
      ).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
