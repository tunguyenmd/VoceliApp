import { PlanProvider } from "@/lib/client/PlanProvider";
import { PlannerShell } from "@/components/PlannerShell";

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlanProvider>
      <PlannerShell>{children}</PlannerShell>
    </PlanProvider>
  );
}
