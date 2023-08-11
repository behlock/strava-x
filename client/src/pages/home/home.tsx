import Header from '@/components/header'
import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'

const Home = () => {
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

  return (
    // @ts-ignore
    <Layout>
      <Header />
      <MapboxHeatmap data={mapData} />
    </Layout>
  )
}

export default Home
