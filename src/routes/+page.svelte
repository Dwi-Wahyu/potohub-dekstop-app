<script lang="ts">
  import { cameraStore } from "$lib/camera.svelte";
</script>

<main class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-4">
  <h1 class="text-2xl font-semibold">Photobooth</h1>
  <p class="text-neutral-400">
    Status kamera: <span class="font-mono">{cameraStore.status}</span>
  </p>
  <a href="/camera-config" class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">
    Pengaturan Kamera
  </a>
  <a
    href="/session"
    class="px-4 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
  >
    Mulai Sesi Foto
  </a>
</main>
