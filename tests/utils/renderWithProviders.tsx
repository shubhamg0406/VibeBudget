import React from "react";
import { render } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import { FirebaseContext, type FirebaseContextType } from "../../src/contexts/SupabaseContext";
import { createMockSupabaseValue, type MockSupabaseSeed } from "../../src/testing/mockSupabase";

interface ExtendedOptions extends Omit<RenderOptions, "wrapper"> {
  firebase?: Partial<FirebaseContextType>;
  seed?: MockSupabaseSeed;
}

export const renderWithProviders = (
  ui: React.ReactElement,
  { firebase, seed, ...options }: ExtendedOptions = {},
) => {
  const value = {
    ...createMockSupabaseValue(seed),
    ...firebase,
  };

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    firebase: value,
  };
};
