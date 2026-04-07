import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

/** Pseudo → email interne Supabase */
export const toEmail = (pseudo: string) =>
  `${pseudo.trim().toLowerCase()}@octrack.app`

/** Email interne → pseudo affiché */
export const fromEmail = (email: string) =>
  email.replace(/@octrack\.app$/, '')
