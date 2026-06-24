import { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  Sparkles, Target, Smile, PartyPopper, Sprout, ListChecks,
  ChevronLeft, ChevronRight, GraduationCap, FolderOpen, X, ArrowRight,
  FileText, Link2, Play, Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Role, MeetingType, domainVar, scale, roleLabels,
  journeyStages, icebreakers,
} from "./facilitatorData";
import { useFacilitatorWeek, WeekProMove, ProMoveResource } from "./useFacilitatorWeek";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useRoleDisplayNames } from "@/hooks/useRoleDisplayNames";

// Map archetype_code → legacy Role key used by the seeded journey content.
const ARCHETYPE_TO_LEGACY: Record<string, Role> = {
  front_desk: "DFI",
  dental_assistant: "RDA",
  lead_dental_assistant: "RDA",
  practice_manager: "OM",
};

interface OrgRole { role_id: number; role_name: string; archetype_code: string | null; }

type StepId = "question" | "promoves" | "confidence" | "glows" | "grows" | "performance";

interface Step { id: StepId; label: string; icon: React.ElementType; }

const STEPS: Record<MeetingType, Step[]> = {
  in: [
    { id: "question", label: "Question", icon: Sparkles },
    { id: "promoves", label: "Pro moves", icon: Target },
    { id: "confidence", label: "Confidence", icon: Smile },
  ],
  out: [
    { id: "question", label: "Question", icon: Sparkles },
    { id: "glows", label: "Glows", icon: PartyPopper },
    { id: "grows", label: "Grows", icon: Sprout },
    { id: "performance", label: "Performance", icon: ListChecks },
  ],
};

const glass = "bg-glass-gradient backdrop-blur-md border border-white/40 dark:border-slate-700/40 shadow-glass rounded-xl";
// Shared card footprint so the pro-move card and the learning-material card match,
// and a FIXED height so Prev/Next never shift with statement length.
const CARD = "w-[34rem] h-[38rem]";
const v = (cssVar: string) => `hsl(var(${cssVar}))`;

export default function FacilitatePage() {
  const navigate = useNavigate();
  const { practiceType } = useUserRole();
  const { resolve: resolveRole } = useRoleDisplayNames();
  const [meeting, setMeeting] = useState<MeetingType>("in");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [step, setStep] = useState<StepId>("question");
  const [qIndex, setQIndex] = useState(0);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pmIndex, setPmIndex] = useState(0);
  const [showJourney, setShowJourney] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [showMaterial, setShowMaterial] = useState(false);

  // Load the active roles available for this org's practice type.
  const { data: orgRoles = [] } = useQuery<OrgRole[]>({
    queryKey: ["facilitator-roles", practiceType],
    enabled: !!practiceType,
    queryFn: async () => {
      const { data } = await supabase
        .from("roles")
        .select("role_id, role_name, archetype_code, practice_type, active")
        .eq("practice_type", practiceType!)
        .eq("active", true)
        .order("role_id");
      // Exclude doctors — facilitator flow targets staff roles.
      return (data ?? []).filter((r: any) => r.archetype_code !== "doctor") as OrgRole[];
    },
  });

  // Default-select the first available role once roles arrive.
  useEffect(() => {
    if (roleId == null && orgRoles.length > 0) setRoleId(orgRoles[0].role_id);
  }, [orgRoles, roleId]);

  const activeRole = orgRoles.find(r => r.role_id === roleId);
  const legacyRoleKey: Role = (activeRole && ARCHETYPE_TO_LEGACY[activeRole.archetype_code ?? ""]) || "RDA";
  const roleDisplayName = activeRole ? resolveRole(activeRole.role_id, activeRole.role_name) : "";

  const steps = STEPS[meeting];
  const { data: proMoves = [], isLoading: pmLoading } = useFacilitatorWeek(roleId);
  const safeIndex = proMoves.length ? Math.min(pmIndex, proMoves.length - 1) : 0;
  const question = custom || icebreakers[qIndex];

  const goStep = (id: StepId) => { setStep(id); setShowJourney(false); setShowMaterial(false); };
  const changeMeeting = (m: MeetingType) => {
    setMeeting(m); setStep(STEPS[m][0].id); setActiveStage(null); setShowJourney(false); setShowMaterial(false);
  };
  const changeRole = (id: number) => { setRoleId(id); setPmIndex(0); setShowMaterial(false); };
  const moveTo = (i: number) => { setShowMaterial(false); setPmIndex(i); };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {/* Top bar (Ariana's controls, kept off the teaching canvas) */}
      <header className="flex items-center justify-between px-6 h-16 border-b border-white/40 bg-card/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2 w-2 rounded-full" style={{ background: v("--status-complete") }} aria-hidden />
          <span className="text-base font-semibold tracking-tight">ProMoves</span>
          <span className="text-sm text-muted-foreground">live session</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/60 pl-3 pr-2 py-1">
            <span className="text-xs text-muted-foreground">Meeting</span>
            <Select value={meeting} onValueChange={(val) => changeMeeting(val as MeetingType)}>
              <SelectTrigger className="h-8 w-28 border-0 bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Check-in</SelectItem>
                <SelectItem value="out">Check-out</SelectItem>
              </SelectContent>
            </Select>
            <span className="h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground">Role</span>
            <Select
              value={roleId != null ? String(roleId) : ""}
              onValueChange={(val) => changeRole(Number(val))}
              disabled={orgRoles.length === 0}
            >
              <SelectTrigger className="h-8 w-44 border-0 bg-transparent shadow-none focus:ring-0">
                <SelectValue placeholder={orgRoles.length === 0 ? "No roles" : "Select role"} />
              </SelectTrigger>
              <SelectContent>
                {orgRoles.map(r => (
                  <SelectItem key={r.role_id} value={String(r.role_id)}>
                    {resolveRole(r.role_id, r.role_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="ghost" size="icon" className="ml-1" aria-label="Exit session" onClick={() => navigate("/")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left rail: meeting steps only (Ariana's flow control) */}
        <nav className="w-56 shrink-0 border-r border-white/40 bg-muted/40 p-3 flex flex-col gap-1.5">
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Meeting flow</div>
          {steps.map((s, i) => {
            const Icon = s.icon;
            const on = s.id === step;
            return (
              <button key={s.id} onClick={() => goStep(s.id)}
                className={`flex items-center gap-3 w-full text-left rounded-lg px-3 py-3 text-sm transition-all ${
                  on ? "bg-card shadow-sm font-medium text-foreground" : "text-muted-foreground hover:bg-card/50"
                }`}>
                <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs shrink-0 ${
                  on ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                }`}>{i + 1}</span>
                <Icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Teaching canvas: big, centered, only what the student needs */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div key={`${meeting}-${step}`}
            className="mx-auto w-full max-w-7xl min-h-full flex flex-col justify-center px-16 py-12 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {step === "question" && (
              <>
                <p className="text-6xl lg:text-7xl font-semibold leading-[1.05] tracking-tight max-w-5xl">{question}</p>
                <div className="flex gap-3 mt-12">
                  <Button size="lg" onClick={() => { setCustom(""); setShowCustom(false); setQIndex((qIndex + 1) % icebreakers.length); }}>
                    Next question <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setShowCustom(true)}>Write your own</Button>
                </div>
                {showCustom && (
                  <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
                    placeholder="Type a question…"
                    className={`mt-6 w-full max-w-3xl h-14 px-5 text-xl ${glass}`} />
                )}
              </>
            )}

            {step === "promoves" && (
              pmLoading ? (
                <p className="text-2xl text-muted-foreground">Loading this week's pro moves…</p>
              ) : proMoves.length === 0 ? (
                <div className="max-w-2xl">
                  <p className="text-4xl font-semibold tracking-tight mb-3">No pro moves locked yet</p>
                  <p className="text-lg text-muted-foreground">
                    There is no locked plan for {roleLabels[role]} this week at your location. Lock it in the planner, then refresh.
                  </p>
                </div>
              ) : (
                <div className="flex gap-6 justify-center items-center">
                  <div className="flex gap-2 shrink-0">
                    <CircleArrow dir="prev" onClick={() => moveTo((safeIndex - 1 + proMoves.length) % proMoves.length)} />
                    <CircleArrow dir="next" onClick={() => moveTo((safeIndex + 1) % proMoves.length)} />
                  </div>
                  <ProMoveCard pm={proMoves[safeIndex]} index={safeIndex} total={proMoves.length}
                    showMaterial={showMaterial} setShowMaterial={setShowMaterial} />
                  {showMaterial && proMoves[safeIndex].hasResource && (
                    <MaterialCard pm={proMoves[safeIndex]} />
                  )}
                </div>
              )
            )}

            {(step === "confidence" || step === "performance") && (
              <ScaleReference kind={step === "confidence" ? "confidence" : "performance"} />
            )}

            {step === "glows" && (
              <Reflection
                icon={PartyPopper} iconColor={v("--score-4")}
                question="What glowed this week?"
                showJourney={showJourney} setShowJourney={setShowJourney}
                role={role} activeStage={activeStage} setActiveStage={setActiveStage}
              />
            )}

            {step === "grows" && (
              <Reflection
                icon={Sprout} iconColor={v("--score-2")}
                question="What can we grow next week?"
                showJourney={showJourney} setShowJourney={setShowJourney}
                role={role} activeStage={activeStage} setActiveStage={setActiveStage}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Sizes the statement as large as possible while still fitting its box (no scroll).
function FitText({ text, min = 28, max = 60 }: { text: string; min?: number; max?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const box = boxRef.current, span = spanRef.current;
    if (!box || !span) return;
    const fit = () => {
      let lo = min, hi = max, best = min;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        span.style.fontSize = mid + "px";
        if (span.scrollHeight <= box.clientHeight) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      span.style.fontSize = best + "px";
      setSize(best);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text, min, max]);
  return (
    <div ref={boxRef} className="w-full h-full flex items-center overflow-hidden">
      <span ref={spanRef} className="block w-full font-medium tracking-tight"
        style={{ fontSize: size, lineHeight: 1.12 }}>{text}</span>
    </div>
  );
}

function CircleArrow({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={dir === "prev" ? "Previous pro move" : "Next pro move"}
      className="h-11 w-11 rounded-full flex items-center justify-center bg-card border border-border shadow-sm text-foreground hover:bg-muted transition-colors">
      {dir === "prev" ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}

function ProMoveCard({ pm, index, total, showMaterial, setShowMaterial }: {
  pm: WeekProMove; index: number; total: number;
  showMaterial: boolean; setShowMaterial: (b: boolean) => void;
}) {
  const cssVar = domainVar[pm.domain as keyof typeof domainVar] ?? "--primary";
  const known = cssVar !== "--primary";
  const color = v(cssVar);
  const pastel = known ? v(`${cssVar}-pastel`) : v("--muted");
  const onPastel = known ? color : v("--muted-foreground");
  return (
    <div className={`relative overflow-hidden py-10 pl-14 pr-20 flex flex-col ${glass} h-[38rem] transition-[width] duration-300 ${showMaterial ? "w-[34rem]" : "w-[50rem]"}`}>
      <span className="absolute left-0 top-0 bottom-0 w-2.5" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between mb-6 shrink-0">
        <span className="rounded-full px-3.5 py-1 text-sm font-medium" style={{ background: pastel, color: onPastel }}>{pm.domain}</span>
        <span className="text-sm text-muted-foreground">{index + 1} of {total}</span>
      </div>
      <div className="flex-1 min-h-0">
        <FitText text={pm.statement} />
      </div>
      {pm.hasResource && (
        <button onClick={() => setShowMaterial(!showMaterial)}
          aria-label={showMaterial ? "Hide learning material" : "Show learning material"}
          className="absolute right-5 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full flex items-center justify-center bg-card border border-border shadow-sm text-primary hover:bg-muted transition-colors">
          {showMaterial ? <X className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}

function MaterialCard({ pm }: { pm: WeekProMove }) {
  const audio = pm.resources.find((r) => r.type === "audio" && r.url);
  const scripts = pm.resources.filter((r) => r.contentMd);
  const links = pm.resources.filter((r) => r.url && r.type !== "audio");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const toggleAudio = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setPlaying(false)); else a.pause();
  };
  return (
    <div className={`p-10 flex flex-col ${glass} ${CARD} animate-in slide-in-from-right-4 fade-in duration-300`}>
      <div className="flex items-center gap-2 mb-6 shrink-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <GraduationCap className="h-4 w-4" /> Learning material
      </div>
      <div className="flex-1 overflow-y-auto pr-1 space-y-7">
        {pm.intervention && (
          <section>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Why this matters</div>
            <p className="text-lg leading-relaxed text-foreground">{pm.intervention}</p>
          </section>
        )}
        {(scripts.length > 0 || audio) && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-lg font-medium">Script</span>
              {audio && (
                <button onClick={toggleAudio} aria-label={playing ? "Pause audio" : "Play audio"}
                  className="ml-1 h-9 w-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 transition">
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
              )}
            </div>
            {scripts.map((r, i) => (
              <div key={i} className="prose prose-lg dark:prose-invert max-w-none text-foreground">
                <ReactMarkdown>{r.contentMd || ""}</ReactMarkdown>
              </div>
            ))}
            {audio && (
              <audio ref={audioRef} src={audio.url!} className="hidden"
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
            )}
          </section>
        )}
        {links.map((r, i) => (
          <a key={i} href={r.url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-base text-primary underline">
            <Link2 className="h-4 w-4" /> {r.title || "Open resource"}
          </a>
        ))}
      </div>
    </div>
  );
}

function ScaleReference({ kind }: { kind: "confidence" | "performance" }) {
  return (
    <>
      <p className="text-5xl font-semibold tracking-tight mb-10">Rate your {kind}.</p>
      <div className="flex flex-col gap-4 max-w-3xl">
        {scale.map(({ n, text }) => (
          <div key={n} className={`flex items-center gap-6 p-5 ${glass}`}>
            <span className="flex items-center justify-center h-16 w-16 rounded-2xl text-3xl font-semibold shrink-0"
              style={{ background: v(`--score-${n}-bg`), color: v(`--score-${n}`) }}>{n}</span>
            <span className="text-xl text-foreground">{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Reflection({ icon: Icon, iconColor, question, showJourney, setShowJourney, role, activeStage, setActiveStage }: {
  icon: React.ElementType; iconColor: string; question: string;
  showJourney: boolean; setShowJourney: (b: boolean) => void;
  role: Role; activeStage: number | null; setActiveStage: (i: number) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-4">
        <Icon className="h-12 w-12 shrink-0" style={{ color: iconColor }} aria-hidden />
        <p className="text-6xl font-semibold leading-[1.05] tracking-tight max-w-4xl">{question}</p>
      </div>

      {showJourney && <JourneyExplorer role={role} active={activeStage} setActive={setActiveStage} />}

      {/* Ariana's "supply cabinet": understated, off to the side */}
      <div className="mt-12">
        <button onClick={() => setShowJourney(!showJourney)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground/70 hover:text-foreground transition-colors">
          <FolderOpen className="h-4 w-4" />
          {showJourney ? "Put the patient journey away" : "Pull up the patient journey"}
        </button>
      </div>
    </>
  );
}

function JourneyExplorer({ role, active, setActive }: {
  role: Role; active: number | null; setActive: (i: number) => void;
}) {
  const stage = active === null ? null : journeyStages[active];
  const stagePms = useMemo(() => (stage ? stage.proMovesByRole[role] : []), [stage, role]);
  return (
    <div className="mt-8 max-w-5xl animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="grid grid-cols-5 gap-2.5">
        {journeyStages.map((s, i) => {
          const on = i === active;
          return (
            <button key={s.name} onClick={() => setActive(i)}
              className={`rounded-xl p-3.5 text-center transition-all ${glass} ${
                on ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"
              }`}>
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{s.roles}</div>
            </button>
          );
        })}
      </div>
      {stage && (
        <div className={`mt-4 p-7 animate-in fade-in duration-200 ${glass}`}>
          <div className="text-2xl font-semibold mb-2">{stage.name}</div>
          <p className="text-lg text-muted-foreground leading-relaxed mb-5 max-w-3xl">{stage.description}</p>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pro moves here for {roleLabels[role]}</div>
          <div className="flex flex-wrap gap-2">
            {stagePms.length === 0 && (
              <span className="text-base text-muted-foreground italic">No specific moves for this role at this stage.</span>
            )}
            {stagePms.map((p) => (
              <span key={p} className="text-base bg-background/70 border border-white/40 rounded-full px-4 py-2">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
