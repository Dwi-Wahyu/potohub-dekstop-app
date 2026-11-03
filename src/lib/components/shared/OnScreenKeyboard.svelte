<script lang="ts">
  import { Delete, ArrowRight, Check, X, CornerDownLeft, Globe, Lock, Mail, Key } from '@lucide/svelte';

  interface Props {
    open: boolean;
    activeField: 'email' | 'password' | 'code' | 'ticket' | string;
    availableFields?: Array<{ id: 'email' | 'password' | 'code' | 'ticket' | string; label: string }>;
    onKeyPress: (key: string) => void;
    onSubmit: () => void;
    onClose: () => void;
    onSelectField?: (field: any) => void;
  }

  let {
    open,
    activeField,
    availableFields = [],
    onKeyPress,
    onSubmit,
    onClose,
    onSelectField
  }: Props = $props();

  let mode = $state<'letters' | 'symbols'>('letters');
  let capsLock = $state(false);

  const LETTERS_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'],
    ['?123', '@', 'SPACE', '.', 'ENTER']
  ];

  const SYMBOLS_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
    ['-', '_', '=', '+', '[', ']', '{', '}', ';', ':'],
    ['~', '`', '"', "'", '<', '>', ',', '/', 'BACKSPACE'],
    ['ABC', '\\', '|', 'SPACE', '?', 'ENTER']
  ];

  const EMAIL_QUICK_CHIPS = ['@gmail.com', '@yahoo.com', '.com', '.id', '@'];
  const CODE_QUICK_CHIPS = ['-', 'CLR'];

  function handleKey(key: string) {
    if (key === 'SHIFT') {
      capsLock = !capsLock;
      return;
    }
    if (key === '?123') {
      mode = 'symbols';
      return;
    }
    if (key === 'ABC') {
      mode = 'letters';
      return;
    }
    if (key === 'SPACE') {
      onKeyPress(' ');
      return;
    }
    if (key === 'BACKSPACE') {
      onKeyPress('BACKSPACE');
      return;
    }
    if (key === 'ENTER') {
      onSubmit();
      return;
    }

    if (mode === 'letters' && key.length === 1 && /[a-z]/i.test(key)) {
      onKeyPress(capsLock ? key.toUpperCase() : key.toLowerCase());
    } else {
      onKeyPress(key);
    }
  }

  function getFieldDisplayName(field: string): string {
    if (field === 'email') return 'Email';
    if (field === 'password') return 'Password';
    if (field === 'ticket') return 'Kode Tiket';
    if (field === 'code') return 'Kode Tiket / Aktivasi';
    return field;
  }
</script>

<!-- Outer Drawer Container -->
<div
  style="
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 999;
    transform: {open ? 'translateY(0)' : 'translateY(105%)'};
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 -12px 36px rgba(163, 177, 198, 0.45);
    background: #e9eff7;
    border-top: 1px solid rgba(255, 255, 255, 0.9);
    font-family: 'Poppins', sans-serif;
    user-select: none;
    touch-action: manipulation;
  "
>
  <!-- Top Bar: Field Switchers / Helpers / Close -->
  <div
    style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 18px;
      background: #dfe6f2;
      border-bottom: 1px solid rgba(200, 210, 224, 0.6);
      gap: 12px;
      overflow-x: auto;
    "
  >
    <!-- Field Switcher Pills -->
    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
      {#if availableFields.length > 0}
        {#each availableFields as f}
          <button
            type="button"
            onpointerdown={(e) => {
              e.preventDefault();
              onSelectField?.(f.id);
            }}
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 6px 14px;
              border-radius: 999px;
              border: none;
              font-family: 'Poppins', sans-serif;
              font-size: 0.76rem;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.15s ease;
              background: {activeField === f.id
                ? 'linear-gradient(135deg, #3d3aa0, #2a2873)'
                : '#e9eff7'};
              color: {activeField === f.id ? '#ffffff' : '#64748b'};
              box-shadow: {activeField === f.id
                ? '2px 2px 6px rgba(42,40,115,0.3)'
                : 'inset 2px 2px 4px #c8d2e0, inset -2px -2px 4px #ffffff'};
            "
          >
            {#if f.id === 'email'}
              <Mail size={13} />
            {:else if f.id === 'password'}
              <Lock size={13} />
            {:else}
              <Key size={13} />
            {/if}
            {f.label}
          </button>
        {/each}
      {:else}
        <span
          style="
            font-size: 0.75rem;
            font-weight: 700;
            color: #2a2873;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            display: flex;
            align-items: center;
            gap: 6px;
          "
        >
          {#if activeField === 'email'}
            <Mail size={14} />
          {:else if activeField === 'password'}
            <Lock size={14} />
          {:else}
            <Key size={14} />
          {/if}
          {getFieldDisplayName(activeField)}
        </span>
      {/if}
    </div>

    <!-- Quick Shortcuts / Domain Chips -->
    <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; flex: 1; justify-content: center;">
      {#if activeField === 'email'}
        {#each EMAIL_QUICK_CHIPS as chip}
          <button
            type="button"
            onpointerdown={(e) => {
              e.preventDefault();
              onKeyPress(chip);
            }}
            style="
              padding: 4px 10px;
              border-radius: 8px;
              background: #e9eff7;
              box-shadow: 2px 2px 4px #c8d2e0, -2px -2px 4px #ffffff;
              border: none;
              font-family: 'Poppins', sans-serif;
              font-size: 0.72rem;
              font-weight: 600;
              color: #3d3aa0;
              cursor: pointer;
              white-space: nowrap;
            "
          >
            {chip}
          </button>
        {/each}
      {:else if activeField === 'code' || activeField === 'ticket'}
        {#each CODE_QUICK_CHIPS as chip}
          <button
            type="button"
            onpointerdown={(e) => {
              e.preventDefault();
              if (chip === 'CLR') onKeyPress('CLEAR');
              else onKeyPress(chip);
            }}
            style="
              padding: 4px 12px;
              border-radius: 8px;
              background: #e9eff7;
              box-shadow: 2px 2px 4px #c8d2e0, -2px -2px 4px #ffffff;
              border: none;
              font-family: 'Poppins', sans-serif;
              font-size: 0.72rem;
              font-weight: 700;
              color: {chip === 'CLR' ? '#dc2626' : '#2a2873'};
              cursor: pointer;
              white-space: nowrap;
            "
          >
            {chip === 'CLR' ? 'Hapus Semua' : chip}
          </button>
        {/each}
      {:else}
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            onKeyPress('CLEAR');
          }}
          style="
            padding: 4px 12px;
            border-radius: 8px;
            background: #e9eff7;
            box-shadow: 2px 2px 4px #c8d2e0, -2px -2px 4px #ffffff;
            border: none;
            font-family: 'Poppins', sans-serif;
            font-size: 0.72rem;
            font-weight: 700;
            color: #dc2626;
            cursor: pointer;
          "
        >
          Hapus Semua
        </button>
      {/if}
    </div>

    <!-- Close Keyboard Button -->
    <button
      type="button"
      onpointerdown={(e) => {
        e.preventDefault();
        onClose();
      }}
      title="Tutup Keyboard"
      style="
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 12px;
        border-radius: 10px;
        background: #e9eff7;
        box-shadow: 2px 2px 5px #c8d2e0, -2px -2px 5px #ffffff;
        border: none;
        cursor: pointer;
        color: #64748b;
        font-family: 'Poppins', sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        flex-shrink: 0;
      "
    >
      <X size={14} />
      <span>Tutup</span>
    </button>
  </div>

  <!-- Keyboard Keypad Body -->
  <div
    style="
      max-width: 920px;
      margin: 0 auto;
      padding: 10px 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    "
  >
    {#each (mode === 'letters' ? LETTERS_ROWS : SYMBOLS_ROWS) as row, rowIndex}
      <div
        style="
          display: flex;
          justify-content: center;
          gap: 6px;
          width: 100%;
        "
      >
        {#each row as key}
          {@const isShift = key === 'SHIFT'}
          {@const isBackspace = key === 'BACKSPACE'}
          {@const isEnter = key === 'ENTER'}
          {@const isSpace = key === 'SPACE'}
          {@const isModeSwitch = key === '?123' || key === 'ABC'}

          <button
            type="button"
            onpointerdown={(e) => {
              e.preventDefault();
              handleKey(key);
            }}
            style="
              height: 48px;
              border-radius: 12px;
              border: none;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: 'Poppins', sans-serif;
              font-size: {isShift || isBackspace || isModeSwitch ? '0.82rem' : isEnter ? '0.86rem' : '1.05rem'};
              font-weight: {isEnter || isShift || isModeSwitch ? 800 : 600};
              transition: all 0.08s ease;
              box-sizing: border-box;

              /* Width & Flex sizing */
              flex: {
                isSpace ? '4 1 0%' :
                isEnter ? '2.4 1 0%' :
                isShift || isBackspace ? '1.6 1 0%' :
                isModeSwitch ? '1.5 1 0%' :
                '1 1 0%'
              };
              max-width: {
                isSpace ? '340px' :
                isEnter ? '180px' :
                isShift || isBackspace ? '120px' :
                '80px'
              };

              /* Neumorphic / Highlight Background & Shadows */
              background: {
                isEnter
                  ? 'linear-gradient(135deg, #3d3aa0, #2a2873)'
                  : isShift && capsLock
                  ? 'linear-gradient(135deg, #3d3aa0, #2a2873)'
                  : isShift || isBackspace || isModeSwitch
                  ? '#dfe6f2'
                  : '#ebf0f7'
              };
              color: {
                isEnter || (isShift && capsLock)
                  ? '#ffffff'
                  : isShift || isBackspace || isModeSwitch
                  ? '#334155'
                  : '#2a2873'
              };
              box-shadow: {
                isEnter
                  ? '3px 3px 8px rgba(42,40,115,0.35)'
                  : isShift && capsLock
                  ? 'inset 2px 2px 5px rgba(0,0,0,0.3)'
                  : '3px 3px 6px #c8d2e0, -3px -3px 6px #ffffff'
              };
            "
          >
            {#if isShift}
              <span style="display: flex; align-items: center; gap: 4px;">
                ⇧ {capsLock ? 'CAPS' : 'Shift'}
              </span>
            {:else if isBackspace}
              <Delete size={20} />
            {:else if isEnter}
              <span style="display: flex; align-items: center; gap: 6px; letter-spacing: 0.04em;">
                {#if activeField === 'email'}
                  <span>Lanjut</span>
                  <ArrowRight size={16} />
                {:else if activeField === 'password'}
                  <span>Login</span>
                  <Check size={16} />
                {:else}
                  <span>Aktivasi</span>
                  <Check size={16} />
                {/if}
              </span>
            {:else if isSpace}
              <span style="font-size: 0.78rem; font-weight: 600; color: #7c8faa; letter-spacing: 0.15em; text-transform: uppercase;">
                Spasi
              </span>
            {:else if isModeSwitch}
              <span>{key}</span>
            {:else}
              <span>{capsLock && mode === 'letters' && key.length === 1 ? key.toUpperCase() : key}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>
