import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DomainBadge } from '@/components/ui/domain-badge';
import { Target, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useCurrentFocus } from '@/hooks/useCurrentFocus';
import { reviewPath } from '@/lib/reviewRoute';

/**
 * Home card showing the staff member's currently selected quarterly focus ProMoves.
 * "Current" = focus rows tied to the evaluation with max(program_year, quarter)
 * among released evaluations for this staff member.
 */
export function CurrentFocusCard() {
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const navigate = useNavigate();
  const staffId = staffProfile?.id;

  const { data } = useCurrentFocus(staffId);

  if (!data) return null;

  // Don't show prompt — focus only appears after completing the review wizard
  if (data.type === 'prompt') return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            My Quarterly Focus
          </CardTitle>
          <Link
            to={reviewPath(data.evalId)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View Evaluation <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.learnerNote && (
          <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-primary/40 mb-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">My note</p>
            <p className="text-sm italic text-foreground leading-relaxed">{data.learnerNote}</p>
          </div>
        )}
        {data.items.map(item => (
          <div key={item.actionId} className="flex items-start gap-2 py-1.5">
            <DomainBadge domain={item.domainName} className="mt-0.5" />
            <span className="text-sm leading-relaxed">{item.statement}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
