import React from "react";
import { render } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import { FirebaseContext, type FirebaseContextType } from "../../src/contexts/FirebaseContext";
import { createMockFirebaseValue, type MockFirebaseSeed } from "../../src/testing/mockFirebase";

interface ExtendedOptions extends Omit<RenderOptions, "wrapper"> {
  firebase?: Partial<FirebaseContextType>;
  seed?: MockFirebaseSeed;
}

export const renderWithProviders = (
  ui: React.ReactElement,
  { firebase, seed, ...options }: ExtendedOptions = {},
) => {
  const value = {
    ...createMockFirebaseValue(seed),
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
