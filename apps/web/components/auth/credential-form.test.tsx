// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMessages } from "@/locales/auth";
import { CredentialForm } from "./credential-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const signInEmail = vi.fn();
const signUpEmail = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => signInEmail(...args) },
    signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
  },
}));

/**
 * `docs/design-system.md` §11.2 requires `data-invalid` on the field and
 * `aria-invalid` on the control, and §2.3 forbids expressing a state through colour
 * alone — so the assertions are on the accessible state and on text, not on classes.
 *
 * The auth client is the boundary being mocked (`.claude/rules/tdd.md` §6). What is
 * under test is the form: which requests it makes, which it refuses to make, and
 * what it tells the person in front of it.
 */
describe("credential form", () => {
  beforeEach(() => {
    push.mockReset();
    signInEmail.mockReset();
    signUpEmail.mockReset();
    signInEmail.mockResolvedValue({ data: {}, error: null });
    signUpEmail.mockResolvedValue({ data: {}, error: null });
  });

  it("signs in with the credentials that were typed", async () => {
    render(<CredentialForm copy={authMessages} mode="sign-in" />);

    await userEvent.type(screen.getByLabelText(authMessages.fields.email), "nia@plotpop.test");
    await userEvent.type(screen.getByLabelText(authMessages.fields.password), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: authMessages.signIn.submit }));

    expect(signInEmail).toHaveBeenCalledWith({
      email: "nia@plotpop.test",
      password: "a-long-password",
    });
    expect(push).toHaveBeenCalledWith("/");
  });

  it("marks the email field invalid and asks the api for nothing when the address is malformed", async () => {
    render(<CredentialForm copy={authMessages} mode="sign-in" />);

    await userEvent.type(screen.getByLabelText(authMessages.fields.email), "not-an-address");
    await userEvent.type(screen.getByLabelText(authMessages.fields.password), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: authMessages.signIn.submit }));

    expect(screen.getByLabelText(authMessages.fields.email)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText(authMessages.fieldErrors.email)).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  // The api enforces the same minimum; rejecting it here saves a round trip and a
  // failure message that would have to be less specific.
  it("refuses a password below the shared minimum length on sign up", async () => {
    render(<CredentialForm copy={authMessages} mode="sign-up" />);

    await userEvent.type(screen.getByLabelText(authMessages.fields.name), "Nia");
    await userEvent.type(screen.getByLabelText(authMessages.fields.email), "nia@plotpop.test");
    await userEvent.type(screen.getByLabelText(authMessages.fields.password), "tooshort");
    await userEvent.click(screen.getByRole("button", { name: authMessages.signUp.submit }));

    expect(screen.getByText(authMessages.fieldErrors.password)).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("sends the display name on sign up, which the workspace is named after", async () => {
    render(<CredentialForm copy={authMessages} mode="sign-up" />);

    await userEvent.type(screen.getByLabelText(authMessages.fields.name), "Nia");
    await userEvent.type(screen.getByLabelText(authMessages.fields.email), "nia@plotpop.test");
    await userEvent.type(screen.getByLabelText(authMessages.fields.password), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: authMessages.signUp.submit }));

    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Nia",
      email: "nia@plotpop.test",
      password: "a-long-password",
    });
  });

  it("reports a refused sign in without saying which half was wrong", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    render(<CredentialForm copy={authMessages} mode="sign-in" />);

    await userEvent.type(screen.getByLabelText(authMessages.fields.email), "nia@plotpop.test");
    await userEvent.type(screen.getByLabelText(authMessages.fields.password), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: authMessages.signIn.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(authMessages.signIn.failed);
    expect(push).not.toHaveBeenCalled();
  });

  it("names the one sign up failure the person can act on", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { code: "USER_ALREADY_EXISTS" } });
    render(<CredentialForm copy={authMessages} mode="sign-up" />);

    await userEvent.type(screen.getByLabelText(authMessages.fields.name), "Nia");
    await userEvent.type(screen.getByLabelText(authMessages.fields.email), "nia@plotpop.test");
    await userEvent.type(screen.getByLabelText(authMessages.fields.password), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: authMessages.signUp.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(authMessages.signUp.emailTaken);
  });

  it("offers the way to the other page", () => {
    render(<CredentialForm copy={authMessages} mode="sign-in" />);

    expect(screen.getByRole("link", { name: authMessages.signIn.switchAction })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });
});
