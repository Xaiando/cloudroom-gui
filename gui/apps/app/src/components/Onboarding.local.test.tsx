// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/hooks/queries/cloudroom-queries", () => ({
  useCloudroomAccount: () => ({
    isSuccess: true,
    isPending: false,
    data: { account: null, ready: false },
  }),
  useCloudroomSignIn: () => ({ mutate: signIn, isPending: false }),
  useMacAgents: () => ({ data: [] }),
  useSetMacAccess: () => ({ mutate: vi.fn() }),
  useSetCopyLogins: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/components/ClaudeConnection", () => ({
  useClaudeConnection: () => ({ data: { state: "disconnected" } }),
}));
vi.mock("@/hooks/queries/sidebar-navigation-query", () => ({
  useSidebarNavigation: () => ({ data: { projects: [] } }),
}));
vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: { generalSettings: { defaultProviderId: null } },
  }),
  useSystemProviders: () => ({ data: [] }),
}));
vi.mock("@/hooks/mutations/settings-mutations", () => ({
  useUpdateGeneralSettings: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/thread-creation-options/persisted-selection-fields", () => ({
  usePromptBoxProviderPreference: () => ({ setValue: vi.fn() }),
}));
vi.mock("@/lib/app-surface", () => ({
  fetchWithAppSurface: async () => new Response("{}"),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("continues locally without signing in and can reopen setup after dismissal", async () => {
  const { Onboarding, useOpenSetup } = await import("./Onboarding");
  function Reopen() {
    const open = useOpenSetup();
    return <button onClick={() => open(true)}>Reopen setup</button>;
  }
  render(
    <Provider store={createStore()}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Onboarding />
          <Reopen />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue locally" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Set up Cloudroom" }),
    ).toBeNull(),
  );
  expect(localStorage.getItem("cloudroom.setup.dismissed")).toBe("true");
  expect(signIn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reopen setup" }));
  expect(
    screen.getByRole("button", { name: "Sign in with browser" }),
  ).toBeTruthy();
});
