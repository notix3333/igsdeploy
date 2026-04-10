import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useState,
  useTransition,
  type CSSProperties,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";

import { deskDays } from "./content/loadDays";
import type { DeskDocument, DocumentZone, Verdict } from "./types/content";

type DropZone = "inbox" | DocumentZone;

type BoardState = Record<DropZone, string[]>;

type PixelButtonVariant = "primary" | "ghost" | "approve" | "reject";

interface CaseResolution {
  day: number;
  caseId: string;
  decision: Verdict;
  expected: Verdict;
  verdictCorrect: boolean;
  documentAccuracy: number;
  clarificationUsed: boolean;
  score: number;
  mismatches: Array<{
    label: string;
    actual: DropZone;
    expected: DocumentZone;
  }>;
}

const dropZones = [
  {
    id: "inbox",
    label: "Лоток",
    hint: "Новый пакет ещё не разобран.",
  },
  {
    id: "proof",
    label: "Доказать",
    hint: "Внешнее событие и подтверждение ущерба.",
  },
  {
    id: "watch",
    label: "Проверить",
    hint: "Есть сигнал, но стол ещё сомневается.",
  },
  {
    id: "exception",
    label: "Исключить",
    hint: "Износ, личная причина или нарушение условий.",
  },
] as const;

const zoneMeta = Object.fromEntries(
  dropZones.map((zone) => [zone.id, zone]),
) as Record<DropZone, (typeof dropZones)[number]>;

const verdictMeta = {
  approve: {
    label: "Одобрить",
    pulse: "ОДОБРЕНО",
    description: "Есть внезапное событие и пакет подтверждений не разваливается.",
  },
  reject: {
    label: "Отказать",
    pulse: "ОТКАЗ",
    description: "Пакет сыпется в личную причину, исключение или поздний разрыв.",
  },
} satisfies Record<
  Verdict,
  { label: string; pulse: string; description: string }
>;

const overlayEase = [0.22, 1, 0.36, 1] as const;
const screenWidth = 1600;
const screenHeight = 900;
const screenPadding = 12;
const maxStars = 5;

function assetPath(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

function createBoard(documents: DeskDocument[]): BoardState {
  return {
    inbox: documents.map((document) => document.id),
    proof: [],
    watch: [],
    exception: [],
  };
}

function getDocumentZone(board: BoardState, documentId: string): DropZone {
  const zone = dropZones.find((entry) => board[entry.id].includes(documentId));
  return zone?.id ?? "inbox";
}

function percentage(value: number) {
  return Math.round(value * 100);
}

function scoreToStars(score: number) {
  return Math.max(0, Math.min(maxStars, score / 20));
}

function formatStars(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function firstSentence(text: string) {
  const match = text.match(/.*?[.!?](\s|$)/u);
  return match ? match[0].trim() : text;
}

function initials(value: string, max = 2) {
  return value
    .split(/[\s,.-]+/u)
    .filter(Boolean)
    .slice(0, max)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function parseVisitorProfile(visitor: string) {
  const [namePart, agePart] = visitor.split(",").map((part) => part.trim());
  const firstName = namePart?.split(/\s+/u)[0] ?? "Гость";
  const ageMatch = agePart?.match(/\d+/u);
  const age = ageMatch ? Number(ageMatch[0]) : 30;
  const lowerName = firstName.toLowerCase();

  const femaleNames = [
    "полина",
    "марина",
    "лиза",
    "елена",
    "саша",
    "анна",
    "ольга",
    "ирина",
    "наталья",
  ];

  const gender =
    femaleNames.includes(lowerName) || lowerName.endsWith("а") || lowerName.endsWith("я")
      ? "female"
      : "male";

  return { firstName, age, gender };
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickFrom<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

function createAvatarDataUri(visitor: string) {
  const profile = parseVisitorProfile(visitor);
  const seed = hashString(visitor);
  const skinTones = profile.gender === "female"
    ? ["#f2c7a5", "#ddb08e", "#c99674"]
    : ["#edc19a", "#d5a07f", "#b98666"];
  const hairTones = ["#2a1c16", "#4f3425", "#7a573d", "#151515", "#936d4c"];
  const jacketTones = profile.gender === "female"
    ? ["#7d5a73", "#49607b", "#7b5b48", "#566b53"]
    : ["#556c7a", "#64724c", "#7a6147", "#5e5a78"];
  const bgTones = profile.gender === "female"
    ? ["#6f4a35", "#415868", "#6b5a36"]
    : ["#5c4731", "#39515e", "#5a6238"];

  const skin = pickFrom(skinTones, seed);
  const hair = pickFrom(hairTones, seed >> 3);
  const jacket = pickFrom(jacketTones, seed >> 5);
  const background = pickFrom(bgTones, seed >> 7);
  const accent = profile.gender === "female" ? "#d7b0bf" : "#b4d0d7";
  const ageOffset = Math.max(0, Math.min(8, Math.floor((profile.age - 21) / 5)));
  const faceY = 39 + Math.min(ageOffset, 4);
  const shouldersY = 76;
  const hairBack = profile.gender === "female"
    ? `<path d="M24 36 C28 15, 45 10, 58 10 C76 10, 88 18, 89 40 L89 75 C80 67, 69 63, 56 63 C43 63, 32 67, 23 75 Z" fill="${hair}" />`
    : `<path d="M26 37 C30 18, 45 12, 57 12 C73 12, 84 19, 86 37 L86 57 C76 52, 67 49, 56 49 C44 49, 35 52, 26 57 Z" fill="${hair}" />`;
  const face = `<ellipse cx="56" cy="${faceY}" rx="21" ry="24" fill="${skin}" />`;
  const neck = `<rect x="49" y="${faceY + 18}" width="14" height="13" rx="4" fill="${skin}" />`;
  const body = `<path d="M18 118 L18 ${shouldersY + 12} C24 67, 40 58, 56 58 C72 58, 88 67, 94 ${shouldersY + 12} L94 118 Z" fill="${jacket}" />`;
  const collar = `<path d="M42 71 L56 84 L70 71" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round" />`;
  const eyes = `
    <ellipse cx="47" cy="${faceY - 2}" rx="2.2" ry="2" fill="#1a120e" />
    <ellipse cx="65" cy="${faceY - 2}" rx="2.2" ry="2" fill="#1a120e" />
  `;
  const brows = `
    <path d="M41 ${faceY - 9} C44 ${faceY - 11}, 49 ${faceY - 11}, 52 ${faceY - 9}" stroke="#2a1c16" stroke-width="1.8" fill="none" stroke-linecap="round" />
    <path d="M60 ${faceY - 9} C63 ${faceY - 11}, 68 ${faceY - 11}, 71 ${faceY - 9}" stroke="#2a1c16" stroke-width="1.8" fill="none" stroke-linecap="round" />
  `;
  const nose = `<path d="M56 ${faceY} L54 ${faceY + 8} L58 ${faceY + 8}" stroke="#8d654d" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
  const mouth = `<path d="M48 ${faceY + 14} C52 ${faceY + 16}, 60 ${faceY + 16}, 64 ${faceY + 14}" stroke="#8d4d4d" stroke-width="1.6" fill="none" stroke-linecap="round" />`;
  const hairFront = profile.gender === "female"
    ? `<path d="M30 35 C38 20, 50 17, 58 17 C69 17, 78 21, 83 33 C76 29, 69 28, 63 28 C57 28, 51 30, 45 31 C39 32, 34 33, 30 35 Z" fill="${hair}" />`
    : `<path d="M31 35 C38 22, 48 18, 58 18 C68 18, 76 22, 81 33 C74 30, 66 29, 58 29 C50 29, 42 30, 31 35 Z" fill="${hair}" />`;
  const sideburns = profile.gender === "female"
    ? `<path d="M33 40 C30 48, 31 57, 34 64" stroke="${hair}" stroke-width="6" fill="none" stroke-linecap="round" /><path d="M79 40 C82 48, 81 57, 78 64" stroke="${hair}" stroke-width="6" fill="none" stroke-linecap="round" />`
    : `<path d="M36 41 C35 47, 35 52, 36 57" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round" /><path d="M76 41 C77 47, 77 52, 76 57" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round" />`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 120">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="#201713" />
        </linearGradient>
      </defs>
      <rect width="112" height="120" fill="url(#bg)" />
      <circle cx="84" cy="26" r="24" fill="${accent}" opacity="0.12" />
      <rect x="8" y="8" width="96" height="104" rx="10" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
      ${body}
      ${collar}
      ${hairBack}
      ${face}
      ${neck}
      ${hairFront}
      ${sideburns}
      ${brows}
      ${eyes}
      ${nose}
      ${mouth}
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function AvatarPortrait({
  visitor,
  className = "",
}: {
  visitor: string;
  className?: string;
}) {
  const profile = parseVisitorProfile(visitor);

  return (
    <div className={`avatar-portrait ${className}`.trim()} aria-hidden="true">
      <img src={createAvatarDataUri(visitor)} alt="" />
      <span>{profile.firstName}</span>
    </div>
  );
}

function overlayTransition() {
  return {
    initial: { opacity: 0, scale: 0.96, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 10 },
    transition: { duration: 0.26, ease: overlayEase },
  };
}

function panelTransition(delay = 0) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, delay, ease: overlayEase },
  };
}

function ExpandableText({
  text,
  className = "",
  collapsedLines = 2,
  expandLabel = "Развернуть",
  collapseLabel = "Свернуть",
}: {
  text: string;
  className?: string;
  collapsedLines?: number;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = text.length > 96;
  const style = !expanded && isExpandable
    ? ({
        "--collapsed-lines": String(collapsedLines),
      } as CSSProperties)
    : undefined;

  return (
    <div className={`expandable-text ${expanded ? "is-expanded" : ""}`.trim()}>
      <p
        className={`${className} ${!expanded && isExpandable ? "is-clamped" : ""}`.trim()}
        style={style}
      >
        {text}
      </p>
      {isExpandable ? (
        <button
          type="button"
          className="expandable-text__toggle"
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      ) : null}
    </div>
  );
}

function PixelButton({
  children,
  className = "",
  variant = "primary",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: PixelButtonVariant;
  }
>) {
  const disabled = Boolean(props.disabled);

  return (
    <button
      type="button"
      className={`pixel-button pixel-button--${variant} ${className}`.trim()}
      {...props}
    >
      <span className="pixel-button__shadow" aria-hidden="true" />
      <span className="pixel-button__frame" aria-hidden="true" />
      <span className="pixel-button__label">{children}</span>
    </button>
  );
}

function ProgressHud({ progress }: { progress: number }) {
  return (
    <div className="progress-hud">
      <div className="progress-hud__body">
        <div className="progress-hud__meta">
          <span>Ход смены</span>
          <strong>{percentage(progress)}%</strong>
        </div>
        <div className="progress-hud__track">
          <img
            className="progress-hud__track-bg"
            src={assetPath("assets/ui/loading-bar-bg.png")}
            alt=""
          />
          <div
            className="progress-hud__fill-wrap"
            style={{
              width: `${Math.max(progress * 100, progress > 0 ? 4 : 0)}%`,
            }}
          >
            <img
              className="progress-hud__track-fill"
              src={assetPath("assets/ui/loading-bar.png")}
              alt=""
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StarsHud({
  stars,
  verdictAccuracy,
}: {
  stars: number;
  verdictAccuracy: number;
}) {
  return (
    <div className="stars-hud">
      <img
        className="stars-hud__frame"
        src={assetPath("assets/ui/minimap-bg.png")}
        alt=""
      />
      <div className="stars-hud__content">
        <p className="stars-hud__label">Ранг смены</p>
        <div className="stars-hud__track" aria-hidden="true">
          {Array.from({ length: maxStars }, (_, index) => {
            const fill = Math.max(0, Math.min(1, stars - index));

            return (
              <span key={index} className="stars-hud__star">
                <img
                  className="stars-hud__star-base"
                  src={assetPath("assets/ui/Star.png")}
                  alt=""
                />
                <span
                  className={`stars-hud__star-fill ${fill > 0 ? "is-active" : ""}`}
                  style={{ width: `${fill * 100}%` }}
                >
                  <img src={assetPath("assets/ui/Star.png")} alt="" />
                </span>
              </span>
            );
          })}
        </div>
        <strong className="stars-hud__value">{formatStars(stars)} / 5</strong>
        <span className="stars-hud__accuracy">{percentage(verdictAccuracy)}% точность штампа</span>
      </div>
    </div>
  );
}

function DocumentCardBody({
  document,
  dragging = false,
}: {
  document: DeskDocument;
  dragging?: boolean;
}) {
  const previewLabel = initials(document.kind, 3);

  return (
    <>
      <div className={`document-card__preview document-card__preview--${document.expected_zone}`}>
        <span>{previewLabel}</span>
      </div>
      <div className="document-card__head">
        <span className="document-card__kind">{document.kind}</span>
        <span
          className={`document-card__dot document-card__dot--${document.expected_zone} ${
            dragging ? "is-dragging" : ""
          }`}
        />
      </div>
      <strong className="document-card__title">{document.label}</strong>
      <ExpandableText
        text={document.summary}
        className="document-card__summary"
        collapsedLines={2}
        expandLabel="Детали"
        collapseLabel="Скрыть"
      />
    </>
  );
}

function DraggableDocumentCard({
  document,
  disabled,
}: {
  document: DeskDocument;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: document.id,
      disabled,
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={isDragging ? undefined : style}
      className={`document-card ${isDragging ? "is-dragging is-ghost" : ""}`}
      {...listeners}
      {...attributes}
    >
      <DocumentCardBody document={document} dragging={isDragging} />
    </button>
  );
}

function DropZonePanel({
  zoneId,
  documents,
  locked,
}: {
  zoneId: DropZone;
  documents: DeskDocument[];
  locked: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: zoneId });
  const zone = zoneMeta[zoneId];

  return (
    <motion.section
      ref={setNodeRef}
      layout
      className={`drop-zone drop-zone--${zoneId} ${isOver ? "is-over" : ""}`}
    >
      <div className="drop-zone__topline">
        <div>
          <p className="eyebrow">{zone.label}</p>
          <h3>{documents.length}</h3>
        </div>
        <span className="drop-zone__badge">
          {zoneId === "inbox" ? "Пакет" : "Папка"}
        </span>
      </div>
      <p className="drop-zone__hint">{zone.hint}</p>
      <div className="drop-zone__stack">
        <AnimatePresence initial={false}>
          {documents.map((document) => (
            <motion.div
              key={document.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
            >
              <DraggableDocumentCard document={document} disabled={locked} />
            </motion.div>
          ))}
        </AnimatePresence>
        {documents.length === 0 ? <div className="drop-zone__empty">Положите документ сюда</div> : null}
      </div>
    </motion.section>
  );
}

function App() {
  const firstCase = deskDays[0].cases[0];
  const [started, setStarted] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [caseIndex, setCaseIndex] = useState(0);
  const [board, setBoard] = useState<BoardState>(() => createBoard(firstCase.documents));
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [resolution, setResolution] = useState<CaseResolution | null>(null);
  const [history, setHistory] = useState<CaseResolution[]>([]);
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState<number | null>(null);
  const [finalOpen, setFinalOpen] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [screenScale, setScreenScale] = useState(1);
  const [isPending, startTransition] = useTransition();

  const currentDay = deskDays[dayIndex];
  const currentCase = currentDay.cases[caseIndex];
  const activeDocument = currentCase.documents.find(
    (document) => document.id === activeDocumentId,
  );
  const totalCases = deskDays.reduce((sum, day) => sum + day.cases.length, 0);
  const resolvedCases = history.length;
  const globalCaseNumber =
    deskDays.slice(0, dayIndex).reduce((sum, day) => sum + day.cases.length, 0) +
    caseIndex +
    1;
  const deskLocked =
    !started || resolution !== null || summaryOpen !== null || finalOpen;
  const progress = resolvedCases / totalCases;
  const dayFocusLine = firstSentence(currentDay.theory);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    }),
  );

  function getDocumentsForZone(zoneId: DropZone) {
    return board[zoneId]
      .map((documentId) =>
        currentCase.documents.find((document) => document.id === documentId),
      )
      .filter(Boolean) as DeskDocument[];
  }

  function resetCase(nextDayIndex: number, nextCaseIndex: number, showBriefing: boolean) {
    const nextCase = deskDays[nextDayIndex].cases[nextCaseIndex];
    setDayIndex(nextDayIndex);
    setCaseIndex(nextCaseIndex);
    setBoard(createBoard(nextCase.documents));
    setClarificationOpen(false);
    setResolution(null);
    setActiveDocumentId(null);
    setBriefingOpen(showBriefing);
  }

  function beginShift() {
    startTransition(() => {
      setStarted(true);
      setHistory([]);
      setSummaryOpen(null);
      setFinalOpen(false);
      resetCase(0, 0, true);
    });
  }

  function restartCampaign() {
    startTransition(() => {
      setStarted(false);
      setHistory([]);
      setSummaryOpen(null);
      setFinalOpen(false);
      resetCase(0, 0, true);
    });
  }

  function moveDocument(documentId: string, targetZone: DropZone) {
    setBoard((previous) => {
      const next: BoardState = {
        inbox: previous.inbox.filter((id) => id !== documentId),
        proof: previous.proof.filter((id) => id !== documentId),
        watch: previous.watch.filter((id) => id !== documentId),
        exception: previous.exception.filter((id) => id !== documentId),
      };

      next[targetZone] = [...next[targetZone], documentId];
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    if (deskLocked) {
      return;
    }

    setActiveDocumentId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDocumentId(null);

    if (deskLocked || !event.over) {
      return;
    }

    const targetZone = String(event.over.id) as DropZone;
    if (!dropZones.some((zone) => zone.id === targetZone)) {
      return;
    }

    moveDocument(String(event.active.id), targetZone);
  }

  function resolveCase(decision: Verdict) {
    if (deskLocked) {
      return;
    }

    const mismatches = currentCase.documents
      .map((document) => {
        const actual = getDocumentZone(board, document.id);
        if (actual === document.expected_zone) {
          return null;
        }

        return {
          label: document.label,
          actual,
          expected: document.expected_zone,
        };
      })
      .filter(Boolean) as CaseResolution["mismatches"];

    const accuracy =
      (currentCase.documents.length - mismatches.length) /
      currentCase.documents.length;
    const verdictCorrect = currentCase.outcome.verdict === decision;
    const score = Math.min(
      100,
      (verdictCorrect ? 70 : 10) +
        Math.round(accuracy * 25) +
        (clarificationOpen ? 5 : 0),
    );

    const nextResolution: CaseResolution = {
      day: currentDay.day,
      caseId: currentCase.id,
      decision,
      expected: currentCase.outcome.verdict,
      verdictCorrect,
      documentAccuracy: accuracy,
      clarificationUsed: clarificationOpen,
      score,
      mismatches,
    };

    setResolution(nextResolution);
    setHistory((previous) => [...previous, nextResolution]);
  }

  function continueFlow() {
    if (!resolution) {
      return;
    }

    startTransition(() => {
      setResolution(null);
      setActiveDocumentId(null);

      if (caseIndex < currentDay.cases.length - 1) {
        resetCase(dayIndex, caseIndex + 1, false);
        return;
      }

      if (dayIndex < deskDays.length - 1) {
        setSummaryOpen(dayIndex);
        return;
      }

      setFinalOpen(true);
    });
  }

  function moveToNextDay() {
    if (summaryOpen === null) {
      return;
    }

    startTransition(() => {
      setSummaryOpen(null);
      resetCase(summaryOpen + 1, 0, true);
    });
  }

  const currentDayResults = history.filter((entry) => entry.day === currentDay.day);
  const verdictAccuracy =
    history.length === 0
      ? 0
      : history.filter((entry) => entry.verdictCorrect).length / history.length;
  const documentAccuracy = average(history.map((entry) => entry.documentAccuracy));
  const averageStars = average(history.map((entry) => scoreToStars(entry.score)));
  const summaryResults =
    summaryOpen === null
      ? []
      : history.filter((entry) => entry.day === deskDays[summaryOpen].day);

  useEffect(() => {
    function updateScale() {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const nextScale = Math.min(
        1,
        (viewportWidth - screenPadding * 2) / screenWidth,
        (viewportHeight - screenPadding * 2) / screenHeight,
      );

      setScreenScale(Math.max(nextScale, 0.42));
    }

    updateScale();
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="app-shell__backglow app-shell__backglow--left" />
      <div className="app-shell__backglow app-shell__backglow--right" />

      <div
        className="game-viewport"
        style={{
          width: screenWidth * screenScale,
          height: screenHeight * screenScale,
        }}
      >
      <div
        className="game-frame"
        style={{
          width: screenWidth,
          height: screenHeight,
          transform: `scale(${screenScale})`,
        }}
      >
        <div className="game-frame__noise" />
        <div className="game-frame__scanlines" />

        <header className="hud-bar">
          <motion.div className="hud-brand" {...panelTransition()}>
            <div className="signal-lamp" />
            <div>
              <p className="eyebrow">СТРАХОВОЙ ОТДЕЛ / ТЕРМИНАЛ</p>
              <h1>СТРАХОВОЙ СТОЛ</h1>
            </div>
          </motion.div>

          <motion.div className="hud-center" {...panelTransition(0.05)}>
            <ProgressHud progress={progress} />
            <div className="hud-center__meta">
              <span>
                ДЕЛО {String(globalCaseNumber).padStart(2, "0")} / {String(totalCases).padStart(2, "0")}
              </span>
              <span>ДЕНЬ {currentDay.day}</span>
              <span>{isPending ? "Обновляем стол..." : "Поток открыт"}</span>
            </div>
          </motion.div>

          <motion.div className="hud-right" {...panelTransition(0.1)}>
            <StarsHud stars={averageStars} verdictAccuracy={verdictAccuracy} />
          </motion.div>
        </header>

        <main className="game-layout">
          <motion.aside className="sidebar-column" {...panelTransition(0.08)}>
            <section className="pixel-panel pixel-panel--summary">
              <div className="pixel-panel__bar">
                <span>День {currentDay.day}</span>
                <span>{currentDay.pacing}</span>
              </div>

              <div className="summary-panel">
                <div className="summary-panel__copy">
                  <h2>{currentDay.title}</h2>
                  <ExpandableText
                    text={currentDay.intro}
                    className="summary-panel__intro"
                    collapsedLines={3}
                    expandLabel="Подробно"
                  />
                </div>
                <div className="summary-panel__focus">
                  <span>Фокус дня</span>
                  <strong>{currentDay.cases.length} дел в очереди</strong>
                  <ExpandableText
                    text={dayFocusLine}
                    className="summary-panel__focus-copy"
                    collapsedLines={2}
                    expandLabel="Читать"
                  />
                </div>
                <div className="summary-panel__principles">
                  <p className="eyebrow">Подсказки</p>
                  <ExpandableText
                    text={currentDay.bullet_points.join(" ")}
                    className="summary-panel__principles-copy"
                    collapsedLines={4}
                    expandLabel="Все пункты"
                    collapseLabel="Скрыть"
                  />
                </div>
              </div>
            </section>

            <section className="pixel-panel pixel-panel--queue">
              <div className="pixel-panel__bar">
                <span>Очередь</span>
                <span>{currentDayResults.length} закрыто</span>
              </div>
              <div className="queue-grid">
                {currentDay.cases.map((caseItem, itemIndex) => {
                  const result = history.find(
                    (entry) =>
                      entry.day === currentDay.day && entry.caseId === caseItem.id,
                  );

                  const stateClass = result
                    ? result.verdictCorrect
                      ? "is-correct"
                      : "is-wrong"
                    : itemIndex === caseIndex
                      ? "is-active"
                      : "";

                  return (
                    <motion.article
                      layout
                      key={caseItem.id}
                      className={`queue-card ${stateClass}`}
                    >
                      <AvatarPortrait visitor={caseItem.visitor} className="queue-card__media" />
                      <div className="queue-card__body">
                        <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                        <strong>{caseItem.visitor}</strong>
                        <ExpandableText
                          text={caseItem.story}
                          className="queue-card__story"
                          collapsedLines={2}
                          expandLabel="Подробнее"
                          collapseLabel="Скрыть"
                        />
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </section>
          </motion.aside>

          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={currentCase.id}
              className="dossier-column"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: overlayEase }}
            >
              <section className="pixel-panel dossier-panel">
                <div className="pixel-panel__bar">
                  <span>Досье</span>
                  <span>{currentCase.documents.length} файлов</span>
                </div>

                <div className="dossier-panel__head">
                  <div>
                    <p className="eyebrow">
                      Дело {String(globalCaseNumber).padStart(2, "0")}
                    </p>
                    <h2>{currentCase.visitor}</h2>
                  </div>
                  <div className="case-tags">
                    <span>1 вопрос</span>
                    <span>{currentDay.title}</span>
                  </div>
                </div>

                <div className="dossier-paper">
                  <div className="dossier-paper__hero">
                    <AvatarPortrait visitor={currentCase.visitor} className="dossier-paper__avatar" />
                    <ExpandableText
                      text={currentCase.story}
                      className="dossier-paper__story"
                      collapsedLines={5}
                      expandLabel="Читать дело"
                      collapseLabel="Скрыть"
                    />
                  </div>

                  <section className="dossier-section">
                    <div className="dossier-section__head">
                      <p className="eyebrow">Факты</p>
                      <span>{currentCase.facts.length}</span>
                    </div>
                    <div className="facts-grid">
                      {currentCase.facts.map((fact) => (
                        <div key={fact} className="fact-chip">
                          {fact}
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="clarification-card">
                    <div className="clarification-card__head">
                      <div>
                        <p className="eyebrow">Уточнение</p>
                        <h3>
                          {currentCase.clarification
                            ? currentCase.clarification.question
                            : "Этот пакет можно разбирать без дополнительного вопроса."}
                        </h3>
                      </div>
                      {currentCase.clarification ? (
                        <PixelButton
                          variant="ghost"
                          className="clarification-card__button"
                          onClick={() =>
                            setClarificationOpen((previous) => !previous)
                          }
                        >
                          {clarificationOpen ? "Скрыть" : "Уточнить"}
                        </PixelButton>
                      ) : null}
                    </div>

                    <AnimatePresence initial={false}>
                      {clarificationOpen && currentCase.clarification ? (
                        <motion.p
                          key="clarification-answer"
                          className="clarification-card__answer"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                        >
                          {currentCase.clarification.answer}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>
              </section>

              <section className="decision-panel">
                <div className="decision-panel__copy">
                  <p className="eyebrow">Итоговый штамп</p>
                  <p>
                    Сначала разложите документы по папкам. Потом поставьте один
                    итоговый штамп.
                  </p>
                </div>
                <div className="decision-panel__actions">
                  <PixelButton
                    variant="approve"
                    onClick={() => resolveCase("approve")}
                    disabled={deskLocked}
                  >
                    Одобрить
                  </PixelButton>
                  <PixelButton
                    variant="reject"
                    onClick={() => resolveCase("reject")}
                    disabled={deskLocked}
                  >
                    Отказать
                  </PixelButton>
                </div>
              </section>
            </motion.section>
          </AnimatePresence>

          <motion.section className="board-column" {...panelTransition(0.14)}>
            <section className="pixel-panel board-panel">
              <div className="pixel-panel__bar">
                <span>Рабочий стол</span>
                <span>{percentage(documentAccuracy)}% точность</span>
              </div>

              <div className="board-panel__head">
                <div>
                  <p className="eyebrow">Рабочая поверхность</p>
                  <h2>Сортировка дела</h2>
                </div>
                <p className="board-panel__hint">
                  Факт, сомнение, исключение.
                </p>
              </div>

              <DndContext
                key={currentCase.id}
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="drop-grid">
                  {dropZones.map((zone) => (
                    <DropZonePanel
                      key={zone.id}
                      zoneId={zone.id}
                      documents={getDocumentsForZone(zone.id)}
                      locked={deskLocked}
                    />
                  ))}
                </div>

                {typeof document !== "undefined"
                  ? createPortal(
                      <DragOverlay dropAnimation={null} zIndex={40}>
                        {activeDocument ? (
                          <article className="document-card is-overlay">
                            <DocumentCardBody document={activeDocument} dragging />
                          </article>
                        ) : null}
                      </DragOverlay>,
                      document.body,
                    )
                  : null}
              </DndContext>
            </section>
          </motion.section>
        </main>

        <AnimatePresence>
          {!started ? (
            <motion.section className="overlay" key="landing" {...overlayTransition()}>
              <div className="overlay__backdrop" />
              <div className="modal-card modal-card--landing">
                <p className="eyebrow">Тренировка оператора</p>
                <h2>Сесть за терминал. Разобрать пятнадцать дел. Не сорваться в шум.</h2>
                <p className="modal-card__lede">
                  Это больше не страница с карточками. Это компактная смена за
                  бюро: ретро-интерфейс, пиксельный стол, один вопрос на кейс и один
                  необратимый штамп.
                </p>

                <div className="landing-grid">
                  {deskDays.map((day) => (
                    <article key={day.day} className="landing-grid__day">
                      <span>День {day.day}</span>
                      <strong>{day.title}</strong>
                      <p>{day.theory}</p>
                    </article>
                  ))}
                </div>

                <div className="modal-card__actions">
                  <PixelButton onClick={beginShift}>Начать смену</PixelButton>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {started && briefingOpen ? (
            <motion.section className="overlay" key={`briefing-${currentDay.day}`} {...overlayTransition()}>
              <div className="overlay__backdrop overlay__backdrop--amber" />
              <div className="modal-card">
                <p className="eyebrow">Брифинг дня</p>
                <h2>
                  День {currentDay.day}. {currentDay.title}
                </h2>
                <p className="modal-card__lede">{currentDay.intro}</p>
                <ul className="modal-list">
                  {currentDay.bullet_points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="modal-card__actions">
                  <PixelButton onClick={() => setBriefingOpen(false)}>
                    Открыть терминал
                  </PixelButton>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {resolution ? (
            <motion.section
              className="overlay"
              key={`resolution-${resolution.day}-${resolution.caseId}`}
              {...overlayTransition()}
            >
              <div className="overlay__backdrop overlay__backdrop--ink" />
              <div className="modal-card modal-card--result">
                <div className="result-stamp">
                  <motion.span
                    className={`result-stamp__mark ${
                      resolution.verdictCorrect ? "is-correct" : "is-wrong"
                    }`}
                    initial={{ scale: 1.7, rotate: -10, opacity: 0 }}
                    animate={{ scale: 1, rotate: -6, opacity: 1 }}
                    transition={{ duration: 0.24, ease: overlayEase }}
                  >
                    {resolution.verdictCorrect ? "ШТАМП ТОЧЕН" : "НУЖЕН ПОВТОР"}
                  </motion.span>
                  <div>
                    <p className="eyebrow">Официальный итог</p>
                    <h2>{verdictMeta[resolution.expected].pulse}</h2>
                  </div>
                </div>

                <div className="result-grid">
                  <article>
                    <p className="eyebrow">Ваш штамп</p>
                    <h3>{verdictMeta[resolution.decision].label}</h3>
                    <p>{verdictMeta[resolution.decision].description}</p>
                  </article>
                  <article>
                    <p className="eyebrow">Верный ход</p>
                    <h3>{verdictMeta[resolution.expected].label}</h3>
                    <p>{currentCase.outcome.reason}</p>
                  </article>
                  <article>
                    <p className="eyebrow">Звёзды</p>
                    <h3>{formatStars(scoreToStars(resolution.score))} / 5</h3>
                    <p>{currentCase.outcome.policy}</p>
                  </article>
                </div>

                <div className="analysis-strip">
                  <span>{percentage(resolution.documentAccuracy)}% совпадение по документам</span>
                  <span>
                    {resolution.clarificationUsed
                      ? "уточнение использовано"
                      : "без уточнения"}
                  </span>
                </div>

                {resolution.mismatches.length > 0 ? (
                  <div className="mismatch-list">
                    {resolution.mismatches.map((item) => (
                      <article key={item.label}>
                        <strong>{item.label}</strong>
                        <p>
                          Сейчас лежит в «{zoneMeta[item.actual].label}», а стол
                          читает это ближе к «{zoneMeta[item.expected].label}».
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mismatch-list mismatch-list--clean">
                    Разбор чистый: документы разложены без промаха.
                  </div>
                )}

                <div className="modal-card__actions">
                  <PixelButton onClick={continueFlow}>
                    {caseIndex < currentDay.cases.length - 1
                      ? "Следующее дело"
                      : dayIndex < deskDays.length - 1
                        ? "Сводка дня"
                        : "Финальный разбор"}
                  </PixelButton>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {summaryOpen !== null ? (
            <motion.section
              className="overlay"
              key={`summary-${summaryOpen}`}
              {...overlayTransition()}
            >
              <div className="overlay__backdrop overlay__backdrop--amber" />
              <div className="modal-card">
                <p className="eyebrow">Сводка смены</p>
                <h2>
                  День {deskDays[summaryOpen].day}. {deskDays[summaryOpen].title}
                </h2>
                <div className="result-grid">
                  <article>
                    <p className="eyebrow">Вердикты</p>
                    <h3>
                      {percentage(
                        summaryResults.length === 0
                          ? 0
                          : summaryResults.filter((entry) => entry.verdictCorrect)
                              .length / summaryResults.length,
                      )}
                      %
                    </h3>
                    <p>Точность по финальным штампам за смену.</p>
                  </article>
                  <article>
                    <p className="eyebrow">Документы</p>
                    <h3>
                      {percentage(
                        average(summaryResults.map((entry) => entry.documentAccuracy)),
                      )}
                      %
                    </h3>
                    <p>Насколько чисто читались доказательства и исключения.</p>
                  </article>
                  <article>
                    <p className="eyebrow">Средние звёзды</p>
                    <h3>
                      {formatStars(
                        average(summaryResults.map((entry) => scoreToStars(entry.score))),
                      )}{" "}
                      / 5
                    </h3>
                    <p>Чем чище разбор, тем выше звёздный итог смены.</p>
                  </article>
                </div>
                <div className="modal-card__actions">
                  <PixelButton onClick={moveToNextDay}>Начать следующий день</PixelButton>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {finalOpen ? (
            <motion.section className="overlay" key="final" {...overlayTransition()}>
              <div className="overlay__backdrop overlay__backdrop--ink" />
              <div className="modal-card modal-card--final">
                <p className="eyebrow">Смена закрыта</p>
                <h2>Три дня пройдены. Стол принял вас в смену.</h2>
                <p className="modal-card__lede">
                  Вы выдержали базу, таймлайны и серые зоны. Теперь это уже больше
                  похоже на настоящую desk-game смену, чем на страницу в браузере.
                </p>

                <div className="result-grid">
                  <article>
                    <p className="eyebrow">Точность штампа</p>
                    <h3>{percentage(verdictAccuracy)}%</h3>
                    <p>Главный показатель финального штампа.</p>
                  </article>
                  <article>
                    <p className="eyebrow">Точность разбора</p>
                    <h3>{percentage(documentAccuracy)}%</h3>
                    <p>Насколько хорошо вы чувствовали доказательства и исключения.</p>
                  </article>
                  <article>
                    <p className="eyebrow">Итоговые звёзды</p>
                    <h3>{formatStars(averageStars)} / 5</h3>
                    <p>Финальный ранг по всем пятнадцати делам.</p>
                  </article>
                </div>

                <div className="modal-card__actions">
                  <PixelButton onClick={restartCampaign}>Пройти заново</PixelButton>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}

export default App;
