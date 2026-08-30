<script lang="ts">
  import { goto } from '$app/navigation';
  import ConfigDashboard from '$lib/components/shared/ConfigDashboard.svelte';
  import { clearActivation } from '$lib/db/local';

  function handleBack() {
    goto('/');
  }

  async function handleLogout() {
    await clearActivation();
    await goto('/onboarding');
  }
</script>

<ConfigDashboard onBack={handleBack} onLogout={handleLogout} />
