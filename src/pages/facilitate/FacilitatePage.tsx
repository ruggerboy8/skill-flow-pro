import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, Target, Smile, PartyPopper, Sprout, ListChecks,
  ChevronLeft, ChevronRight, GraduationCap, FolderOpen, X, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Role, MeetingType, domainVar, scale, roleLabels,
  proMovesByRole, journeyStages, icebreakers,
} from "./facilitatorData";

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
const v = (cssVar: string) => `hsl(var(${cssVar}))`;

export default function FacilitatePage() {
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<MeetingType>("in");
  const [role, setRole] = useState<Role>("RDA");
  const [step, setStep] = useState<StepId>("question");
  const [qIndex, setQIndex] = useState(0);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pmIndex, setPmIndex] = useState(0);
  const [showJourney, setShowJourney] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);

  const steps = STEPS[meeting];
  const proMoves = proMovesByRole[role];
  const question = custom || icebreakers[qIndex];

  const goStep = (id: StepId) => { setStep(id); setShowJourney(false); };
  const changeMeeting = (m: MeetingType) => {
    setMeeting(m); setStep(STEPS[m][0].id); setActiveStage(null); setShowJourney(false);
  };
  const changeRole = (r: Role) => { setRole(r); setPmIndex(0); };

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
            <Select value={role} onValueChange={(val) => changeRole(val as Role)}>
              <SelectTrigger className="h-8 w-36 border-0 bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RDA">RDA</SelectItem>
                <SelectItem value="DFI">DFI</SelectItem>
                <SelectItem value="OM">Office Manager</SelectItem>
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
            className="mx-auto w-full max-w-5xl min-h-full flex flex-col justify-center px-16 py-12 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {step === "question" && (
              <>
                <p className="text-6xl lg:text-7xl font-semibold leading-[1.05] tracking-tight">{question}</p>
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
              <>
                <ProMoveCard pm={proMoves[pmIndex]} index={pmIndex} total={proMoves.length} />
                <div className="flex items-center gap-3 mt-8">
                  <Button variant="outline" size="lg" onClick={() => setPmIndex((pmIndex - 1 + proMoves.length) % proMoves.length)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => setPmIndex((pmIndex + 1) % proMoves.length)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                  <div className="flex gap-1.5 ml-3 items-center">
                    {proMoves.map((_, i) => (
                      <span key={i} className="h-2 rounded-full transition-all"
                        style={{ width: i === pmIndex ? 28 : 8, background: i === pmIndex ? v("--primary") : v("--border") }} />
                    ))}
                  </div>
                </div>
              </>
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

function ProMoveCard({ pm, index, total }: {
  pm: typeof proMovesByRole[Role][number]; index: number; total: number;
}) {
  const color = v(domainVar[pm.domain]);
  const pastel = v(`${domainVar[pm.domain]}-pastel`);
  return (
    <div className={`relative overflow-hidden p-12 pl-14 ${glass}`}>
      <span className="absolute left-0 top-0 bottom-0 w-2.5" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between mb-6">
        <span className="rounded-full px-3.5 py-1 text-sm font-medium" style={{ background: pastel, color }}>{pm.domain}</span>
        <span className="text-sm text-muted-foreground">{index + 1} of {total}</span>
      </div>
      <p className="text-5xl font-medium leading-[1.12] tracking-tight">{pm.statement}</p>
      {pm.hasScript && (
        <Button variant="outline" size="lg" className="mt-8">
          <GraduationCap className="h-5 w-5 mr-2" /> Learning material
        </Button>
      )}
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
        <p className="text-6xl font-semibold leading-[1.05] tracking-tight">{question}</p>
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
