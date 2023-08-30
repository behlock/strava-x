import React from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// @ts-ignore
const FilePicker = ({ onFilesSelected }) => {
  const handleFileSelect = (event: any) => {
    const selectedFiles = event.target.files
    onFilesSelected(selectedFiles)
  }

  return (
    <div className="flex flex-col items-start">
      <Collapsible className="flex flex-grow flex-col ">
        <CollapsibleTrigger>
          <div className="flex">
            <text>[instructions]</text>
            <ArrowDown className="ml-2" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col ">
            <div className="flex flex-col space-y-1 ">
              <text>
                1. head over to your{' '}
                <a
                  className="text-blue-500"
                  href="https://www.strava.com/athlete/delete_your_account"
                  target="_blank"
                  rel="noreferrer"
                >
                  strava profile settings
                </a>{' '}
                and request your archive
              </text>
              <div className="flex flex-row space-x-1">
                <text>2. once available, unzip the downloaded file and</text>
                <div className="flex w-fit flex-none cursor-pointer items-center justify-end">
                  <Label htmlFor="gpx">
                    <div className="flex items-center justify-center align-middle">
                      <ArrowUpRight className="mr-1" />
                      <text className="text-base font-bold">pick the activities folder</text>
                    </div>
                  </Label>
                  <Input
                    className="hidden"
                    id="gpx"
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    // @ts-ignore
                    webkitdirectory="true"
                    directory="true"
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export default FilePicker
