import { useState } from 'react'

import FilePicker from '@/components/file-picker'
import Header from '@/components/header'
import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'
import { combineGpxFiles } from '@/lib/gpx'

const Home = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [combinedGeoData, setCombinedGeoData] = useState(null)

  const handleFilesSelected = async (selectedFiles: any) => {
    setIsLoading(true)
    const filesArray = Array.from(selectedFiles)
    // @ts-ignore
    const combinedTracks = await combineGpxFiles(filesArray)
    const combinedGeoData = createCombinedGeoData(combinedTracks)
    // @ts-ignore
    setCombinedGeoData(combinedGeoData)
    setIsLoading(false)
  }

  const createCombinedGeoData = (tracks: any) => {
    const features = tracks.map((track: any) => ({
      type: 'Feature',
      geometry: track.geometry,
    }))

    const combinedGeoData = {
      type: 'FeatureCollection',
      features,
    }

    return combinedGeoData
  }

  return (
    // @ts-ignore
    <Layout>
      <Header />
      <div className="flex h-full w-full flex-col">
        <FilePicker onFilesSelected={handleFilesSelected} />
      </div>
      {
        // @ts-ignore
        isLoading && <div className="flex h-full w-full flex-col">Loading...</div>
      }

      {combinedGeoData && <MapboxHeatmap data={combinedGeoData} />}
    </Layout>
  )
}

export default Home
