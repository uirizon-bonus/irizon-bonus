import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      server: {
        allowedHosts:['https://f64b-62-164-155-228.ngrok-free.app'],
        port: mode === 'portal' ? 3001 : 3000,
        host: true,
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
