import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Location {
  id?: string;
  name: string;
  organization_id: string | null;
  timezone: string;
  program_start_date: string;
  cycle_length_weeks: number;
}

interface Organization {
  id: string;
  name: string;
}

interface LocationFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  location: Location | null;
  organizations: Organization[];
}

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona Time (MST)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
];

export function LocationFormDrawer({ open, onClose, onSuccess, location, organizations }: LocationFormDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    organization_id: "",
    timezone: "America/Chicago",
    program_start_date: new Date(),
    cycle_length_weeks: 6,
  });

  const isEditing = !!location?.id;

  useEffect(() => {
    if (location && open) {
      setFormData({
        name: location.name,
        organization_id: location.organization_id || "",
        timezone: location.timezone,
        program_start_date: new Date(location.program_start_date),
        cycle_length_weeks: location.cycle_length_weeks,
      });
    } else if (open) {
      setFormData({
        name: "",
        organization_id: "",
        timezone: "America/Chicago",
        program_start_date: new Date(),
        cycle_length_weeks: 6,
      });
    }
  }, [location, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.program_start_date) return;

    if (formData.cycle_length_weeks < 1) {
      toast({
        title: "Validation Error",
        description: "Cycle length must be at least 1 week",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Generate slug from name
      const slug = formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      const locationData = {
        name: formData.name,
        slug: slug,
        organization_id: formData.organization_id === "none" ? null : (formData.organization_id || null),
        timezone: formData.timezone,
        program_start_date: formData.program_start_date.toISOString().split('T')[0],
        cycle_length_weeks: formData.cycle_length_weeks,
        active: true,
      };

      let error;

      if (isEditing) {
        ({ error } = await supabase
          .from("locations")
          .update(locationData)
          .eq("id", location.id));
      } else {
        ({ error } = await supabase
          .from("locations")
          .insert([locationData]));
      }

      if (error) throw error;

      toast({
        title: "Success",
        description: `Location ${isEditing ? "updated" : "created"} successfully`,
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error saving location:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? "update" : "create"} location`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Location" : "New Location"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update location information and settings" : "Create a new program location"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="location-name">Location name *</Label>
            <Input
              id="location-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Downtown Campus"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization">Organization</Label>
            <Select 
              value={formData.organization_id} 
              onValueChange={(value) => setFormData({ ...formData, organization_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No organization</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone *</Label>
            <Select 
              value={formData.timezone} 
              onValueChange={(value) => setFormData({ ...formData, timezone: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Program start date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.program_start_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.program_start_date ? (
                    format(formData.program_start_date, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.program_start_date}
                  onSelect={(date) => date && setFormData({ ...formData, program_start_date: date })}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cycle-length">Cycle length (weeks) *</Label>
            <Input
              id="cycle-length"
              type="number"
              min="1"
              max="52"
              value={formData.cycle_length_weeks}
              onChange={(e) => setFormData({ ...formData, cycle_length_weeks: parseInt(e.target.value) || 6 })}
              required
            />
            <p className="text-sm text-muted-foreground">
              Number of weeks in each program cycle (typically 6)
            </p>
          </div>

          {isEditing && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-sm text-amber-800">
                <strong>Warning:</strong> Changing the program start date or cycle length may affect 
                existing weekly calculations and staff progress tracking.
              </p>
            </div>
          )}

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Location" : "Create Location"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}