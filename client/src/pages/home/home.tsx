import Header from '@/components/header'
import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'

const Home = () => (
  // @ts-ignore
  <Layout>
    <Header />
    <MapboxHeatmap />
  </Layout>
)

export default Home
