import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, Target, Smile, PartyPopper, Sprout, ListChecks,
  ChevronLeft, ChevronRight, FileText, Map, X, ArrowRight,
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

const NUDGE: Record<StepId, string> = {
  question: "Open warm. Click through until one feels right, or write your own.",
  promoves: "Read it aloud, talk it through, role-play where it helps.",
  confidence: "Everyone rates on their own phone. Read the scale to the room.",
  glows: "Pull up the journey and point at the moments we nailed.",
  grows: "One thing we level up. Tie it to a journey moment.",
  performance: "Everyone rates on their own phone. Read the scale to the room.",
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

  const changeMeeting = (m: MeetingType) => {
    setMeeting(m); setStep(STEPS[m][0].id); setActiveStage(null); setShowJourney(false);
  };
  const changeRole = (r: Role) => { setRole(r); setPmIndex(0); };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {/* Top bar */}
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
        {/* Left rail: meeting steps only */}
        <nav className="w-56 shrink-0 border-r border-white/40 bg-muted/40 p-3 flex flex-col gap-1.5">
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Meeting flow</div>
          {steps.map((s, i) => {
            const Icon = s.icon;
            const on = s.id === step;
            return (
              <button key={s.id} onClick={() => setStep(s.id)}
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

        {/* Main content, centered column */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div key={`${meeting}-${step}`}
            className="mx-auto w-full max-w-4xl min-h-full flex flex-col justify-center px-14 py-12 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {step === "question" && (
              <Section icon={Sparkles} label="Question of the day" nudge={NUDGE.question}>
                <p className="text-5xl font-semibold leading-tight tracking-tight min-h-[140px] flex items-center">{question}</p>
                <div className="flex gap-3 mt-8">
                  <Button size="lg" onClick={() => { setCustom(""); setShowCustom(false); setQIndex((qIndex + 1) % icebreakers.length); }}>
                    Next question <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setShowCustom(true)}>Write your own</Button>
                </div>
                {showCustom && (
                  <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
                    placeholder="Type a question and it shows here…"
                    className={`mt-5 w-full max-w-2xl h-12 px-4 text-base ${glass}`} />
                )}
              </Section>
            )}

            {step === "promoves" && (
              <Section icon={Target} label={`This week's pro moves · ${roleLabels[role]}`} nudge={NUDGE.promoves}>
                <ProMoveCard pm={proMoves[pmIndex]} index={pmIndex} total={proMoves.length} />
                <div className="flex items-center gap-3 mt-6">
                  <Button variant="outline" onClick={() => setPmIndex((pmIndex - 1 + proMoves.length) % proMoves.length)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <Button variant="outline" onClick={() => setPmIndex((pmIndex + 1) % proMoves.length)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                  <div className="flex gap-1.5 ml-3 items-center">
                    {proMoves.map((_, i) => (
                      <span key={i} className="h-2 rounded-full transition-all"
                        style={{ width: i === pmIndex ? 24 : 8, background: i === pmIndex ? v("--primary") : v("--border") }} />
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {(step === "confidence" || step === "performance") && (
              <ScaleReference kind={step === "confidence" ? "confidence" : "performance"} />
            )}

            {step === "glows" && (
              <Section icon={PartyPopper} label="Glows · what went well this week" nudge={NUDGE.glows}>
                <p className="text-3xl font-semibold tracking-tight mb-2">Where did we shine?</p>
                <p className="text-base text-muted-foreground max-w-2xl leading-relaxed mb-6">
                  The patient journey is our anchor. Pull it up to point at the moments the team nailed.
                </p>
                <Button size="lg" variant="outline" onClick={() => setShowJourney(!showJourney)}>
                  <Map className="h-4 w-4 mr-2" /> {showJourney ? "Hide" : "Pull up"} the patient journey
                </Button>
                {showJourney && <JourneyExplorer role={role} active={activeStage} setActive={setActiveStage} />}
              </Section>
            )}

            {step === "grows" && (
              <Section icon={Sprout} label="Grows · what we will make smoother" nudge={NUDGE.grows}>
                <p className="text-3xl font-semibold tracking-tight mb-2">What is one thing we level up next week?</p>
                <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
                  Tie it back to a journey moment, then celebrate the growth.
                </p>
              </Section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Section({ icon: Icon, label, nudge, children }: {
  icon: React.ElementType; label: string; nudge?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      </div>
      {nudge && <p className="text-sm text-muted-foreground/80 mb-7 ml-12">{nudge}</p>}
      {children}
    </div>
  );
}

function ProMoveCard({ pm, index, total }: {
  pm: typeof proMovesByRole[Role][number]; index: number; total: number;
}) {
  const color = v(domainVar[pm.domain]);
  const pastel = v(`${domainVar[pm.domain]}-pastel`);
  return (
    <div className={`relative overflow-hidden p-10 pl-12 ${glass}`}>
      <span className="absolute left-0 top-0 bottom-0 w-2.5" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between mb-5">
        <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: pastel, color }}>{pm.domain}</span>
        <span className="text-xs text-muted-foreground">{index + 1} of {total}</span>
      </div>
      <p className="text-4xl font-medium leading-snug tracking-tight">{pm.statement}</p>
      {pm.hasScript && (
        <Button variant="outline" className="mt-7">
          <FileText className="h-4 w-4 mr-2" /> Open scripting
        </Button>
      )}
    </div>
  );
}

function ScaleReference({ kind }: { kind: "confidence" | "performance" }) {
  const Icon = kind === "confidence" ? Smile : ListChecks;
  const label = kind === "confidence" ? "Confidence" : "Performance";
  return (
    <Section icon={Icon} label={`${label} · rate in the app`} nudge={NUDGE[kind]}>
      <p className="text-3xl font-semibold tracking-tight mb-1">Everyone, rate your {kind} in the app.</p>
      <p className="text-base text-muted-foreground mb-7">On your phone. Here is what each number means.</p>
      <div className="flex flex-col gap-3 max-w-3xl">
        {scale.map(({ n, text }) => (
          <div key={n} className={`flex items-center gap-5 p-4 ${glass}`}>
            <span className="flex items-center justify-center h-14 w-14 rounded-xl text-2xl font-semibold shrink-0"
              style={{ background: v(`--score-${n}-bg`), color: v(`--score-${n}`) }}>{n}</span>
            <span className="text-lg text-foreground">{text}</span>
          </div>
        ))}
      </div>
      {kind === "confidence" && <p className="text-base text-muted-foreground mt-8">Then high fives, and we are done.</p>}
    </Section>
  );
}

function JourneyExplorer({ role, active, setActive }: {
  role: Role; active: number | null; setActive: (i: number) => void;
}) {
  const stage = active === null ? null : journeyStages[active];
  const stagePms = useMemo(() => (stage ? stage.proMovesByRole[role] : []), [stage, role]);
  return (
    <div className="mt-7 max-w-4xl">
      <div className="grid grid-cols-5 gap-2.5">
        {journeyStages.map((s, i) => {
          const on = i === active;
          return (
            <button key={s.name} onClick={() => setActive(i)}
              className={`rounded-xl p-3 text-center transition-all ${glass} ${
                on ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"
              }`}>
              <div className="text-xs font-semibold">{s.name}</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.roles}</div>
            </button>
          );
        })}
      </div>
      {stage && (
        <div className={`mt-4 p-6 animate-in fade-in duration-200 ${glass}`}>
          <div className="text-lg font-semibold mb-1">{stage.name}</div>
          <p className="text-base text-muted-foreground leading-relaxed mb-4 max-w-2xl">{stage.description}</p>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pro moves here for {roleLabels[role]}</div>
          <div className="flex flex-wrap gap-2">
            {stagePms.length === 0 && (
              <span className="text-sm text-muted-foreground italic">No specific moves for this role at this stage.</span>
            )}
            {stagePms.map((p) => (
              <span key={p} className="text-sm bg-background/70 border border-white/40 rounded-full px-3 py-1.5">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
