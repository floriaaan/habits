import type { Resource } from '../../../application/queries'
import type { HabitsConnector, WriteOptions } from '../../../domain/connector'
import type * as M from '../../../domain/models'
export interface Fields {
  id: string
  date: string
  limit: string
  offset: string
}
export interface Operation {
  name: string
  label: string
  group: string
  read?: boolean
  scope?: M.Scope
  resource: Resource
  fields?: ('id' | 'date')[]
  body?: unknown
  keyed?: boolean
  sensitive?: boolean
  secretResult?: boolean
  confirm?: boolean
}
const habit = {
  name: 'Lecture',
  category: 'mind',
  kind: 'boolean',
  unit: 'count',
  target: 1,
  timezone: 'Europe/Paris',
}
export const operations: Operation[] = [
  {
    name: 'getHabit',
    label: 'Lire une habitude',
    group: 'Habitudes',
    read: true,
    scope: 'habits:read',
    resource: 'habits',
    fields: ['id'],
  },
  {
    name: 'setupHabit',
    label: 'Créer avec présentation',
    group: 'Habitudes',
    scope: 'habits:write',
    resource: 'habits',
    body: { habit, presentation: { step: 1 } },
    keyed: true,
  },
  {
    name: 'updateHabit',
    label: 'Programmer une modification',
    group: 'Habitudes',
    scope: 'habits:write',
    resource: 'habits',
    fields: ['id'],
    body: {
      effective_from: new Date(Date.now() + 86400000)
        .toISOString()
        .slice(0, 10),
      definition: habit,
    },
  },
  {
    name: 'archiveHabit',
    label: 'Archiver',
    group: 'Habitudes',
    scope: 'habits:write',
    resource: 'habits',
    fields: ['id'],
    confirm: true,
  },
  {
    name: 'getVersions',
    label: 'Versions',
    group: 'Habitudes',
    read: true,
    scope: 'habits:read',
    resource: 'habits',
    fields: ['id'],
  },
  {
    name: 'setPresentation',
    label: 'Modifier la présentation',
    group: 'Habitudes',
    scope: 'habits:write',
    resource: 'habits',
    fields: ['id'],
    body: {
      icon: null,
      color: null,
      order: 0,
      weight: 1,
      step: 1,
      illustration: 'plain',
      reminder_at: null,
    },
  },
  {
    name: 'getEntry',
    label: 'Lire une saisie',
    group: 'Saisies',
    read: true,
    scope: 'entries:read',
    resource: 'entries',
    fields: ['id'],
  },
  {
    name: 'correctEntry',
    label: 'Corriger une saisie',
    group: 'Saisies',
    scope: 'entries:write',
    resource: 'entries',
    fields: ['id'],
    keyed: true,
    body: { occurred_at: new Date().toISOString(), value: 1 },
  },
  {
    name: 'cancelEntry',
    label: 'Annuler une saisie',
    group: 'Saisies',
    scope: 'entries:write',
    resource: 'entries',
    fields: ['id'],
    keyed: true,
    confirm: true,
  },
  {
    name: 'getRests',
    label: 'Lister les repos',
    group: 'Statistiques',
    read: true,
    scope: 'habits:read',
    resource: 'habits',
    fields: ['id'],
  },
  {
    name: 'setRest',
    label: 'Ajouter un repos',
    group: 'Statistiques',
    scope: 'habits:write',
    resource: 'habits',
    fields: ['id', 'date'],
  },
  {
    name: 'removeRest',
    label: 'Retirer un repos',
    group: 'Statistiques',
    scope: 'habits:write',
    resource: 'habits',
    fields: ['id', 'date'],
  },
  {
    name: 'getStatistics',
    label: 'Statistiques d’une habitude',
    group: 'Statistiques',
    read: true,
    scope: 'statistics:read',
    resource: 'statistics',
    fields: ['id'],
  },
  {
    name: 'recalculate',
    label: 'Recalculer',
    group: 'Statistiques',
    scope: 'habits:write',
    resource: 'statistics',
    fields: ['id'],
  },
  {
    name: 'getGamification',
    label: 'Gamification',
    group: 'Statistiques',
    read: true,
    scope: 'statistics:read',
    resource: 'gamification',
  },
  {
    name: 'getLedger',
    label: 'Ledger XP',
    group: 'Statistiques',
    read: true,
    scope: 'statistics:read',
    resource: 'gamification',
  },
  {
    name: 'listTokens',
    label: 'Lister les tokens',
    group: 'Accès',
    read: true,
    scope: 'tokens:manage',
    resource: 'tokens',
  },
  {
    name: 'createToken',
    label: 'Émettre un token',
    group: 'Accès',
    scope: 'tokens:manage',
    resource: 'tokens',
    secretResult: true,
    body: {
      scopes: ['habits:read', 'entries:read', 'statistics:read'],
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      service_account_id: null,
    },
  },
  {
    name: 'rotateToken',
    label: 'Faire tourner un token',
    group: 'Accès',
    scope: 'tokens:manage',
    resource: 'tokens',
    fields: ['id'],
    secretResult: true,
    confirm: true,
  },
  {
    name: 'revokeToken',
    label: 'Révoquer un token',
    group: 'Accès',
    scope: 'tokens:manage',
    resource: 'tokens',
    fields: ['id'],
    confirm: true,
  },
  {
    name: 'createServiceAccount',
    label: 'Créer un compte de service',
    group: 'Accès',
    scope: 'tokens:manage',
    resource: 'tokens',
    body: { name: 'Home Assistant' },
  },
  {
    name: 'revokeServiceAccount',
    label: 'Révoquer un compte de service',
    group: 'Accès',
    scope: 'tokens:manage',
    resource: 'tokens',
    fields: ['id'],
    confirm: true,
  },
  {
    name: 'listIntegrations',
    label: 'Lister les intégrations',
    group: 'Intégrations',
    read: true,
    scope: 'integrations:manage',
    resource: 'integrations',
  },
  {
    name: 'connectHomeAssistant',
    label: 'Connecter Home Assistant',
    group: 'Intégrations',
    scope: 'integrations:manage',
    resource: 'integrations',
    sensitive: true,
    body: { token: '' },
  },
  {
    name: 'notifyHomeAssistant',
    label: 'Envoyer une notification HA',
    group: 'Intégrations',
    scope: 'notifications:write',
    resource: 'jobs',
    keyed: true,
    body: { title: 'Habits', message: 'Notification de test' },
  },
  {
    name: 'authorizeStrava',
    label: 'Connecter Strava',
    group: 'Intégrations',
    scope: 'integrations:manage',
    resource: 'integrations',
  },
  {
    name: 'setStravaMapping',
    label: 'Configurer le mapping Strava',
    group: 'Intégrations',
    scope: 'integrations:manage',
    resource: 'integrations',
    body: { sport: 'Run', habit_id: '', metric: 'distance' },
  },
  {
    name: 'syncStrava',
    label: 'Synchroniser Strava',
    group: 'Intégrations',
    scope: 'integrations:manage',
    resource: 'jobs',
    keyed: true,
  },
  {
    name: 'disconnectIntegration',
    label: 'Déconnecter une intégration',
    group: 'Intégrations',
    scope: 'integrations:manage',
    resource: 'integrations',
    fields: ['id'],
    confirm: true,
  },
  {
    name: 'getJob',
    label: 'Lire un job',
    group: 'Intégrations',
    read: true,
    scope: 'integrations:manage',
    resource: 'jobs',
    fields: ['id'],
  },
  {
    name: 'getVersion',
    label: 'Version du serveur',
    group: 'Diagnostic',
    read: true,
    resource: 'diagnostic',
  },
  {
    name: 'getOpenApi',
    label: 'Contrat OpenAPI',
    group: 'Diagnostic',
    read: true,
    resource: 'diagnostic',
  },
]
export function execute(
  c: HabitsConnector,
  operation: Operation,
  fields: Fields,
  input: unknown,
  options: WriteOptions,
): Promise<unknown> {
  const { id, date } = fields,
    page = { limit: Number(fields.limit), offset: Number(fields.offset) }
  switch (operation.name) {
    case 'getHabit':
      return c.getHabit(id, options)
    case 'setupHabit':
      return c.setupHabit(input as M.HabitSetup, options)
    case 'updateHabit':
      return c.updateHabit(id, input as M.HabitVersion, options)
    case 'archiveHabit':
      return c.archiveHabit(id, options)
    case 'getVersions':
      return c.getVersions(id, page, options)
    case 'setPresentation':
      return c.setPresentation(id, input as M.Presentation, options)
    case 'getEntry':
      return c.getEntry(id, options)
    case 'correctEntry':
      return c.correctEntry(id, input as M.NewEntry, options)
    case 'cancelEntry':
      return c.cancelEntry(id, options)
    case 'getRests':
      return c.getRests(id, page, options)
    case 'setRest':
      return c.setRest(id, date, options)
    case 'removeRest':
      return c.removeRest(id, date, options)
    case 'getStatistics':
      return c.getStatistics(id, options)
    case 'recalculate':
      return c.recalculate(id, options)
    case 'getGamification':
      return c.getGamification(options)
    case 'getLedger':
      return c.getLedger(page, options)
    case 'listTokens':
      return c.listTokens(page, options)
    case 'createToken':
      return c.createToken(input as M.NewToken, options)
    case 'rotateToken':
      return c.rotateToken(id, options)
    case 'revokeToken':
      return c.revokeToken(id, options)
    case 'createServiceAccount':
      return c.createServiceAccount(input as { name: string }, options)
    case 'revokeServiceAccount':
      return c.revokeServiceAccount(id, options)
    case 'listIntegrations':
      return c.listIntegrations(options)
    case 'connectHomeAssistant':
      return c.connectHomeAssistant(input as { token: string }, options)
    case 'notifyHomeAssistant':
      return c.notifyHomeAssistant(input as M.Notification, options)
    case 'authorizeStrava':
      return c.authorizeStrava(options)
    case 'setStravaMapping':
      return c.setStravaMapping(input as M.Mapping, options)
    case 'syncStrava':
      return c.syncStrava(options)
    case 'disconnectIntegration':
      return c.disconnectIntegration(id, options)
    case 'getJob':
      return c.getJob(id, options)
    case 'getVersion':
      return c.getVersion(options)
    case 'getOpenApi':
      return c.getOpenApi(options)
    default:
      throw new Error('Opération inconnue')
  }
}
export function affected(resource: Resource): Resource[] {
  return [
    'habits',
    'entries',
    'statistics',
    'gamification',
    'dashboard',
  ].includes(resource)
    ? ['habits', 'entries', 'statistics', 'gamification', 'dashboard']
    : resource === 'integrations' || resource === 'jobs'
      ? ['integrations', 'jobs']
      : [resource]
}
