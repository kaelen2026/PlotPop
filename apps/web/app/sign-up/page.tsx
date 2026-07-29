import type { Metadata } from "next";
import { CredentialForm } from "@/components/auth/credential-form";
import { messages } from "@/locales/en";

export const metadata: Metadata = {
  title: `${messages.auth.signUp.title} · PlotPop`,
};

export default function SignUpPage() {
  return <CredentialForm copy={messages.auth} mode="sign-up" />;
}
