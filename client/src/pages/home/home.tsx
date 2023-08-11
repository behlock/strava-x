import Header from '@/components/header'
import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'
import { Button } from '@/components/ui/button'

import { signIn, signOut, useSession } from 'next-auth/react'

const Home = () => {
  const { data, status } = useSession()

  const mapData = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          color: '#ff0000',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-0.1278, 51.5074],
            [-0.1278, 51.5074],
          ],
        },
      },
    ],
  }

  console.log(data)

  return (
    // @ts-ignore
    <Layout>
      <Header />
      {
        // @ts-ignore
        status == 'unauthenticated' ? (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <h1 className="text-center text-3xl font-bold text-gray-800">Please sign in to view your data</h1>
            <Button onClick={() => signIn('strava')}>Sign in</Button>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <h1 className="text-center text-3xl font-bold text-gray-800">Please sign in to view your data</h1>
            <Button onClick={() => signOut()}>Sign out</Button>
          </div>
        )
      }

      <MapboxHeatmap data={mapData} />
    </Layout>
  )
}

export default Home
