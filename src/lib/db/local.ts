import Database from '@tauri-apps/plugin-sql';

export interface BoothActivation {
  boothId: string;
  activationCode: string;
  boothName: string;
  organizationId: string | null;
  templateVariant: 'v1' | 'v2' | 'v3';
  activatedAt: string;
}

let dbPromise: ReturnType<typeof Database.load> | null = null;
function db() {
  if (!dbPromise) dbPromise = Database.load('sqlite:booth.db');
  return dbPromise;
}

export async function getActivation(): Promise<BoothActivation | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>('SELECT * FROM booth_activation WHERE id = 1');
    if (!rows.length) return null;
    const r = rows[0];
    return {
      boothId: r.booth_id,
      activationCode: r.activation_code,
      boothName: r.booth_name,
      organizationId: r.organization_id,
      templateVariant: r.template_variant,
      activatedAt: r.activated_at
    };
  } catch (e) {
    console.warn('Failed to query SQLite booth_activation:', e);
    return null;
  }
}

export async function saveActivation(data: BoothActivation): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO booth_activation (id, booth_id, activation_code, booth_name, organization_id, template_variant, activated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       booth_id = $1, activation_code = $2, booth_name = $3,
       organization_id = $4, template_variant = $5, activated_at = $6`,
    [
      data.boothId,
      data.activationCode,
      data.boothName,
      data.organizationId,
      data.templateVariant,
      data.activatedAt
    ]
  );
}

export async function clearActivation(): Promise<void> {
  const conn = await db();
  await conn.execute('DELETE FROM booth_activation WHERE id = 1');
}
