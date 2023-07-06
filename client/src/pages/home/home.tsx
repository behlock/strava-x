import Header from '@/components/header'
import Layout from '@/components/layout'

const Home = () => (
  // @ts-ignore
  <Layout>
    {/* @ts-ignore */}
    <Header />
  </Layout>
)

export async function getStaticProps() {
  return { props: {} }
}

export default Home
