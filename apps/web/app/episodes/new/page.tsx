import { AppShell } from "@/components/app-shell";
import { CreationWizard } from "@/components/creation-wizard";
import { prototypeCreditEstimate } from "@/lib/prototype-estimate";

export default function NewEpisodePage() {
  return (
    <AppShell>
      <CreationWizard estimate={prototypeCreditEstimate} />
    </AppShell>
  );
}
