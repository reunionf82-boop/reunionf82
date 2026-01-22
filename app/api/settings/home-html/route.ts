import { NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('app_settings')
      .select('id, home_html, home_bg_color')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json(
        { home_html: '', home_bg_color: '' },
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      )
    }

    return NextResponse.json(
      {
        home_html: String((data as any).home_html || ''),
        home_bg_color: String((data as any).home_bg_color || ''),
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch {
    return NextResponse.json(
      { home_html: '', home_bg_color: '' },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  }
}

