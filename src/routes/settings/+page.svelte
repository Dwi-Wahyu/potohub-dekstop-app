<script lang="ts">
  import { goto } from '$app/navigation';
  import V1ConfigDashboard from '$lib/components/v1/V1ConfigDashboard.svelte';
  import { clearActivation } from '$lib/db/local';

  function handleBack() {
    goto('/');
  }

  async function handleLogout() {
    await clearActivation();
    await goto('/onboarding');
  }
</script>

<V1ConfigDashboard onBack={handleBack} onLogout={handleLogout} />
