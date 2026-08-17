-- Social media post queue for Captain Q
CREATE TABLE IF NOT EXISTS public.social_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'pinterest', 'threads')),
  caption text,
  media_urls text[] DEFAULT '{}',
  hashtags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed', 'cancelled')),
  scheduled_for timestamptz,
  posted_at timestamptz,
  external_post_id text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_social_queue_status ON public.social_queue(status);
CREATE INDEX idx_social_queue_user ON public.social_queue(user_id);
CREATE INDEX idx_social_queue_platform ON public.social_queue(platform, status);
