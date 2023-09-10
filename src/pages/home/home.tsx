import { use, useEffect, useState } from 'react'
import { FilterIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    const combinedGeoData = createCombinedGeoData(activities.map((activity: any) => activity.feature))
    // @ts-ignore
    setCombinedGeoData(combinedGeoData)
  }, [activities])

  // FILTERS
  const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'swimming', 'walking']
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(ACTIVITY_TYPES)

  const filterActivities = (activities: any) => {
    if (selectedActivityTypes === ACTIVITY_TYPES) {
      return activities
    }

    return activities.filter((activity: any) => selectedActivityTypes.includes(activity.type))
  }

  useEffect(() => {
    setActivities(filterActivities(allActivities))
  }, [selectedActivityTypes])

  const DropdownMenuCheckboxes = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">[filters]</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>activity type</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIVITY_TYPES.map((type) => (
          <DropdownMenuCheckboxItem
            key={type}
            checked={selectedActivityTypes.includes(type)}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedActivityTypes([...selectedActivityTypes, type])
              } else {
                setSelectedActivityTypes(selectedActivityTypes.filter((t) => t !== type))
              }
            }}
          >
            {type}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

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

  return (
    // @ts-ignore
    <Layout>
      <Header />
      <div className="flex h-full w-full flex-row">
        <div className="flex h-full w-full flex-col space-y-4">
          <FilePicker onFilesSelected={handleFilesSelected} />
          {isLoading && <div className="flex h-full w-full flex-col">Loading...</div>}
        </div>

        {!isLoading && allActivities.length > 0 && <div>{DropdownMenuCheckboxes}</div>}
      </div>

      {combinedGeoData && <MapboxHeatmap data={combinedGeoData} />}
    </Layout>
  )
}

export default Home
