import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.irizon.bonus',
  appName: 'IRIZON BONUS',
  webDir: 'irizon-mobile-ui/dist',
  // Required by @capacitor-firebase/messaging to avoid a SwiftPM package
  // identity collision with the Firebase iOS SDK.
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
};

export default config;
