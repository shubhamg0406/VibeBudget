import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vibebudget.app",
  appName: "VibeBudget",
  webDir: "dist",
  backgroundColor: "#1E4D8C",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1E4D8C",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
  },
};

export default config;
