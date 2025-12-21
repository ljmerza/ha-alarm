export function formatEntitiesSyncNotice(result: { imported: number; updated: number }): string {
  return `Synced entities (imported ${result.imported}, updated ${result.updated}).`
}

export function formatRulesRunNotice(result: {
  evaluated: number
  fired: number
  scheduled: number
  skippedCooldown: number
  errors: number
}): string {
  return `Rules run: evaluated ${result.evaluated}, fired ${result.fired}, scheduled ${result.scheduled}, cooldown ${result.skippedCooldown}, errors ${result.errors}.`
}

