<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import ConfigDashboard from '$lib/components/shared/ConfigDashboard.svelte';
  import { clearActivation } from '$lib/db/local';
  import { setWindowDecorations } from '$lib/utils/windowControl';

  onMount(() => {
    void setWindowDecorations(true);
  });

  function handleBack() {
    goto('/onboarding?step=destination');
  }

  async function handleLogout() {
    await clearActivation();
    await goto('/onboarding');
  }
</script>

<ConfigDashboard onBack={handleBack} onLogout={handleLogout} />
