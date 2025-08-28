import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Organization {
  id?: string;
  name: string;
}

interface OrganizationFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  organization: Organization | null;
}

export function OrganizationFormDrawer({ open, onClose, onSuccess, organization }: OrganizationFormDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
  });

  const isEditing = !!organization?.id;

  useEffect(() => {
    if (organization && open) {
      setFormData({
        name: organization.name,
      });
    } else if (open) {
      setFormData({
        name: "",
      });
    }
  }, [organization, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);

    try {
      // Generate slug from name
      const slug = formData.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      const organizationData = {
        name: formData.name.trim(),
        slug: slug,
        active: true,
      };

      let error;

      if (isEditing) {
        ({ error } = await supabase
          .from("organizations")
          .update(organizationData)
          .eq("id", organization.id));
      } else {
        ({ error } = await supabase
          .from("organizations")
          .insert([organizationData]));
      }

      if (error) throw error;

      toast({
        title: "Success",
        description: `Organization ${isEditing ? "updated" : "created"} successfully`,
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error saving organization:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? "update" : "create"} organization`,
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
          <SheetTitle>{isEditing ? "Edit Organization" : "New Organization"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update organization information" : "Create a new organization"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name *</Label>
            <Input
              id="org-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Acme Corporation"
              required
            />
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Organization" : "Create Organization"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}