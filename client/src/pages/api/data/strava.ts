import type { NextApiRequest, NextApiResponse } from 'next'
import { getSession } from 'next-auth/react'

import corsMiddleware from '@/utils/corsMiddleware'
import { config } from '@/utils/config'
import { Session } from '@/models/session'

const getStravaActivities = async (session: Session | null) => {
  const res = await fetch(`${config.STRAVA_API_URL}/playlists/${config.SPOTIFY_KEY_PLAYLIST}/tracks`, {
    headers: {
      Authorization: `Bearer ${session?.user?.accessToken}`,
    },
  }).then((res) => res.json())

  return res
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await corsMiddleware(req, res)
  const session = await getSession({ req })

  let activities = await getStravaActivities(session)
  res.status(200).json(activities)
}
