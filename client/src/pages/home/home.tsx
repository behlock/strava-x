import { useEffect } from 'react'

import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'
import combinedGeoData from '@/data/combined'
import { requestGeoJsonData, useAppDispatch, useAppSelector, fetcher, responseGeoJsonData } from '@/store/actions'
import useSWR from 'swr'

const Home = () => {
  // const dispatch = useAppDispatch()

  // const { data, error } = useSWR('/api/geojsonData', fetcher)

  // useEffect(() => {
  //   dispatch(requestGeoJsonData())

  //   if (error) {
  //     // Handle error
  //   } else if (data) {
  //     dispatch(responseGeoJsonData(data))
  //   }
  // }, [dispatch, data, error])

  // const { geoJsonData, isLoading } = useAppSelector((state) => ({ ...state }))

  return (
    // @ts-ignore
    <Layout>
      {/* @ts-ignore */}
      {<MapboxHeatmap geoJsonData={combinedGeoData} />}
      {/* {isLoading ? <div className="text-center">Loading...</div> : <MapboxHeatmap geoJsonData={combinedGeoData} />} */}
    </Layout>
  )
}

export async function getStaticProps() {
  return { props: {} }
}

export default Home
