import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Search, MoreHorizontal, Edit, Key, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InviteUserDialog } from "./InviteUserDialog";
import { EditUserDrawer } from "./EditUserDrawer";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface User {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  staff_id?: string;
  name?: string;
  role_id?: number;
  role_name?: string;
  primary_location_id?: string;
  location_name?: string;
  is_super_admin: boolean;
}

interface Role {
  role_id: number;
  role_name: string;
}

interface Location {
  id: string;
  name: string;
}

export function AdminUsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [superAdminFilter, setSuperAdminFilter] = useState<string>("all");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 25;

  const loadUsers = async (page = 1, search = searchTerm) => {
    try {
      setLoading(true);
      
      // Call the admin-users edge function with query parameters
      const searchParams = new URLSearchParams({
        search,
        page: page.toString(),
        limit: usersPerPage.toString(),
      });
      
      const { data, error } = await supabase.functions.invoke(`admin-users?${searchParams.toString()}`, {
        method: 'GET',
      });

      if (error) throw error;

      setUsers(data.users || []);
      setTotalUsers(data.total || 0);
      setCurrentPage(page);
    } catch (error) {
      console.error("Error loading users:", error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRolesAndLocations = async () => {
    try {
      const [rolesResult, locationsResult] = await Promise.all([
        supabase.from("roles").select("role_id, role_name").order("role_name"),
        supabase.from("locations").select("id, name").eq("active", true).order("name"),
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (locationsResult.error) throw locationsResult.error;

      setRoles(rolesResult.data || []);
      setLocations(locationsResult.data || []);
    } catch (error) {
      console.error("Error loading roles and locations:", error);
    }
  };

  useEffect(() => {
    loadUsers();
    loadRolesAndLocations();
  }, []);

  const handleSearch = () => {
    loadUsers(1, searchTerm);
  };

  const handleInviteSuccess = () => {
    setInviteDialogOpen(false);
    loadUsers();
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditDrawerOpen(true);
  };

  const handleEditSuccess = () => {
    setEditDrawerOpen(false);
    setSelectedUser(null);
    loadUsers();
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { 
          action: 'delete_user',
          user_id: userToDelete.user_id 
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "User deleted successfully",
      });

      setDeleteDialogOpen(false);
      setUserToDelete(null);
      loadUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = async (user: User) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { 
          action: 'reset_link',
          user_id: user.user_id 
        },
      });

      if (error) throw error;

      // Copy to clipboard
      await navigator.clipboard.writeText(data.link);
      
      toast({
        title: "Success",
        description: "Password reset link copied to clipboard",
      });
    } catch (error) {
      console.error("Error generating reset link:", error);
      toast({
        title: "Error",
        description: "Failed to generate reset link",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesRole = roleFilter === "all" || !roleFilter || user.role_id?.toString() === roleFilter;
    const matchesLocation = locationFilter === "all" || !locationFilter || user.primary_location_id === locationFilter;
    const matchesSuperAdmin = superAdminFilter === "all" || !superAdminFilter || 
      (superAdminFilter === "true" && user.is_super_admin) ||
      (superAdminFilter === "false" && !user.is_super_admin);
    
    return matchesRole && matchesLocation && matchesSuperAdmin;
  });

  const getStatusBadge = (user: User) => {
    if (!user.email_confirmed_at) {
      return <Badge variant="secondary">Invited</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-4">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </div>
            <Button onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite teammate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
            <div className="flex flex-1 space-x-2">
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} variant="outline">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.role_id} value={role.role_id.toString()}>
                    {role.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={superAdminFilter} onValueChange={setSuperAdminFilter}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Filter admin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="true">Super admins</SelectItem>
                <SelectItem value="false">Regular users</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">
                        {user.name || "No name"}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.role_name || "No role"}</TableCell>
                      <TableCell>{user.location_name || "No location"}</TableCell>
                      <TableCell>
                        {user.is_super_admin && (
                          <Badge variant="destructive">Super Admin</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(user)}</TableCell>
                      <TableCell>{formatDate(user.last_sign_in_at)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                              <Key className="h-4 w-4 mr-2" />
                              Reset password
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteUser(user)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalUsers > usersPerPage && (
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min((currentPage - 1) * usersPerPage + 1, totalUsers)} to{" "}
                {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => loadUsers(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage * usersPerPage >= totalUsers}
                  onClick={() => loadUsers(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <InviteUserDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onSuccess={handleInviteSuccess}
        roles={roles}
        locations={locations}
      />

      <EditUserDrawer
        open={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={handleEditSuccess}
        user={selectedUser}
        roles={roles}
        locations={locations}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.name}? This action cannot be undone and will:
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Remove their user account permanently</li>
                <li>Delete all their associated data (scores, evaluations, etc.)</li>
                <li>Revoke access to the system immediately</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}