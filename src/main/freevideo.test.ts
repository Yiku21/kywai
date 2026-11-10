import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  animateStill,
  findFreeVideo,
  freeVideoRoots,
  freeVideoStatus,
  motionPrompt,
} from "./freevideo";

afterEach(() => vi.unstubAllGlobals());

describe("FreeVideo", () => {
  it("busca la instalación donde la dejan sus instaladores", () => {
    expect(freeVideoRoots({}, "/h", "darwin")).toContain(
      join("/h", "Library", "Application Support", "FreeVideo"),
    );
    expect(freeVideoRoots({ LOCALAPPDATA: "C:\\L" }, "/h", "win32")[0]).toBe(
      join("C:\\L", "FreeVideo"),
    );
    expect(freeVideoRoots({ FREEVIDEO_HOME: "/x" }, "/h", "linux")[0]).toBe(
      "/x",
    );
  });

  it("lee token y dirección, y solo acepta una dirección de este equipo", () => {
    const root = mkdtempSync(join(tmpdir(), "fv-"));
    expect(findFreeVideo([root])).toBeNull();
    mkdirSync(join(root, "app", "agent"), { recursive: true });
    writeFileSync(join(root, "app", "agent", "token"), "abc\n");
    expect(findFreeVideo([root])).toEqual({
      url: "http://127.0.0.1:8188",
      token: "abc",
    });
    writeFileSync(
      join(root, "app", "agent", "endpoint.json"),
      JSON.stringify({ url: "http://localhost:9000/" }),
    );
    expect(findFreeVideo([root])?.url).toBe("http://localhost:9000");
    writeFileSync(
      join(root, "app", "agent", "endpoint.json"),
      JSON.stringify({ url: "http://10.0.0.5:9000" }),
    );
    expect(findFreeVideo([root])).toBeNull();
  });

  it("el encargo lleva el movimiento y el estilo", () => {
    const p = motionPrompt("the cat jumps.", "a cat on a roof", "Ink doodle");
    expect(p).toContain("summary: the cat jumps.");
    expect(p).toContain("(a cat on a roof)");
    expect(p).toContain("visual_style: Ink doodle");
  });

  it("sube la imagen, pide el clip, espera y lo descarga", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fv-"));
    writeFileSync(join(dir, "e.png"), "png");
    const calls: string[] = [];
    let polls = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const path = url.replace("http://127.0.0.1:8188", "");
      calls.push(`${init?.method ?? "GET"} ${path}`);
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer t",
      );
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), { status: 200 });
      if (path.endsWith("/media")) return json({ file: "up/e.png" });
      if (path.endsWith("/jobs")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          aspect: "9:16",
          seconds: 10,
          media: { first: { file: "up/e.png" } },
        });
        return json({ job: { id: "j1" } });
      }
      if (path.includes("/jobs/j1"))
        return json({
          job: polls++
            ? { status: "succeeded", result: { video: { url: "/lib/j1.mp4" } } }
            : { status: "running", progress: 0.5 },
        });
      if (path === "/lib/j1.mp4") return new Response("mp4", { status: 200 });
      if (path === "/freevideo/agent/v1") return json({ ready: true });
      return new Response("{}", { status: 404 });
    });
    const srv = { url: "http://127.0.0.1:8188", token: "t" };
    expect(await freeVideoStatus(srv)).toEqual({
      installed: true,
      ready: true,
    });
    const out = join(dir, "clip.mp4");
    expect(
      await animateStill(srv, {
        image: join(dir, "e.png"),
        prompt: "p",
        seconds: 14,
        vertical: true,
        out,
      }),
    ).toBe(true);
    expect(readFileSync(out, "utf8")).toBe("mp4");
    expect(calls.filter((c) => c.includes("/jobs/j1"))).toHaveLength(2);
  });

  it("si el clip falla, devuelve false (la escena se queda con su imagen)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fv-"));
    writeFileSync(join(dir, "e.png"), "png");
    vi.stubGlobal("fetch", async (url: string) => {
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), { status: 200 });
      if (url.endsWith("/media")) return json({ file: "f" });
      if (url.endsWith("/jobs")) return json({ job: { id: "j" } });
      return json({ job: { status: "failed" } });
    });
    expect(
      await animateStill(
        { url: "http://127.0.0.1:8188", token: "t" },
        {
          image: join(dir, "e.png"),
          prompt: "p",
          seconds: 4,
          vertical: false,
          out: join(dir, "c.mp4"),
        },
      ),
    ).toBe(false);
  });
});
