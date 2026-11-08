import { NativeDateField } from '../../shared/forms/NativeDateField'
import { randomUUID } from 'expo-crypto'
import { useEffect, useRef, useState } from 'react'
import { Alert, Linking, Text, View } from 'react-native'
import { useApp } from '../../../application/providers'
import {
  useDomainQuery,
  useInvalidate,
  useOperation,
  type Resource,
} from '../../../application/queries'
import { ApiError, errorMessage } from '../../../domain/api-error'
import type {
  HabitAction,
  HabitKind,
  NewHabit,
  Scope,
  Unit,
} from '../../../domain/models'
import {
  affected,
  execute,
  operations,
  type Fields,
  type Operation,
} from './operations'
import { Button, Field, Result, Section } from './technical-ui'
import { styles } from './technical.styles'
export function AuthenticatedTools() {
  const { runtime, session, signOut, pauseQueries, resumeQueries } = useApp(),
    connector = runtime.connector
  const has = (scope: Scope) => session!.scopes.includes(scope)
  const [limit, setLimit] = useState('20'),
    [offset, setOffset] = useState('0'),
    [habitId, setHabitId] = useState('')
  const page = { limit: Number(limit), offset: Number(offset) },
    validPage =
      Number.isInteger(page.limit) &&
      page.limit >= 1 &&
      page.limit <= 100 &&
      Number.isInteger(page.offset) &&
      page.offset >= 0 &&
      page.offset <= 100000
  const dashboard = useDomainQuery(
    'dashboard',
    [],
    (c, o) => c.getDashboard(o),
    has('habits:read') && has('statistics:read'),
  )
  const habits = useDomainQuery(
    'habits',
    [page],
    (c, o) => c.listHabits(page, o),
    has('habits:read') && validPage,
  )
  const entries = useDomainQuery(
    'entries',
    [habitId, page],
    (c, o) => c.listEntries(habitId, page, o),
    !!habitId && has('entries:read') && validPage,
  )
  const mutation = useOperation(),
    invalidate = useInvalidate()
  const [mustReconnect, setMustReconnect] = useState(false)
  const [notice, setNotice] = useState(''),
    [name, setName] = useState(''),
    [kind, setKind] = useState<HabitKind>('boolean'),
    [unit, setUnit] = useState<Unit>('count'),
    [target, setTarget] = useState('1'),
    [timezone, setTimezone] = useState('Europe/Paris')
  const [value, setValue] = useState('1'),
    [occurredAt, setOccurredAt] = useState(''),
    [entryKey, setEntryKey] = useState(randomUUID)
  const actionKeys = useRef(new Map<string, string>())
  const [operation, setOperation] = useState<Operation>(operations[0]!),
    [fields, setFields] = useState<Fields>({
      id: '',
      date: new Date().toISOString().slice(0, 10),
      limit: '20',
      offset: '0',
    }),
    [body, setBody] = useState(''),
    [key, setKey] = useState(randomUUID)
  const [result, setResult] = useState<unknown>(undefined),
    [reveal, setReveal] = useState(false),
    [busy, setBusy] = useState(false),
    [readRequest, setReadRequest] = useState<{
      operation: Operation
      fields: Fields
      sequence: number
    } | null>(null)
  const read = useDomainQuery(
    readRequest?.operation.resource ?? 'diagnostic',
    [readRequest],
    (c, o) =>
      execute(c, readRequest!.operation, readRequest!.fields, undefined, o),
    !!readRequest,
  )
  useEffect(() => {
    if (!operation.secretResult || result === undefined) return
    const timer = setTimeout(() => {
      setResult(undefined)
      setReveal(false)
    }, 60_000)
    return () => clearTimeout(timer)
  }, [operation, result])
  async function run(task: () => Promise<unknown>, resources: Resource[]) {
    setNotice('')
    try {
      await mutation.mutateAsync({ run: task, resources })
      return true
    } catch (error) {
      setNotice(errorMessage(error))
      return false
    }
  }
  async function action(id: string, action: HabitAction, amount?: number) {
    const intent = JSON.stringify([id, action, amount]),
      commandKey = actionKeys.current.get(intent) ?? randomUUID()
    actionKeys.current.set(intent, commandKey)
    if (
      await run(
        () =>
          connector.habitAction(
            id,
            { action, ...(amount === undefined ? {} : { value: amount }) },
            { key: commandKey },
          ),
        affected('entries'),
      )
    )
      actionKeys.current.delete(intent)
  }
  async function perform() {
    setNotice('')
    setResult(undefined)
    setReveal(false)
    if (operation.read) {
      setReadRequest({ operation, fields: { ...fields }, sequence: Date.now() })
      return
    }
    let input: unknown
    try {
      input = operation.sensitive
        ? { token: body }
        : operation.body === undefined
          ? undefined
          : JSON.parse(body)
    } catch {
      setNotice('JSON invalide : corrigez les paramètres.')
      return
    }
    setBusy(true)
    try {
      const credentialChange = [
        'rotateToken',
        'revokeToken',
        'revokeServiceAccount',
      ].includes(operation.name)
      if (credentialChange) await pauseQueries()
      const task = () => execute(connector, operation, fields, input, { key })
      // Credentials never enter Query's mutation cache or variables.
      const output =
        operation.secretResult || operation.sensitive || credentialChange
          ? await task()
          : await mutation.mutateAsync({
              run: task,
              resources: affected(operation.resource),
            })
      if ((operation.secretResult || operation.sensitive) && !credentialChange)
        await invalidate(affected(operation.resource))
      setResult(output ?? { success: true })
      setKey(randomUUID())
      if (credentialChange && runtime.fake) resumeQueries()
      if (operation.sensitive) setBody('')
      if (operation.name === 'authorizeStrava' && !runtime.fake) {
        const url = new URL(
          (output as { authorization_url: string }).authorization_url,
        )
        if (url.protocol !== 'https:' || url.hostname !== 'www.strava.com')
          throw new ApiError('protocol_error', 'URL Strava inattendue.')
        await Linking.openURL(url.toString())
      }
      if (
        (operation.name === 'rotateToken' ||
          operation.name === 'revokeToken' ||
          operation.name === 'revokeServiceAccount') &&
        !runtime.fake
      ) {
        try {
          await runtime.verifyCurrentSession()
        } catch (error) {
          // A committed rotation must not lose its one-time secret on an inconclusive session check.
          setMustReconnect(true)
          setNotice(
            error instanceof ApiError && error.status === 401
              ? 'Votre accès a été révoqué ou remplacé. Conservez le secret émis puis reconnectez-vous.'
              : 'Action effectuée, mais vérification de session indisponible. Conservez le secret émis puis reconnectez-vous.',
          )
          return
        }
        resumeQueries()
        await invalidate(['tokens'])
      }
    } catch (error) {
      resumeQueries()
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  function select(op: Operation) {
    setOperation(op)
    setBody(
      op.sensitive
        ? ''
        : op.body === undefined
          ? ''
          : JSON.stringify(op.body, null, 2),
    )
    setResult(undefined)
    setReveal(false)
    setReadRequest(null)
    setKey(randomUUID())
    setNotice('')
  }
  const blocked = busy || mutation.isPending || mustReconnect
  return (
    <>
      {!!notice && (
        <Text accessibilityRole="alert" style={styles.error}>
          {notice}
        </Text>
      )}
      {mustReconnect && (
        <Button
          label="J’ai conservé le secret, me reconnecter"
          onPress={() => {
            resumeQueries()
            void signOut()
          }}
        />
      )}
      {runtime.fake && (
        <Section title="Démonstration">
          <Text style={styles.description}>
            Statistiques simplifiées au jour UTC courant. Les intégrations
            n’effectuent aucun appel externe.
          </Text>
          <Button
            label="Réinitialiser les données"
            onPress={() => {
              runtime.fake!.reset()
              setReadRequest(null)
              setResult(undefined)
              void invalidate([
                'habits',
                'entries',
                'dashboard',
                'statistics',
                'gamification',
                'tokens',
                'integrations',
                'jobs',
              ])
            }}
          />
          <View style={styles.row}>
            {[401, 403, 503].map((status) => (
              <Button
                key={status}
                label={`Simuler ${status}`}
                onPress={() => runtime.fake!.simulateError(status)}
              />
            ))}
          </View>
        </Section>
      )}
      <Section title="Dashboard">
        <Button
          label={dashboard.isFetching ? 'Actualisation…' : 'Actualiser'}
          onPress={() => {
            void invalidate(['dashboard', 'habits', 'entries'])
          }}
          disabled={dashboard.isFetching || blocked}
        />
        {dashboard.error && (
          <Text style={styles.error}>{errorMessage(dashboard.error)}</Text>
        )}
        {dashboard.data && (
          <>
            <Text style={styles.text}>
              {dashboard.data.global_percent === null
                ? 'Aucune habitude éligible'
                : `${Math.round(dashboard.data.global_percent)} %`}{' '}
              · {dashboard.data.gamification.xp} XP
            </Text>
            {dashboard.data.groups
              .flatMap((g) => g.habits)
              .map((item) => (
                <View key={item.habit.id} style={styles.item}>
                  <Text style={styles.label}>
                    {item.habit.name} · {item.progress} / {item.target}{' '}
                    {item.habit.unit}
                  </Text>
                  <View style={styles.row}>
                    {(item.habit.kind === 'boolean'
                      ? (['complete', 'uncomplete'] as const)
                      : (['increment', 'decrement'] as const)
                    ).map((a) => (
                      <Button
                        key={a}
                        label={
                          {
                            complete: 'Valider',
                            uncomplete: 'Décocher',
                            increment: 'Ajouter',
                            decrement: 'Retirer',
                          }[a]
                        }
                        disabled={
                          !has('entries:write') || !item.actionable || blocked
                        }
                        onPress={() => {
                          void action(item.habit.id, a)
                        }}
                      />
                    ))}
                    {(item.habit.kind === 'quantity' ||
                      item.habit.kind === 'duration') && (
                      <Button
                        label="Définir la valeur saisie"
                        disabled={
                          !has('entries:write') ||
                          !item.actionable ||
                          blocked ||
                          !Number.isFinite(Number(value)) ||
                          Number(value) < 0
                        }
                        onPress={() => {
                          void action(item.habit.id, 'set_value', Number(value))
                        }}
                      />
                    )}
                  </View>
                </View>
              ))}
          </>
        )}
      </Section>
      <Section title="Habitudes et saisies">
        <View style={styles.row}>
          <Field
            icon="quantity"
            label="Limite"
            value={limit}
            onChange={setLimit}
          />
          <Field
            icon="offset"
            label="Décalage"
            value={offset}
            onChange={setOffset}
          />
        </View>
        {!validPage && (
          <Text style={styles.error}>
            Limite : 1 à 100 ; décalage : 0 à 100000.
          </Text>
        )}
        {habits.error && (
          <Text style={styles.error}>{errorMessage(habits.error)}</Text>
        )}
        {habits.isFetching && <Text>Chargement des habitudes…</Text>}
        {habits.data?.items.length === 0 && (
          <Text>Aucune habitude. Créez la première ci-dessous.</Text>
        )}
        {habits.data?.items.map((h) => (
          <View key={h.id} style={styles.item}>
            <Text style={styles.label}>{h.name}</Text>
            <Text selectable style={styles.description}>
              {h.id}
            </Text>
            <Button
              label={
                habitId === h.id
                  ? 'Habitude sélectionnée'
                  : 'Sélectionner pour une saisie'
              }
              onPress={() => {
                setHabitId(h.id)
                setEntryKey(randomUUID())
                setOccurredAt('')
                setFields((f) => ({ ...f, id: h.id }))
              }}
              disabled={blocked}
            />
          </View>
        ))}
        <View style={styles.row}>
          <Button
            label="Page précédente"
            disabled={page.offset === 0 || !validPage}
            onPress={() =>
              setOffset(String(Math.max(0, page.offset - page.limit)))
            }
          />
          <Button
            label="Page suivante"
            disabled={
              !validPage ||
              !habits.data ||
              habits.data.items.length < page.limit
            }
            onPress={() => setOffset(String(page.offset + page.limit))}
          />
        </View>
        <Field
          icon="id"
          label="ID de l’habitude"
          value={habitId}
          onChange={(v) => {
            setHabitId(v)
            setEntryKey(randomUUID())
            setOccurredAt('')
          }}
        />
        <Field
          icon="quantity"
          label="Valeur de saisie / valeur dashboard"
          value={value}
          onChange={(v) => {
            setValue(v)
            setEntryKey(randomUUID())
            setOccurredAt('')
          }}
        />
        <NativeDateField
          instant
          label="Date et heure de la saisie (UTC)"
          hint="Sans modification : instant du premier envoi."
          value={occurredAt}
          onChange={(v) => {
            setOccurredAt(v)
            setEntryKey(randomUUID())
          }}
        />
        <Button
          label="Enregistrer la saisie"
          disabled={!has('entries:write') || !habitId || blocked}
          onPress={() => {
            const instant = occurredAt || new Date().toISOString()
            setOccurredAt(instant)
            void run(
              () =>
                connector.recordEntry(
                  habitId,
                  { value: Number(value), occurred_at: instant },
                  { key: entryKey },
                ),
              affected('entries'),
            ).then((ok) => {
              if (ok) {
                setEntryKey(randomUUID())
                setOccurredAt('')
              }
            })
          }}
        />
        {entries.error && (
          <Text style={styles.error}>{errorMessage(entries.error)}</Text>
        )}
        {entries.data && <Result value={entries.data} />}
      </Section>
      {has('habits:write') && (
        <Section title="Créer une habitude">
          <Field label="Nom" value={name} onChange={setName} />
          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {(['boolean', 'quantity', 'duration', 'frequency'] as const).map(
              (k) => (
                <Button
                  key={k}
                  label={kind === k ? `${k} · sélectionné` : k}
                  onPress={() => {
                    setKind(k)
                    setUnit(k === 'duration' ? 'seconds' : 'count')
                    setTarget('1')
                  }}
                />
              ),
            )}
          </View>
          <Text style={styles.label}>Unité</Text>
          <View style={styles.row}>
            {(['count', 'meters', 'seconds', 'milliliters'] as const).map(
              (u) => (
                <Button
                  key={u}
                  label={unit === u ? `${u} · sélectionné` : u}
                  onPress={() => setUnit(u)}
                />
              ),
            )}
          </View>
          <Field
            icon="target"
            label="Objectif"
            value={target}
            onChange={setTarget}
          />
          <Field
            icon="globe"
            label="Fuseau IANA"
            value={timezone}
            onChange={setTimezone}
          />
          <Button
            label="Créer l’habitude"
            disabled={blocked || !name.trim()}
            onPress={() => {
              const input: NewHabit = {
                name,
                kind,
                unit,
                target: Number(target),
                timezone,
              }
              void run(
                () => connector.createHabit(input),
                affected('habits'),
              ).then((ok) => {
                if (ok) setName('')
              })
            }}
          />
        </Section>
      )}
      <Section title="Opérations avancées">
        {[...new Set(operations.map((op) => op.group))].map((group) => (
          <View key={group} style={styles.item}>
            <Text style={styles.label}>{group}</Text>
            <View style={styles.row}>
              {operations
                .filter(
                  (op) => op.group === group && (!op.scope || has(op.scope)),
                )
                .map((op) => (
                  <Button
                    key={op.name}
                    label={op.label}
                    onPress={() => select(op)}
                    disabled={blocked}
                  />
                ))}
            </View>
          </View>
        ))}
        <Text style={styles.heading}>{operation.label}</Text>
        {operation.fields?.includes('id') && (
          <Field
            icon="id"
            label="ID de la ressource"
            value={fields.id}
            onChange={(id) => {
              setFields((f) => ({ ...f, id }))
              setKey(randomUUID())
            }}
          />
        )}
        {operation.fields?.includes('date') && (
          <NativeDateField
            label="Date"
            value={fields.date}
            onChange={(date) => {
              setFields((f) => ({ ...f, date }))
              setKey(randomUUID())
            }}
          />
        )}
        {operation.read && (
          <View style={styles.row}>
            <Field
              icon="quantity"
              label="Limite avancée"
              value={fields.limit}
              onChange={(limit) => setFields((f) => ({ ...f, limit }))}
            />
            <Field
              icon="offset"
              label="Décalage avancé"
              value={fields.offset}
              onChange={(offset) => setFields((f) => ({ ...f, offset }))}
            />
          </View>
        )}
        {operation.body !== undefined && (
          <Field
            label={
              operation.sensitive ? 'Token Home Assistant' : 'Paramètres JSON'
            }
            value={body}
            onChange={(v) => {
              setBody(v)
              setKey(randomUUID())
            }}
            multiline={!operation.sensitive}
            secret={operation.sensitive}
          />
        )}
        {operation.keyed && (
          <>
            <Text style={styles.description}>
              Clé conservée en cas de réponse incertaine : {key}
            </Text>
            <Button
              label="Commencer une nouvelle intention"
              onPress={() => setKey(randomUUID())}
              disabled={blocked}
            />
          </>
        )}
        <Button
          label={busy || read.isFetching ? 'En cours…' : 'Exécuter'}
          disabled={
            blocked ||
            read.isFetching ||
            (!!operation.scope && !has(operation.scope))
          }
          onPress={() => {
            if (operation.confirm)
              Alert.alert(
                operation.label,
                'Confirmer cette action sur la ressource indiquée ?',
                [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Confirmer',
                    style: 'destructive',
                    onPress: () => {
                      void perform()
                    },
                  },
                ],
              )
            else void perform()
          }}
        />
        {read.error && (
          <Text style={styles.error}>{errorMessage(read.error)}</Text>
        )}
        {read.data !== undefined && <Result value={read.data} />}
        {result !== undefined && (
          <>
            {operation.secretResult ? (
              <>
                <Text style={styles.description}>
                  Secret disponible pendant 60 secondes. Conservez-le avant de
                  fermer ce résultat.
                </Text>
                <Button
                  label={
                    reveal ? 'Masquer le secret' : 'Afficher le secret émis'
                  }
                  onPress={() => setReveal(!reveal)}
                />
                {reveal && <Result value={result} />}
              </>
            ) : (
              <Result value={result} />
            )}
            <Button
              label="Effacer le résultat"
              onPress={() => {
                setResult(undefined)
                setReveal(false)
              }}
            />
          </>
        )}
      </Section>
    </>
  )
}
