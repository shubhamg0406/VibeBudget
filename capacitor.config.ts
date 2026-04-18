import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vibebudget.app",
  appName: "VibeBudget",
  webDir: "dist",
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
