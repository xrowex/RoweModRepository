-- Slot = which clothing/body category this mod targets
-- Allowed (app-level): Body, Bottoms, Bust, Eyes, Gloves, Hair, Hat, Shoes, Socks, Top, Presets

ALTER TABLE mods ADD COLUMN slot TEXT;           -- nullable for now
CREATE INDEX IF NOT EXISTS idx_mods_slot ON mods(slot);
