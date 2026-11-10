import { describe, expect, it } from "vitest";
import { batchBrief, BATCH_ANGLES, videoBatchOf } from "./videoBatch";

describe("varios vídeos con un solo /video", () => {
  it("cuenta los vídeos que se piden", () => {
    const yil =
      "okey quiero que me generes varios videos para instagram y tiktok ,para promocionar kywai, crea los guiones,generame 3 videos para postearlos luego, la idea es presentar la app";
    expect(videoBatchOf(yil)).toEqual({ count: 3, ideas: [] });
    expect(videoBatchOf("hazme tres reels sobre el café")?.count).toBe(3);
    expect(videoBatchOf("5 vídeos cortos de recetas")?.count).toBe(5);
    expect(videoBatchOf("genera varios vídeos de kywai")?.count).toBe(3);
    expect(videoBatchOf("make two videos about our app")?.count).toBe(2);
    expect(videoBatchOf("crea 12 vídeos de gatos")?.count).toBe(12);
    expect(videoBatchOf("crea 20 vídeos de gatos")?.count).toBe(12);
  });

  it("un número que es parte del tema no cuenta", () => {
    expect(videoBatchOf("los 5 vídeos más vistos de la historia")).toBeNull();
    expect(videoBatchOf("cómo editar 2 vídeos a la vez en CapCut")).toBeNull();
    expect(videoBatchOf("los 5 mejores conectores")).toBeNull();
    expect(videoBatchOf("un vídeo sobre la luna")).toBeNull();
  });

  it("una lista en una sola línea también cuenta", () => {
    const hermes =
      "haz un vídeo por guion: 1) artifacts/guiones/redes/01-stop-picking-one-ai.md 2) artifacts/guiones/redes/02-draft-your-ai-dream-team.md 3) artifacts/guiones/redes/03-an-ai-team-for-zero-dollars.md";
    expect(videoBatchOf(hermes)).toEqual({
      count: 3,
      ideas: [
        "artifacts/guiones/redes/01-stop-picking-one-ai.md",
        "artifacts/guiones/redes/02-draft-your-ai-dream-team.md",
        "artifacts/guiones/redes/03-an-ai-team-for-zero-dollars.md",
      ],
    });
    expect(videoBatchOf("cómo pasar de 1) a 3) en una receta")).toBeNull();
  });

  it("una lista de ideas es un vídeo por idea", () => {
    expect(
      videoBatchOf(
        "para kywai:\n1) qué es\n2) los temas 3D\n3) el estudio de vídeo",
      ),
    ).toEqual({
      count: 3,
      ideas: ["qué es", "los temas 3D", "el estudio de vídeo"],
    });
    expect(
      videoBatchOf(
        "hazme 2 vídeos\n- uno de voz\n- otro de música\n- otro más",
      ),
    ).toEqual({ count: 2, ideas: ["uno de voz", "otro de música"] });
  });

  it("cada vídeo sabe cuál es, qué le toca y qué cuentan los otros", () => {
    const b = batchBrief(2, 3);
    expect(b).toContain("vídeo 2 de 3");
    expect(b).toContain(`Al tuyo le toca: ${BATCH_ANGLES[1]}`);
    expect(b).toContain(`1: ${BATCH_ANGLES[0]}`);
    expect(b).not.toContain(`2: ${BATCH_ANGLES[1]}`);
    expect(batchBrief(1, 2, ["la voz", "la música"])).toContain(
      "Al tuyo le toca: la voz.",
    );
  });
});
