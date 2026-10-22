import { defineConfig } from 'vite';
export default defineConfig({root:'ticket-tear',publicDir:'../public',server:{host:'127.0.0.1',port:5173},build:{outDir:'../dist-ticket',emptyOutDir:true,rollupOptions:{output:{manualChunks:{three:['three'],react:['react','react-dom/client']}}}}});
