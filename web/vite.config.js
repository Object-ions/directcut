import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In dev the API runs on :3456; proxy /media so ref thumbnails and the
  // gallery load from the same origin as the page.
  server: { proxy: { '/media': 'http://localhost:3456' } },
});
