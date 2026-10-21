-- A first successful contact can start service without an intermediate failed attempt.
-- Preserve every other configured transition and all interaction history.
UPDATE "stages"
SET "allowedFrom" = array_append("allowedFrom", 'new')
WHERE "id" = 'active' AND NOT ('new' = ANY("allowedFrom"));
