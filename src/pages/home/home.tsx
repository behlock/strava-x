import { use, useEffect, useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import FilePicker from '@/components/file-picker'
import Header from '@/components/header'
import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'
import { combineFiles } from '@/lib/gps'

const Home = () => {
  // LOADING
  const [isLoading, setIsLoading] = useState(false)

  // DATA
  const [allActivities, setAllActivities] = useState([])
  const [activities, setActivities] = useState([])
  const [combinedGeoData, setCombinedGeoData] = useState(null)

  useEffect(() => {
    if (allActivities.length > 0) {
      setActivities(allActivities)
    }
  }, [allActivities])

  useEffect(() => {
    if (activities.length > 0) {
      const combinedGeoData = createCombinedGeoData(activities.map((activity: any) => activity.feature))
      // @ts-ignore
      setCombinedGeoData(combinedGeoData)
    }
  }, [activities])

  // FILTERS
  const [selectedActivityType, setSelectedActivityType] = useState('all')

  const filterActivities = (activities: any) => {
    if (selectedActivityType === 'all') {
      return activities
    }

    return activities.filter((activity: any) => activity.type === selectedActivityType)
  }

  useEffect(() => {
    setActivities(filterActivities(allActivities))
  }, [selectedActivityType])

  const handleFilesSelected = async (selectedFiles: any) => {
    setIsLoading(true)
    const filesArray = Array.from(selectedFiles)
    // @ts-ignore
    setAllActivities(await combineFiles(filesArray))
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

  const activityTypes = ['all', 'running', 'cycling']

  return (
    // @ts-ignore
    <Layout>
      <Header />
      <div className="flex h-full w-full flex-row">
        <div className="flex h-full w-full flex-col space-y-4">
          <FilePicker onFilesSelected={handleFilesSelected} />
          {isLoading && <div className="flex h-full w-full flex-col">Loading...</div>}
        </div>

        {!isLoading && allActivities.length > 0 && (
          <div className="flex w-fit flex-row justify-center space-x-4 text-center align-middle">
            {activityTypes.map((activityType) => (
              <div
                className="flex h-fit w-fit flex-row justify-center space-x-2 text-center align-middle"
                key={activityType}
              >
                <Checkbox
                  key={activityType}
                  checked={selectedActivityType === activityType}
                  onCheckedChange={() => setSelectedActivityType(activityType)}
                  className="mt-1 h-4 w-4"
                />
                <span className="h-fit w-fit">{activityType}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {combinedGeoData && <MapboxHeatmap data={combinedGeoData} />}
    </Layout>
  )
}

export default Home
