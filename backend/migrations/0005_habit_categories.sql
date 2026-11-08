-- Keep the existing JSON definitions and their history; only fill the new field.
UPDATE habits
SET definition = json_set(definition, '$.category', 'daily')
WHERE json_type(definition, '$.category') IS NULL;

UPDATE habit_versions
SET definition = json_set(definition, '$.category', 'daily')
WHERE json_type(definition, '$.category') IS NULL;
