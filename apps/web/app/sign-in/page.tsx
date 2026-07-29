import type { Metadata } from "next";
import { CredentialForm } from "@/components/auth/credential-form";
import { messages } from "@/locales/en";

export const metadata: Metadata = {
  title: `${messages.auth.signIn.title} · PlotPop`,
};

export default function SignInPage() {
  return <CredentialForm copy={messages.auth} mode="sign-in" />;
}
