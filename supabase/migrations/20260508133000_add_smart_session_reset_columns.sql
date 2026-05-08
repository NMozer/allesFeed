-- Migration: Add Smart Session Reset columns for TaskFeed
-- Date: 2026-05-08
-- Description: Adds columns for hidden_until, session tracking and reset logic

BEGIN;

-- Add new columns to user_tasks table
ALTER TABLE public.user_tasks
ADD COLUMN IF NOT EXISTS hidden_until      timestamptz,
ADD COLUMN IF NOT EXISTS last_hidden_at    timestamptz,
ADD COLUMN IF NOT EXISTS hidden_count      integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS session_reset_at  timestamptz;

-- Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_tasks_hidden_until 
  ON public.user_tasks (user_id, hidden_until) 
  WHERE hidden_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_tasks_session_reset 
  ON public.user_tasks (user_id, session_reset_at);

-- Optional: Add comment for documentation
COMMENT ON COLUMN public.user_tasks.hidden_until IS 
  'Timestamp until which the task is hidden from the feed (used for "Links = später")';

COMMENT ON COLUMN public.user_tasks.session_reset_at IS 
  'Timestamp of the last session reset (used for Smart Session Reset logic)';

COMMIT;