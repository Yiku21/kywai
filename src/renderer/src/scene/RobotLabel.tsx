import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Brain,
  Check,
  Hourglass,
  Loader,
  Moon,
  Music2,
  PowerOff,
  Sparkles,
} from "lucide-react";
import type { AgentConfig } from "@shared/types";
import { useCowork, useData } from "@/store/cowork";
import { useLabelOverrides } from "./labelStore";
import { modelLabelFor } from "@/ui/common/agents";
import { useSceneHover } from "./anchors";
import { restAfterFor } from "./personality";
import { useBubbles } from "./bubbleStore";
import { registry } from "./registry";
import {
  progressHint,
  isSilent,
  progressText,
  taskProgress,
} from "@/lib/progress";
import s from "./labels.module.css";
import { t } from "@/lib/i18n";

/** Mismo umbral que el cerebro de animación (según su carácter + desfase por agente). */
const restAfterMs = (agent: AgentConfig) => restAfterFor(agent) * 1000;

interface Props {
  agent: AgentConfig;
}

/** Tarjeta flotante sobre cada robot: nombre, modelo, estado y progreso. */
export function RobotLabel({ agent }: Props) {
  const hovered = useSceneHover((st) => st.agentId === agent.id);
  const rt = useData((d) => d.runtimes[agent.id]);
  const task = useData((d) => (rt?.taskId ? d.tasks[rt.taskId] : undefined));
  const allTasks = useData((d) => d.tasks);
  const waitingName = useData((d) =>
    rt?.waitingFor ? d.agents[rt.waitingFor]?.name : undefined,
  );
  const override = useLabelOverrides((st) => st.map[agent.id]);
  const selected = useCowork(
    (st) => st.selection?.type === "agent" && st.selection.id === agent.id,
  );
  const reduced = useCowork((st) => st.reducedEffects);
  const select = useCowork((st) => st.select);
  const bubble = useBubbles((st) => st.map[agent.id]);

  // Reposo: se evalúa cada pocos segundos (no en cada fotograma).
  const [, tick] = useState(0);
  const [mountedAt] = useState(() => Date.now());
  const lastAt = rt?.lastActivityAt ?? 0;
  const restMs = restAfterMs(agent);
  useEffect(() => {
    const activityNow = rt?.activity ?? "idle";
    // Trabajando: cada segundo y medio (el tiempo de la tarea avanza). Desconectado o con error no cambia nada solo.
    if (activityNow === "thinking" || activityNow === "working") {
      const id = window.setInterval(() => tick((n) => n + 1), 1500);
      return () => window.clearInterval(id);
    }
    if (activityNow !== "idle") return;
    // Libre: se mira cada 3 s si se ha puesto a bailar con la música, y se despierta justo cuando le toca descansar
    // (antes se repintaba cada segundo cada etiqueta aunque no cambiara nada).
    const id = window.setInterval(() => tick((n) => n + 1), 3000);
    const restIn = Math.max(lastAt, mountedAt) + restMs - Date.now();
    const rest = restIn > 0 ? window.setTimeout(() => tick((n) => n + 1), restIn + 50) : undefined;
    return () => {
      window.clearInterval(id);
      window.clearTimeout(rest);
    };
  }, [rt?.activity, lastAt, mountedAt, restMs]);

  const activity = rt?.activity ?? "idle";
  const dancing = activity === "idle" && !override && !reduced && registry.brains.get(agent.id)?.social?.music === true;
  const resting =
    activity === "idle" &&
    !dancing &&
    !override &&
    Date.now() - Math.max(lastAt, mountedAt) > restAfterMs(agent);

  let icon = <Sparkles size={12} />;
  let text = t("Disponible");
  switch (activity) {
    case "thinking":
      icon = <Brain size={12} />;
      text = rt?.lastActivity || t("Pensando");
      break;
    case "working":
      icon = <Loader size={12} />;
      text = isSilent(rt)
        ? t("Razonando…")
        : rt?.lastActivity || t("Trabajando");
      break;
    case "waiting":
      icon = <Hourglass size={12} />;
      // El servidor dice a qué espera («Esperando a Gemini», «Esperando la revisión de Codex»).
      text =
        rt?.lastActivity ||
        (waitingName
          ? t("Esperando a {waitingName}", { waitingName })
          : t("En espera"));
      break;
    case "error":
      icon = <AlertTriangle size={12} />;
      text = t("Bloqueado");
      break;
    case "offline":
      icon = <PowerOff size={12} />;
      text = t("No disponible");
      break;
    default:
      if (dancing) {
        icon = <Music2 size={12} />;
        text = t("Bailando");
      } else if (resting) {
        icon = <Moon size={12} />;
        text = t("En reposo");
      }
  }
  if (override) {
    text = override.text;
    icon =
      override.tone === "send" ? (
        <ArrowUpRight size={12} />
      ) : override.tone === "receive" ? (
        <ArrowDownToLine size={12} />
      ) : (
        <Check size={12} />
      );
  }

  const busy = activity === "thinking" || activity === "working";
  // Modelo de la tarea en curso (fácil, normal o difícil); si no hay tarea, el habitual.
  const modelText =
    (busy && task?.model ? modelLabelFor(task.model, agent) : undefined) ??
    agent.modelLabel;
  const prog =
    busy && task ? taskProgress(task, Object.values(allTasks)) : null;

  const cls = [
    s.robot,
    selected && s.selected,
    hovered && s.hovered,
    (activity === "offline" || resting) && s.dim,
    activity === "error" && s.error,
    reduced && s.static,
    override && s[`tone-${override.tone}`],
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={s.robotWrap}>
      {bubble && (
        <div
          key={bubble.until}
          className={[
            s.bubble,
            reduced && s.static,
            bubble.event === "error" && s.bubbleError,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          {bubble.text}
        </div>
      )}
      <div
        className={cls}
        style={{ ["--agent" as string]: agent.color }}
        role="button"
        tabIndex={0}
        aria-label={`${agent.name}, ${modelText}: ${text}`}
        onClick={(e) => {
          e.stopPropagation();
          select({ type: "agent", id: agent.id });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ")
            select({ type: "agent", id: agent.id });
        }}
      >
        <div className={s.head}>
          <span className={s.dot} />
          <span className={s.name}>{agent.name}</span>
          <span className={s.model}>{modelText}</span>
        </div>
        <div className={s.status}>
          {icon}
          <span className={s.statusText}>{text}</span>
          {prog && (
            <span
              className={s.pct}
              title={progressHint(prog)}
            >
              {progressText(prog)}
            </span>
          )}
        </div>
        {activity === "error" && rt?.reason && (
          <div className={s.reason}>{rt.reason}</div>
        )}
        {activity === "offline" && rt?.reason && (
          <div className={s.reason} style={{ color: "#9aa8bf" }}>
            {rt.reason}
          </div>
        )}
        {busy && (
          <div className={s.bar} aria-hidden="true">
            {prog ? (
              <div
                className={s.barFill}
                style={{ width: `${prog.pct}%`, opacity: prog.real ? 1 : 0.6 }}
              />
            ) : (
              <div className={s.barIndeterminate} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
