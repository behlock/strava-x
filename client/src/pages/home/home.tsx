import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'
import combinedGeoData from '@/data/combined'

const Home = () => (
    // @ts-ignore
    <Layout>
      {/* @ts-ignore */}
      {<MapboxHeatmap geoJsonData={combinedGeoData} />}
      {/* {isLoading ? <div className="text-center">Loading...</div> : <MapboxHeatmap geoJsonData={combinedGeoData} />} */}
    </Layout>
  )

export default Home
