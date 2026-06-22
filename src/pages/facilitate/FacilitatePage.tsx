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

const v = (cssVar: string, alpha?: number) =>
  alpha === undefined ? `hsl(var(${cssVar}))` : `hsl(var(${cssVar}) / ${alpha})`;

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
    setMeeting(m);
    setStep(STEPS[m][0].id);
    setActiveStage(null);
    setShowJourney(false);
  };
  const changeRole = (r: Role) => { setRole(r); setPmIndex(0); };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-14 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">ProMoves</span>
          <span className="text-muted-foreground">live session</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Meeting</span>
          <Select value={meeting} onValueChange={(val) => changeMeeting(val as MeetingType)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">Check-in</SelectItem>
              <SelectItem value="out">Check-out</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-1">Role</span>
          <Select value={role} onValueChange={(val) => changeRole(val as Role)}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="RDA">RDA</SelectItem>
              <SelectItem value="DFI">DFI</SelectItem>
              <SelectItem value="OM">Office Manager</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="ml-1" aria-label="Exit session"
            onClick={() => navigate("/")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left rail: meeting steps only */}
        <nav className="w-52 shrink-0 border-r p-3 flex flex-col gap-1">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const on = s.id === step;
            return (
              <button key={s.id} onClick={() => setStep(s.id)}
                className={`flex items-center gap-3 w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors ${
                  on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}>
                <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[11px] border ${
                  on ? "border-primary" : "border-border"
                }`}>{i + 1}</span>
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto px-12 py-10">
          {step === "question" && (
            <Section icon={Sparkles} label="Question of the day">
              <p className="text-4xl font-medium leading-tight max-w-3xl min-h-[120px] flex items-center">
                {question}
              </p>
              <div className="flex gap-3 mt-8">
                <Button onClick={() => { setCustom(""); setQIndex((qIndex + 1) % icebreakers.length); }}>
                  Next question <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={() => setShowCustom(true)}>Write your own</Button>
              </div>
              {showCustom && (
                <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
                  placeholder="Type a question and it shows here…"
                  className="mt-4 w-full max-w-xl h-10 rounded-md border bg-background px-3 text-sm" />
              )}
            </Section>
          )}

          {step === "promoves" && (
            <Section icon={Target} label={`This week's pro moves · ${roleLabels[role]}`}>
              <p className="text-sm text-muted-foreground italic mb-6">
                Read it aloud, talk it through, role-play where it helps.
              </p>
              <ProMoveCard pm={proMoves[pmIndex]} index={pmIndex} total={proMoves.length} />
              <div className="flex items-center gap-3 mt-6">
                <Button variant="outline"
                  onClick={() => setPmIndex((pmIndex - 1 + proMoves.length) % proMoves.length)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <Button variant="outline"
                  onClick={() => setPmIndex((pmIndex + 1) % proMoves.length)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <div className="flex gap-1.5 ml-3">
                  {proMoves.map((_, i) => (
                    <span key={i} className="h-2 w-2 rounded-full transition-colors"
                      style={{ background: i === pmIndex ? v("--primary") : v("--border") }} />
                  ))}
                </div>
              </div>
            </Section>
          )}

          {(step === "confidence" || step === "performance") && (
            <ScaleReference kind={step === "confidence" ? "confidence" : "performance"} />
          )}

          {step === "glows" && (
            <Section icon={PartyPopper} label="Glows · what went well this week">
              <p className="text-2xl font-medium mb-2">Where did we shine?</p>
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed mb-6">
                The patient journey is our anchor. Pull it up to point at the moments the team nailed.
              </p>
              <Button variant="outline" onClick={() => setShowJourney(!showJourney)}>
                <Map className="h-4 w-4 mr-2" /> {showJourney ? "Hide" : "Pull up"} the patient journey
              </Button>
              {showJourney && (
                <JourneyExplorer role={role} active={activeStage} setActive={setActiveStage} />
              )}
            </Section>
          )}

          {step === "grows" && (
            <Section icon={Sprout} label="Grows · what we will make smoother">
              <p className="text-2xl font-medium mb-2">What is one thing we level up next week?</p>
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                Tie it back to a journey moment, then celebrate the growth.
              </p>
            </Section>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({ icon: Icon, label, children }: {
  icon: React.ElementType; label: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5 uppercase tracking-wide">
        <Icon className="h-4 w-4" /> {label}
      </div>
      {children}
    </div>
  );
}

function ProMoveCard({ pm, index, total }: {
  pm: typeof proMovesByRole[Role][number]; index: number; total: number;
}) {
  const color = v(domainVar[pm.domain]);
  return (
    <div className="rounded-xl border p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium" style={{ color }}>{pm.domain}</span>
        <span className="text-xs text-muted-foreground">{index + 1} of {total}</span>
      </div>
      <p className="text-3xl font-medium leading-snug">{pm.statement}</p>
      {pm.hasScript && (
        <Button variant="outline" size="sm" className="mt-6">
          <FileText className="h-4 w-4 mr-2" /> Open scripting
        </Button>
      )}
    </div>
  );
}

function ScaleReference({ kind }: { kind: "confidence" | "performance" }) {
  const Icon = kind === "confidence" ? Smile : ListChecks;
  return (
    <Section icon={Icon} label={`${kind === "confidence" ? "Confidence" : "Performance"} · rate in the app`}>
      <p className="text-2xl font-medium mb-1">Everyone, rate your {kind} in the app.</p>
      <p className="text-sm text-muted-foreground mb-6">On your phone. Here is what each number means:</p>
      <div className="flex flex-col gap-3 max-w-2xl">
        {scale.map(({ n, text }) => (
          <div key={n} className="flex items-center gap-4">
            <span className="flex items-center justify-center h-10 w-10 rounded-md text-lg font-medium shrink-0"
              style={{ background: v(`--score-${n}-bg`), color: v(`--score-${n}`) }}>{n}</span>
            <span className="text-base text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
      {kind === "confidence" && (
        <p className="text-sm text-muted-foreground mt-8">Then high fives, and we are done.</p>
      )}
    </Section>
  );
}

function JourneyExplorer({ role, active, setActive }: {
  role: Role; active: number | null; setActive: (i: number) => void;
}) {
  const stage = active === null ? null : journeyStages[active];
  const stagePms = useMemo(() => (stage ? stage.proMovesByRole[role] : []), [stage, role]);
  return (
    <div className="mt-6 max-w-4xl">
      <div className="grid grid-cols-5 gap-2">
        {journeyStages.map((s, i) => {
          const on = i === active;
          return (
            <button key={s.name} onClick={() => setActive(i)}
              className={`rounded-md border px-2 py-3 text-center transition-colors ${
                on ? "border-primary border-2 bg-primary/5" : "hover:border-foreground/30"
              }`}>
              <div className="text-xs font-medium">{s.name}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{s.roles}</div>
            </button>
          );
        })}
      </div>
      {stage && (
        <div className="mt-4 border-t pt-4">
          <div className="text-base font-medium mb-1">{stage.name}</div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3 max-w-2xl">{stage.description}</p>
          <div className="text-xs text-muted-foreground mb-2">Pro moves here for {roleLabels[role]}</div>
          <div className="flex flex-wrap gap-2">
            {stagePms.length === 0 && (
              <span className="text-sm text-muted-foreground italic">No specific moves for this role here.</span>
            )}
            {stagePms.map((p) => (
              <span key={p} className="text-sm bg-muted rounded-md px-3 py-1.5">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
