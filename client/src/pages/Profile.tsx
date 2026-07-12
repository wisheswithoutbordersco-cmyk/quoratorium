/**
 * Q Workspace — User Profile Page
 * View and manage your profile settings
 */
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/_core/hooks/useAuth";
import { motion } from "framer-motion";
import { User, Mail, Calendar, Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { duration, ease } from "@/lib/motion";

export default function Profile() {
  const { user, logout } = useAuth();

  const profileFields = [
    { label: "Display Name", value: user?.name || "—", icon: User },
    { label: "Email", value: user?.email || "—", icon: Mail },
    { label: "Role", value: user?.role || "user", icon: Shield },
    { label: "Member Since", value: user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—", icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav />
      <main className="flex-1 p-6 md:p-8 max-w-3xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: ease.out }}
        >
          {/* Header */}
          <div className="flex items-center gap-5 mb-8">
            <Avatar className="h-20 w-20 border-2 border-primary/30">
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                {user?.name?.charAt(0).toUpperCase() || "Q"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">
                {user?.name || "User"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {user?.email || "No email set"}
              </p>
              <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                <Shield size={10} />
                {user?.role || "user"}
              </span>
            </div>
          </div>

          {/* Profile Fields */}
          <div className="space-y-1">
            <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-4">
              Account Details
            </h2>
            <div className="space-y-3">
              {profileFields.map((field) => {
                const Icon = field.icon;
                return (
                  <motion.div
                    key={field.label}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border surface-elevated"
                    whileHover={{ backgroundColor: "rgba(30, 30, 42, 0.4)" }}
                    transition={{ duration: 0.12 }}
                  >
                    <div className="w-9 h-9 rounded-md bg-primary/5 border border-primary/10 flex items-center justify-center">
                      <Icon size={16} className="text-primary/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
                        {field.label}
                      </p>
                      <p className="text-sm font-medium text-foreground mt-0.5 truncate">
                        {field.value}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Authentication Info */}
          <div className="mt-8 p-4 rounded-lg border border-border surface-elevated">
            <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-3">
              Authentication
            </h3>
            <p className="text-sm text-muted-foreground">
              You are signed in via <span className="text-foreground font-medium">Manus OAuth</span>. 
              Your session is managed automatically.
            </p>
          </div>

          {/* Sign Out */}
          <div className="mt-8 pt-6 border-t border-border">
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => logout()}
            >
              <LogOut size={14} className="mr-2" />
              Sign Out
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
