import 'dotenv/config'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const tanstackStartVirtualDepExcludes = [
  '@tanstack/react-start-client',
  '@tanstack/react-start-server',
  '@tanstack/start-client-core',
  '@tanstack/start-server-core',
]

const config = defineConfig({
  optimizeDeps: {
    exclude: tanstackStartVirtualDepExcludes,
  },
  environments: {
    ssr: {
      optimizeDeps: {
        exclude: tanstackStartVirtualDepExcludes,
      },
    },
  },
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
