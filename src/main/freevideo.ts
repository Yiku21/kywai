/**
 * FreeVideo (github.com/FlashML-org/FreeVideo): vídeo generado en el propio equipo con el modelo MiniMax H3.
 *
 * Si FreeVideo está instalado y abierto, el estudio de vídeo le pide que dé movimiento a las escenas clave: le manda
 * la imagen de la escena como primer fotograma y una frase de qué se mueve, y pone el clip que devuelve en lugar de la
 * imagen fija. Si no está, no responde o un clip falla, la escena se queda con su imagen como siempre.
 *
 * Se habla con él como un programa aparte, por su API para agentes (HTTP local con el token de la instalación), sin
 * copiar su código. Su código es Apache-2.0; los pesos del modelo van con la MiniMax H3 Community License (con
 * límites de uso y de países), que acepta quien instala FreeVideo, no kywai.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "/freevideo/agent/v1";
const DONE = new Set(["succeeded", "failed", "cancelled", "interrupted"]);

export interface FreeVideoServer {
  url: string;
  token: string;
}

/** Las carpetas donde los instaladores de FreeVideo dejan su instalación (la del token del agente). */
export function freeVideoRoots(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform = process.platform,
): string[] {
  const roots: string[] = [];
  for (const v of [env.KYWAI_FREEVIDEO_HOME, env.FREEVIDEO_HOME])
    if (v?.trim()) roots.push(v.trim());
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
    roots.push(join(local, "FreeVideo"), join(local, "FreeVideo-launcher"));
  } else if (platform === "darwin")
    roots.push(join(home, "Library", "Application Support", "FreeVideo"));
  roots.push(
    join(home, ".local", "share", "freevideo"),
    join(home, "FreeVideo"),
  );
  return roots;
}

/** Busca agent/token (y agent/endpoint.json) en la carpeta o hasta dos niveles por debajo. */
function findAgentDir(root: string, depth = 2): string | null {
  if (existsSync(join(root, "agent", "token"))) return join(root, "agent");
  if (depth <= 0) return null;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules" || name === "models")
      continue;
    const p = join(root, name);
    try {
      if (!statSync(p).isDirectory()) continue;
    } catch {
      continue;
    }
    const found = findAgentDir(p, depth - 1);
    if (found) return found;
  }
  return null;
}

/** La instalación de FreeVideo de este equipo (dirección y token), o null si no hay. Sin red: solo mira archivos. */
export function findFreeVideo(
  roots = freeVideoRoots(),
): FreeVideoServer | null {
  for (const root of roots) {
    const dir = findAgentDir(root);
    if (!dir) continue;
    try {
      const token = readFileSync(join(dir, "token"), "ascii").trim();
      if (!token) continue;
      let url = (
        process.env.KYWAI_FREEVIDEO_URL ||
        process.env.FREEVIDEO_URL ||
        ""
      ).trim();
      if (!url) {
        try {
          const ep = JSON.parse(
            readFileSync(join(dir, "endpoint.json"), "utf8"),
          ) as { url?: unknown };
          if (typeof ep.url === "string") url = ep.url;
        } catch {
          /* sin endpoint.json: la dirección de siempre */
        }
      }
      url = (url || "http://127.0.0.1:8188").replace(/\/+$/, "");
      // Solo en este equipo: el token no sale nunca hacia otra máquina.
      if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(url))
        continue;
      return { url, token };
    } catch {
      /* el siguiente */
    }
  }
  return null;
}

async function call<T>(
  srv: FreeVideoServer,
  method: string,
  path: string,
  body?: unknown,
  ms = 30_000,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(srv.url + API + path, {
    method,
    headers: {
      authorization: `Bearer ${srv.token}`,
      "x-freevideo-client": "kywai",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(ms)])
      : AbortSignal.timeout(ms),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string };
  };
  if (!res.ok)
    throw new Error(
      json.error?.message || json.error?.code || `HTTP ${res.status}`,
    );
  return json;
}

export interface FreeVideoStatus {
  /** Instalado en este equipo (hay token). */
  installed: boolean;
  /** Abierto y listo para generar. */
  ready: boolean;
  problem?: string;
}

/** ¿Está FreeVideo abierto y listo? (En 3 s; sin FreeVideo instalado, ni lo intenta.) */
export async function freeVideoStatus(
  srv = findFreeVideo(),
): Promise<FreeVideoStatus> {
  if (!srv) return { installed: false, ready: false };
  try {
    const info = await call<{ ready?: boolean; problem?: unknown }>(
      srv,
      "GET",
      "",
      undefined,
      3000,
    );
    return {
      installed: true,
      ready: !!info.ready,
      ...(info.ready
        ? {}
        : {
            problem:
              typeof info.problem === "string" ? info.problem : "no está listo",
          }),
    };
  } catch (e) {
    return { installed: true, ready: false, problem: (e as Error).message };
  }
}

/** El encargo de un clip: lo que se mueve, con el estilo del vídeo, en inglés (como lo entiende el modelo). */
export function motionPrompt(
  motion: string,
  scene?: string,
  look?: string,
): string {
  const what = motion.replace(/[.\s]+$/, "");
  return [
    `summary: ${what}.`,
    `detailed_description: The shot starts exactly on the given first frame${scene ? ` (${scene.replace(/[.\s]+$/, "")})` : ""} and keeps its composition, characters and colors. ${what}. Smooth, natural motion; the camera moves gently.`,
    ...(look ? [`visual_style: ${look}`] : []),
    "overall_soundscape: quiet ambience.",
    "non_diegetic_music: none.",
  ].join("\n");
}

/**
 * Da movimiento a una imagen: la sube, pide el clip (primer fotograma = la imagen) y lo descarga en `out`.
 * Devuelve false si algo falla (la escena se queda con su imagen). Los clips tardan minutos: se espera con
 * sondeos largos que corta «Detener».
 */
export async function animateStill(
  srv: FreeVideoServer,
  opts: {
    image: string;
    prompt: string;
    seconds: number;
    vertical: boolean;
    out: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    onProgress?: (p: number) => void;
  },
): Promise<boolean> {
  const { signal } = opts;
  try {
    const data = readFileSync(opts.image).toString("base64");
    const up = await call<{ file?: string }>(
      srv,
      "POST",
      "/media",
      { name: opts.image.replace(/^.*[\\/]/, ""), data_base64: data },
      120_000,
      signal,
    );
    if (!up.file) return false;
    const seconds = Math.min(
      10,
      Math.max(2, Math.round(opts.seconds * 10) / 10),
    );
    const sub = await call<{ job?: { id?: string } }>(
      srv,
      "POST",
      "/jobs",
      {
        prompt: opts.prompt,
        aspect: opts.vertical ? "9:16" : "16:9",
        megapixels: 0.5,
        seconds,
        quality: "light",
        media: { first: { file: up.file } },
      },
      60_000,
      signal,
    );
    const id = sub.job?.id;
    if (!id) return false;
    const deadline = Date.now() + (opts.timeoutMs ?? 60 * 60_000);
    for (;;) {
      if (signal?.aborted) {
        await call(
          srv,
          "POST",
          `/jobs/${encodeURIComponent(id)}/cancel`,
          {},
          10_000,
        ).catch(() => undefined);
        return false;
      }
      if (Date.now() > deadline) {
        await call(
          srv,
          "POST",
          `/jobs/${encodeURIComponent(id)}/cancel`,
          {},
          10_000,
        ).catch(() => undefined);
        return false;
      }
      const view = await call<
        {
          job?: {
            status?: string;
            progress?: number;
            result?: { video?: { url?: string } };
          };
        } & {
          status?: string;
          progress?: number;
          result?: { video?: { url?: string } };
        }
      >(
        srv,
        "GET",
        `/jobs/${encodeURIComponent(id)}?wait=25`,
        undefined,
        40_000,
        signal,
      ).catch(() => null);
      const job = view?.job ?? view;
      if (!job?.status) continue;
      if (typeof job.progress === "number")
        opts.onProgress?.(
          Math.max(
            0,
            Math.min(1, job.progress > 1 ? job.progress / 100 : job.progress),
          ),
        );
      if (!DONE.has(job.status)) continue;
      const url = job.result?.video?.url;
      if (job.status !== "succeeded" || !url || !url.startsWith("/"))
        return false;
      const res = await fetch(srv.url + url, {
        headers: {
          authorization: `Bearer ${srv.token}`,
          "x-freevideo-client": "kywai",
        },
        signal: signal ?? AbortSignal.timeout(600_000),
      });
      if (!res.ok) return false;
      writeFileSync(opts.out, Buffer.from(await res.arrayBuffer()));
      return true;
    }
  } catch {
    return false;
  }
}
