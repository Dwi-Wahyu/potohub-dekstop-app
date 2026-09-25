<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import ConfigDashboard from '$lib/components/shared/ConfigDashboard.svelte';
  import { clearActivation, getActivation } from '$lib/db/local';
  import { setWindowDecorations } from '$lib/utils/windowControl';

  onMount(() => {
    void setWindowDecorations(true);
  });

  async function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      const activation = await getActivation();
      if (activation?.boothId) {
        await goto('/?journey=1');
      } else {
        await goto('/onboarding');
      }
    }
  }

  async function handleLogout() {
    await clearActivation();
    await goto('/onboarding');
  }
</script>

<ConfigDashboard onBack={handleBack} onLogout={handleLogout} />
