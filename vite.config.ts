import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 50,
              },
              {
                name: 'vendor-d3',
                test: /node_modules[\\/](d3|d3-.*|internmap)[\\/]/,
                priority: 45,
              },
              {
                name: 'vendor-recharts',
                test: /node_modules[\\/](recharts|victory-vendor|recharts-scale)[\\/]/,
                priority: 45,
              },
              {
                name: 'vendor-jspdf',
                test: /node_modules[\\/]jspdf[\\/]/,
                priority: 45,
                maxSize: 400 * 1024,
              },
              {
                name: 'vendor-html2canvas',
                test: /node_modules[\\/]html2canvas[\\/]/,
                priority: 45,
              },
              {
                name: 'vendor-pdf-helpers',
                test: /node_modules[\\/](canvg|dompurify|rgbcolor|stackblur-canvas|fflate|svg-pathdata)[\\/]/,
                priority: 44,
              },
              {
                name: 'vendor-mammoth',
                test: /node_modules[\\/](mammoth|jszip|xml2js|lop)[\\/]/,
                priority: 40,
              },
              {
                name: 'vendor-markdown',
                test: /node_modules[\\/](react-markdown|remark-.*|rehype-.*|unified|micromark.*|mdast-.*|hast-.*|unist-.*|vfile.*)[\\/]/,
                priority: 40,
              },
              {
                name: 'vendor-firebase-firestore',
                test: /node_modules[\\/]@firebase[\\/]firestore/,
                priority: 40,
                maxSize: 400 * 1024,
              },
              {
                name: 'vendor-firebase-auth',
                test: /node_modules[\\/]@firebase[\\/]auth/,
                priority: 40,
              },
              {
                name: 'vendor-firebase-core',
                test: /node_modules[\\/](firebase|@firebase)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-motion',
                test: /node_modules[\\/](motion|framer-motion)[\\/]/,
                priority: 35,
              },
              {
                name: 'vendor-icons',
                test: /node_modules[\\/]lucide-react[\\/]/,
                priority: 35,
              },
              {
                name: 'vendor-misc',
                test: /node_modules[\\/]/,
                priority: 10,
                maxSize: 380 * 1024,
              },
            ],
          },
        },
      },
    },
  };
});
