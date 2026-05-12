import { useContext } from "react";
import { FirebaseContext, SupabaseProvider as FirebaseProvider } from "./SupabaseContext";
import type { FirebaseContextType } from "./SupabaseContext";

export { FirebaseContext, FirebaseProvider };
export type { FirebaseContextType };

export const useFirebase = (): FirebaseContextType => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
};
