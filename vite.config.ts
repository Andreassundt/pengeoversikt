import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow to "/<repo>/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: {
        name: 'Pengeoversikt',
        short_name: 'Penger',
        description: 'Privat økonomioversikt fra bankens CSV-eksport. Alt lagres lokalt på enheten.',
        lang: 'nb',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f766e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'files',
                accept: ['text/csv', '.csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
              },
            ],
          },
        },
      } as never,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  server: { port: 5178, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
