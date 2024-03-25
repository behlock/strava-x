'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, ChevronDown } from 'lucide-react'

import Instructions from '@/components/instructions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Header from '@/components/header'
import Layout from '@/components/layout'
import MapboxHeatmap from '@/components/mapbox-heatmap'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Slider } from '@/components/ui/slider'

import { combineFiles } from '@/lib/gps'
import { Activity } from '@/models/activity'

const Home = () => {
  // LOADING
  const [isLoading, setIsLoading] = useState<boolean>(false)

  // PANELS
  const [isInstructionsPanelOpen, setIsInstructionsPanelOpen] = useState<boolean>(true)
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState<boolean>(true)

  // DATA
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [combinedGeoData, setCombinedGeoData] = useState<any>(null)

  useEffect(() => {
    if (allActivities.length > 0) {
      setActivities(allActivities)
      setSelectedDate(allActivities[allActivities.length - 1]?.date?.getTime() || new Date().getTime())
    }
  }, [allActivities])

  useEffect(() => {
    const combinedGeoData = createCombinedGeoData(activities.map((activity: any) => activity.feature))
    setCombinedGeoData(combinedGeoData)
  }, [activities])

  // FILTERS
  const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking']
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(ACTIVITY_TYPES)
  const [selectedDate, setSelectedDate] = useState<number>(0)

  const filterByActivityType = (activity: Activity) => {
    return selectedActivityTypes.includes(activity.type as string)
  }

  const filterByDate = (activity: Activity) => {
    if (activity.date === undefined) {
      return false
    }
    return activity.date.getTime() <= selectedDate
  }

  const filterActivities = (activities: Activity[]) => {
    return activities.filter((activity) => filterByActivityType(activity) && filterByDate(activity))
  }

  useEffect(() => {
    setActivities(filterActivities(allActivities))
  }, [selectedActivityTypes, selectedDate])

  const DropdownMenuCheckboxes = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-fit pl-0 hover:bg-none">
          <div className="flex flex-row justify-center space-x-2 text-center align-middle">
            <span className="text-base font-normal">activities</span>
            <ChevronDown className="mt-1 h-4 w-4" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 pl-8">
        <DropdownMenuLabel>type</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIVITY_TYPES.map((type) => (
          <DropdownMenuCheckboxItem
            className="cursor-pointer"
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

  const TimelineSlider = (
    <Slider
      min={allActivities[0]?.date?.getTime()}
      max={allActivities[allActivities.length - 1]?.date?.getTime()}
      step={1000 * 60 * 60}
      defaultValue={[selectedDate]}
      value={[selectedDate]}
      onValueChange={(value) => {
        setSelectedDate(value[0])
      }}
      className="h-fit w-36"
    />
  )

  const handleFilesSelected = async (selectedFiles: any) => {
    resetState()
    setIsLoading(true)
    const filesArray = Array.from(selectedFiles)
    resetState()
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

  const resetState = () => {
    setAllActivities([])
    setActivities([])
    setCombinedGeoData(null)
    setSelectedActivityTypes(ACTIVITY_TYPES)
    setSelectedDate(0)
  }

  return (
    // @ts-ignore
    <Layout>
      <Header />
      <div className="flex h-full w-full flex-row">
        <div className="flex h-full w-full flex-col space-y-4">
          {/* <About isOpen={isAboutPanelOpen} onOpenChange={setIsAboutPanelOpen} /> */}
          <Instructions
            onFilesSelected={handleFilesSelected}
            isOpen={isInstructionsPanelOpen}
            onOpenChange={setIsInstructionsPanelOpen}
          />
          {isLoading && <div className="flex h-full w-full flex-col">[loading...]</div>}
          {allActivities.length > 0 && (
            <Collapsible
              className="flex flex-grow flex-col"
              open={isFiltersPanelOpen}
              onOpenChange={setIsFiltersPanelOpen}
            >
              <CollapsibleTrigger>
                <div className="flex">
                  <span>[filters]</span>
                  {isFiltersPanelOpen ? <ArrowDown className="ml-2" /> : <ArrowRight className="ml-2" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-row items-center  space-x-4">
                  {DropdownMenuCheckboxes}
                  <div className="flex h-fit flex-row items-center space-x-2">
                    <span className="h-fit text-base font-normal">timeline</span>
                    {TimelineSlider}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>

      {!isLoading && allActivities.length > 0 && <MapboxHeatmap data={combinedGeoData} />}
    </Layout>
  )
}

export default Home
