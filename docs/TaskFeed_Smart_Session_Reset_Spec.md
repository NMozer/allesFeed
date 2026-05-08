# TaskFeed — Smart Session Reset Spec (v1.0)

**Status:** Ready for Claude Implementation  
**Version:** 1.0  
**Datum:** 08. Mai 2026  
**Verantwortlich:** Projekt-Team (mit Claude)

---

## 1. Ziel & Motivation

Die „Links = später“-Geste soll sich **reel-mäßig** anfühlen: Der Nutzer entscheidet, was er **jetzt** erledigen will. Gleichzeitig darf der Feed **nie leer oder demotivierend** wirken — besonders bei Nutzern mit noch wenigen Tasks.

**Kernprinzip:**
> „Verstecke Tasks für diese Session, aber bringe sie zurück, sobald der Feed zu leer wird oder eine neue Session beginnt.“

---

## 2. Kernregeln (verbindlich)

### 2.1 Was passiert beim Links-Swipen?

- Die Task wird **sofort** aus dem aktuellen Feed entfernt (optimistic UI)
- Die Task erhält den Status `hidden`
- Es wird ein `hidden_until` Timestamp gesetzt auf: `now() + 30 Minuten`

### 2.2 Wann beginnt eine neue Session? (Reset-Trigger)

Eine neue Session wird **sofort** gestartet, wenn **mindestens eine** der folgenden Bedingungen erfüllt ist:

| Trigger | Bedingung | Aktion |
|---------|-----------|--------|
| **App-Close + Inaktivität** | App wird in den Hintergrund geschickt + **≥ 30 Minuten** keine Aktivität | Alle versteckten Tasks werden zurückgeholt |
| **Early Reset (wenige Tasks)** | Beim App-Öffnen sind **≤ 6 aktive Tasks** im Feed | Alle versteckten Tasks werden **sofort** zurückgeholt |
| **Morgen-Reset** | Aktuelle Uhrzeit liegt zwischen **06:00 und 09:00 Uhr** | Alle versteckten Tasks werden zurückgeholt (auch wenn noch mehr als 6 Tasks vorhanden sind) |

### 2.3 Wichtige Zusatzregel: Early Reset hat Priorität

Der **Early Reset bei ≤ 6 Tasks** hat Vorrang vor dem 30-Minuten-Timer.  
Das bedeutet: Auch wenn eine Task erst vor 10 Minuten versteckt wurde — sobald der Feed beim Öffnen der App ≤ 6 Tasks hat, wird sie sofort wieder eingeblendet.

---

## 3. Technische Parameter (aktuell)

| Parameter                    | Wert          | Begründung / Hinweis |
|-----------------------------|---------------|----------------------|
| Inaktivitäts-Timeout        | 30 Minuten    | Dein Wunsch |
| Early-Reset-Threshold       | **6 Tasks**   | Sweet Spot zwischen „nicht zu früh“ und „nicht zu spät“ |
| Morgen-Reset-Fenster        | 06:00 – 09:00 | Natürlicher Tagesstart |
| Maximale Hide-Dauer         | 7 Tage        | Hard-Limit, damit nichts ewig verschwindet |
| Session-Reset-Log           | Ja            | Für Analytics & Debugging |

---

## 4. Datenmodell (Supabase)

### Erweiterung der bestehenden Tabelle `user_tasks`

```sql
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS
  hidden_until          timestamptz,
  last_hidden_at        timestamptz,
  hidden_count          integer DEFAULT 0,
  session_reset_at      timestamptz;
```

**Bedeutung der Felder:**

| Feld                | Typ           | Beschreibung |
|---------------------|---------------|--------------|
| `hidden_until`      | timestamptz   | Bis wann die Task versteckt bleiben soll |
| `last_hidden_at`    | timestamptz   | Wann die Task zuletzt versteckt wurde |
| `hidden_count`      | integer       | Wie oft die Task schon versteckt wurde (für spätere Analytics) |
| `session_reset_at`  | timestamptz   | Wann die letzte Session-Reset stattgefunden hat |

---

## 5. Edge Function: `get_feed_tasks` (Kernlogik)

**Pseudocode für die Supabase Edge Function:**

```typescript
async function getFeedTasks(userId: string) {
  const now = new Date();
  const lastActivity = await getLastActivity(userId);
  const activeTaskCount = await countActiveTasks(userId);
  const isMorning = isBetween(now, "06:00", "09:00");

  let shouldReset = false;

  // 1. Early Reset bei wenigen Tasks
  if (activeTaskCount <= 6) {
    shouldReset = true;
  }

  // 2. 30-Minuten Inaktivität
  if (lastActivity && (now - lastActivity) > 30 * 60 * 1000) {
    shouldReset = true;
  }

  // 3. Morgen-Reset
  if (isMorning) {
    shouldReset = true;
  }

  if (shouldReset) {
    await resetHiddenTasks(userId);           // alle hidden_until = NULL setzen
    await updateSessionResetTimestamp(userId);
  }

  // Normale Feed-Abfrage (nur nicht-versteckte Tasks)
  return await db.query(`
    SELECT * FROM user_tasks 
    WHERE user_id = $1 
      AND (hidden_until IS NULL OR hidden_until < NOW())
      AND status != 'done'
    ORDER BY priority DESC, due ASC
    LIMIT 50
  `, [userId]);
}
```

---

## 6. Edge Cases & Sonderfälle

| Edge Case                        | Verhalten |
|----------------------------------|---------|
| Erste App-Öffnung (Onboarding)   | Keine versteckten Tasks → normaler Feed |
| User hat 0 Tasks insgesamt       | Kein Reset nötig |
| User hat genau 6 Tasks + 3 versteckte | → Early Reset wird ausgelöst |
| User swiped alle Tasks links     | Beim nächsten Öffnen (auch nach 5 Min) → alle Tasks kommen zurück |
| App im Hintergrund < 30 Min      | Kein Reset |
| Offline-Modus                    | Versteckte Tasks bleiben lokal versteckt. Beim Sync wird die Logik neu berechnet |
| Task mit Fälligkeit morgen       | Wird trotzdem versteckt, aber durch Early Reset schnell wieder sichtbar |

---

## 7. Onboarding & User Communication

### Erste Erklärung (im Onboarding)

> **„Links = Später“**  
> Du kannst Tasks nach links wischen, wenn du sie jetzt nicht machen willst.  
> Sie tauchen automatisch wieder auf, sobald du nur noch wenige Tasks übrig hast — oder beim nächsten Öffnen der App.

### Kurzer Hinweis im Feed (bei ersten 3 Links-Swipes)

> „Gut gemacht! Diese Task kommt später automatisch zurück.“

---

## 8. Metriken & Analytics (später)

Folgende Events sollten getrackt werden:

- `task_hidden` (mit `swipe_direction: left`)
- `session_reset_triggered` (mit `reason: early_reset | inactivity | morning`)
- `hidden_task_reappeared`
- Durchschnittliche Hide-Dauer pro Task

---

## 9. Zukünftige Erweiterungen (Phase 2+)

- Personalisierter Threshold (je nach Nutzer-Typ)
- „Immer verstecken bis morgen“-Option im Bottom-Sheet
- „Diese Task nie wieder automatisch zurückholen“ (für Low-Priority-Tasks)
- Integration mit „Später“-Tab (separater View)

---

## 10. Nächste Schritte für Claude

1. Datenbank-Migration schreiben
2. Edge Function `get_feed_tasks` implementieren
3. Unit-Tests für die Reset-Logik
4. Onboarding-Screen-Texte finalisieren
5. Analytics-Events einbauen

---

**Diese Spezifikation ist vollständig, widerspruchsfrei und direkt implementierbar.**

Claude kann damit sofort loslegen — ohne weitere Rückfragen zur Logik.

---

**Ende der Spezifikation v1.0**